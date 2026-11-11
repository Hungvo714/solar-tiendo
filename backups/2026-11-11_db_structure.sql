-- SAO LƯU CẤU TRÚC CSDL (hàm, trigger, policy, cột) — 2026-11-11, trước khi thêm copy kế hoạch thi công
-- Code tương ứng: nhánh GitHub backup/2026-11-11-truoc-copy-ke-hoach (commit 40f3054)
-- Chỉ là bản tham chiếu cấu trúc, KHÔNG chứa dữ liệu. Dữ liệu được sao lưu qua email hằng tuần.

-- FUNCTIONS

CREATE OR REPLACE FUNCTION public.add_project_item(pid uuid, p_name text, p_zone text, p_group text, p_weight integer, p_steps jsonb, p_depends uuid[] DEFAULT '{}'::uuid[], p_order_days integer DEFAULT 7, p_after uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_stt int; v_sort numeric; v_after numeric; v_next numeric; s jsonb; i int := 0;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Thiếu tên hạng mục'; end if;
  if p_group not in ('A','B','C') then raise exception 'Nhóm phải là A, B hoặc C'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'Cần ít nhất 1 bước';
  end if;

  select coalesce(max(stt), 0) + 1 into v_stt
  from public.items where project_id is null or project_id = pid;

  if p_after is null then
    select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.items where project_id is null or project_id = pid;
  else
    select sort_order into v_after from public.items
    where id = p_after and (project_id is null or project_id = pid);
    if v_after is null then raise exception 'Mục "chèn sau" không thuộc dự án'; end if;
    select min(sort_order) into v_next from public.items
    where (project_id is null or project_id = pid) and sort_order > v_after;
    v_sort := case when v_next is null then v_after + 1 else (v_after + v_next) / 2 end;
  end if;

  insert into public.items (stt, name, zone_id, weight, sort_order, group_type, order_days, project_id)
  values (v_stt, trim(p_name), p_zone, greatest(coalesce(p_weight, 10), 1), v_sort, p_group, coalesce(p_order_days, 7), pid)
  returning id into v_id;

  for s in select * from jsonb_array_elements(p_steps) loop
    if coalesce(trim(s->>'name'), '') <> '' then
      insert into public.steps (item_id, step_index, name, weight, sort_order)
      values (v_id, i, trim(s->>'name'), greatest(coalesce((s->>'weight')::int, 10), 1), i);
      i := i + 1;
    end if;
  end loop;
  if i = 0 then raise exception 'Cần ít nhất 1 bước có tên'; end if;

  insert into public.project_item_settings (project_id, item_id, order_days)
  values (pid, v_id, coalesce(p_order_days, 7)) on conflict do nothing;

  perform public.set_item_dependencies(pid, v_id, p_depends);
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_user(target_user uuid, target_project uuid, target_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.set_membership(target_user, target_project, coalesce(target_role, 'editor'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_add_super_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into project_members (project_id, user_id, role)
  values (NEW.id, 'a3dfe8a8-87d7-43a6-b76b-e740a3714825', 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_project_copy(p_src uuid, p_name text, p_client text, p_contractor text, p_start date, p_total_days integer, p_location text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new uuid; v_uid uuid := auth.uid();
  r record; v_id uuid;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if not (public.is_super_admin() or public.is_project_admin(p_src)) then
    raise exception 'Chỉ Admin của dự án nguồn (hoặc Admin chính) được sao chép';
  end if;
  if not exists (select 1 from public.projects where id = p_src) then raise exception 'Không tìm thấy dự án nguồn'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Thiếu tên dự án'; end if;

  insert into public.projects (name, client, contractor, start_date, total_days, location, created_by)
  values (trim(p_name), nullif(trim(p_client), ''), nullif(trim(p_contractor), ''),
          coalesce(p_start, (now() at time zone 'Asia/Ho_Chi_Minh')::date), coalesce(p_total_days, 60),
          nullif(trim(p_location), ''), v_uid)
  returning id into v_new;
  insert into public.project_members (project_id, user_id, role) values (v_new, v_uid, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';

  delete from public.sub_items                 where project_id = v_new;
  delete from public.project_item_settings     where project_id = v_new;
  delete from public.project_item_dependencies where project_id = v_new;

  drop table if exists _imap;
  create temp table _imap (old_id uuid primary key, new_id uuid) on commit drop;
  drop table if exists _smap;
  create temp table _smap (old_id uuid primary key, new_id uuid) on commit drop;
  drop table if exists _vmap;
  create temp table _vmap (old_id uuid primary key, new_id uuid) on commit drop;

  for r in select * from public.items where project_id = p_src loop
    insert into public.items (stt, name, zone_id, weight, sort_order, group_type, order_days, volume, unit, project_id)
    values (r.stt, r.name, r.zone_id, r.weight, r.sort_order, r.group_type, r.order_days, r.volume, r.unit, v_new)
    returning id into v_id;
    insert into _imap values (r.id, v_id);
  end loop;
  insert into _imap select id, id from public.items where project_id is null;

  for r in select s.* from public.steps s join public.items i on i.id = s.item_id
           where s.project_id = p_src or (i.project_id = p_src) loop
    insert into public.steps (item_id, step_index, name, weight, sort_order, project_id)
    values ((select new_id from _imap where old_id = r.item_id), r.step_index, r.name, r.weight, r.sort_order,
            case when r.project_id is null then null else v_new end)
    returning id into v_id;
    insert into _smap values (r.id, v_id);
  end loop;
  insert into _smap select s.id, s.id from public.steps s join public.items i on i.id = s.item_id
    where s.project_id is null and i.project_id is null;

  insert into public.project_item_settings (project_id, item_id, order_days, hidden)
  select v_new, m.new_id, x.order_days, x.hidden
  from public.project_item_settings x join _imap m on m.old_id = x.item_id
  where x.project_id = p_src;

  insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id, lag_days)
  select v_new, a.new_id, b.new_id, d.lag_days
  from public.project_item_dependencies d
  join _imap a on a.old_id = d.item_id join _imap b on b.old_id = d.depends_on_item_id
  where d.project_id = p_src;

  insert into public.project_step_settings (project_id, step_id, name, weight, hidden, sort, qty_total, qty_unit)
  select v_new, m.new_id, x.name, x.weight, x.hidden, x.sort, x.qty_total, x.qty_unit
  from public.project_step_settings x join _smap m on m.old_id = x.step_id
  where x.project_id = p_src;

  for r in select * from public.sub_items where project_id = p_src loop
    insert into public.sub_items (item_id, name, unit, quantity, note, sort_order, project_id)
    values ((select new_id from _imap where old_id = r.item_id), r.name, r.unit, r.quantity, r.note, r.sort_order, v_new)
    returning id into v_id;
    insert into _vmap values (r.id, v_id);
  end loop;

  insert into public.step_qty_materials (project_id, step_id, sub_item_id)
  select v_new, s.new_id, v.new_id
  from public.step_qty_materials q join _smap s on s.old_id = q.step_id join _vmap v on v.old_id = q.sub_item_id
  where q.project_id = p_src;

  return v_new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_shared_project(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr public.projects;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into pr from public.projects where share_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'project',  jsonb_build_object(
                  'id', pr.id, 'name', pr.name, 'client', pr.client, 'factory', pr.factory,
                  'contractor', pr.contractor, 'start_date', pr.start_date, 'total_days', pr.total_days,
                  'capacity_kwp', pr.capacity_kwp, 'panel_count', pr.panel_count, 'location', pr.location),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', g.id, 'project_id', g.project_id, 'step_id', g.step_id, 'is_done', g.is_done,
                  'is_na', g.is_na, 'done_at', g.done_at, 'progress_pct', g.progress_pct))
                  from public.progress g where g.project_id = pr.id), '[]'::jsonb),
    'gantt',    coalesce((select jsonb_agg(to_jsonb(d)) from public.gantt_dates d where d.project_id = pr.id), '[]'::jsonb),
    'items',    coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
                    'order_days', coalesce(s.order_days, i.order_days),
                    'steps', coalesce((
                       select jsonb_agg(to_jsonb(st) || jsonb_build_object(
                                'name', coalesce(o.name, st.name), 'weight', coalesce(o.weight, st.weight))
                              order by coalesce(o.sort, st.sort_order::numeric), st.step_index)
                       from public.steps st
                       left join public.project_step_settings o on o.project_id = pr.id and o.step_id = st.id
                       where st.item_id = i.id and (st.project_id is null or st.project_id = pr.id)
                         and not coalesce(o.hidden, false)), '[]'::jsonb))
                  order by i.sort_order, i.stt)
                  from public.items i
                  left join public.project_item_settings s on s.project_id = pr.id and s.item_id = i.id
                  where (i.project_id is null or i.project_id = pr.id) and not coalesce(s.hidden, false)), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_admin_role() or public.is_super_admin()) then
    raise exception 'Không có quyền';
  end if;
  return (select id from auth.users where lower(email) = lower(user_email) limit 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, phone, company, status)
  values (new.id, new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company',
    'pending')
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.project_members
                 where user_id = auth.uid() and role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.has_edit_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.project_members
                 where user_id = auth.uid() and role in ('admin','editor'))
         or exists (select 1 from public.app_admins where user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_admin(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid() and role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_editor(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid() and role in ('admin','editor'))
         or exists (select 1 from public.app_admins where user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_member(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.last_user_activity()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select max(t) from (
    select max(last_sign_in_at) t from auth.users
    union all select max(updated_at) from public.progress
    union all select max(updated_at) from public.gantt_dates
    union all select max(done_at)    from public.sub_items
    union all select max(created_at) from public.weekly_reports
    union all select max(updated_at) from public.project_item_settings
    union all select max(added_at)   from public.project_members
  ) x;
$function$
;

CREATE OR REPLACE FUNCTION public.list_all_projects()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  return query select pr.id, pr.name::text from public.projects pr order by pr.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_all_users()
 RETURNS TABLE(user_id uuid, email text, full_name text, phone text, company text, status text, is_super_admin boolean, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, memberships jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'Chỉ Admin chính mới xem được danh sách người dùng';
  end if;
  return query
  select
    u.id, u.email::text, p.full_name, p.phone, p.company,
    coalesce(p.status, 'approved'),
    exists (select 1 from public.app_admins a where a.user_id = u.id),
    u.created_at, u.last_sign_in_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'project_id', m.project_id, 'project_name', pr.name, 'role', m.role
      ) order by pr.name)
      from public.project_members m join public.projects pr on pr.id = m.project_id
      where m.user_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by (coalesce(p.status,'approved') = 'pending') desc, u.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.move_project_item(pid uuid, p_item uuid, p_after uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_after numeric; v_next numeric;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if not exists (select 1 from public.items where id = p_item and project_id = pid) then
    raise exception 'Chỉ đổi vị trí được hạng mục thêm riêng';
  end if;
  select sort_order into v_after from public.items where id = p_after and (project_id is null or project_id = pid);
  if v_after is null then raise exception 'Mục mốc không thuộc dự án'; end if;
  select min(sort_order) into v_next from public.items
  where (project_id is null or project_id = pid) and sort_order > v_after and id <> p_item;
  update public.items set sort_order = case when v_next is null then v_after + 1 else (v_after + v_next) / 2 end
  where id = p_item;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_pending_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_secret text; v_url text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  select value into v_secret from public.app_meta where key = 'notify_secret';
  select value into v_url    from public.app_meta where key = 'notify_url';
  if v_secret is null or v_url is null then return new; end if;
  -- Gửi bất đồng bộ (sau khi giao dịch hoàn tất); lỗi mạng không làm hỏng việc đăng ký
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('user_id', new.id, 'secret', v_secret,
                                  'event', case when tg_op = 'UPDATE' then 'reapply' else 'signup' end),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  return new;
exception when others then
  return new;   -- tuyệt đối không chặn đăng ký vì lỗi thông báo
end;
$function$
;

CREATE OR REPLACE FUNCTION public.project_is_new(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (select 1 from public.project_members m
                     where m.project_id = pid
                       and m.user_id not in (select user_id from public.app_admins));
$function$
;

CREATE OR REPLACE FUNCTION public.protect_super_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if OLD.user_id = 'a3dfe8a8-87d7-43a6-b76b-e740a3714825' then
    NEW.role = 'admin';
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_super_admin_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.user_id in (select user_id from public.app_admins)
     and exists (select 1 from public.projects where id = old.project_id)
     and not public.is_super_admin() then
    raise exception 'Không thể gỡ Admin chính khỏi dự án';
  end if;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.qty_log_authors(pid uuid)
 RETURNS TABLE(user_id uuid, label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct l.created_by, coalesce(p.full_name, split_part(p.email, '@', 1))
  from public.step_qty_logs l left join public.profiles p on p.id = l.created_by
  where l.project_id = pid and (public.is_project_member(pid) or public.is_super_admin());
$function$
;

CREATE OR REPLACE FUNCTION public.recalc_step_qty(pid uuid, sid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_total numeric; v_sum numeric; v_pct numeric; v_first date; v_item uuid; v_nmat int;
begin
  if not exists (select 1 from public.projects where id = pid) then return; end if;
  select item_id into v_item from public.steps where id = sid;
  if v_item is null then return; end if;

  select count(*) into v_nmat from public.step_qty_materials where project_id = pid and step_id = sid;

  if v_nmat > 0 then
    select avg(least(100, greatest(0,
             coalesce((select sum(l.qty) from public.step_qty_logs l
                       where l.project_id = pid and l.step_id = sid and l.sub_item_id = m.sub_item_id), 0)
             / s.quantity * 100)))
      into v_pct
    from public.step_qty_materials m join public.sub_items s on s.id = m.sub_item_id
    where m.project_id = pid and m.step_id = sid and s.quantity > 0;
    v_pct := round(coalesce(v_pct, 0), 2);
    select min(log_date) into v_first from public.step_qty_logs
      where project_id = pid and step_id = sid and sub_item_id in
        (select sub_item_id from public.step_qty_materials where project_id = pid and step_id = sid);
  else
    select qty_total into v_total from public.project_step_settings where project_id = pid and step_id = sid;
    if v_total is null or v_total <= 0 then
      update public.progress set progress_pct = null, updated_at = now() where project_id = pid and step_id = sid;
      return;
    end if;
    select coalesce(sum(qty), 0), min(log_date) into v_sum, v_first
    from public.step_qty_logs where project_id = pid and step_id = sid and sub_item_id is null;
    v_pct := greatest(0, least(100, round(v_sum / v_total * 100, 2)));
  end if;

  insert into public.progress (project_id, step_id, is_done, is_na, progress_pct, done_at, updated_at)
  values (pid, sid, v_pct >= 100, false, v_pct, case when v_pct >= 100 then now() end, now())
  on conflict (project_id, step_id) do update
    set progress_pct = excluded.progress_pct,
        is_done      = excluded.is_done,
        is_na        = false,
        done_at      = case when excluded.is_done then coalesce(public.progress.done_at, now()) else null end,
        updated_at   = now();

  if v_first is not null then
    insert into public.gantt_dates (project_id, item_id, actual_start, updated_at)
    values (pid, v_item, v_first, now())
    on conflict (project_id, item_id) do update
      set actual_start = coalesce(public.gantt_dates.actual_start, excluded.actual_start),
          updated_at = case when public.gantt_dates.actual_start is null then now() else public.gantt_dates.updated_at end;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.regenerate_share_token(pid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if not public.is_super_admin() then
    raise exception 'Chỉ Admin chính mới đổi được link';
  end if;
  update public.projects set share_token = t where id = pid;
  return t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_user(target_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  update public.profiles set status = 'rejected' where id = target_user;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_reapproval(p_full_name text, p_phone text, p_company text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'rejected') then
    raise exception 'Tài khoản không ở trạng thái bị từ chối';
  end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Vui lòng nhập họ tên'; end if;
  update public.profiles
     set status     = 'pending',
         full_name  = trim(p_full_name),
         phone      = nullif(trim(p_phone), ''),
         company    = nullif(trim(p_company), ''),
         created_at = now()          -- đưa lên đầu danh sách chờ duyệt
   where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_item_steps(pid uuid, p_item uuid, p_steps jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it public.items; s jsonb; idx int := 0; v_id uuid; st public.steps; v_name text; v_w int;
        v_hidden boolean; v_del boolean; visible_count int;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  select * into it from public.items where id = p_item and (project_id is null or project_id = pid);
  if not found then raise exception 'Hạng mục không thuộc dự án'; end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'Dữ liệu bước không hợp lệ'; end if;

  for s in select * from jsonb_array_elements(p_steps) loop
    v_name   := nullif(trim(coalesce(s->>'name', '')), '');
    v_w      := greatest(1, coalesce((s->>'weight')::int, 10));
    v_hidden := coalesce((s->>'hidden')::boolean, false);
    v_del    := coalesce((s->>'delete')::boolean, false);
    v_id     := nullif(s->>'id', '')::uuid;

    if v_id is null then
      if v_del or v_name is null then continue; end if;
      insert into public.steps (item_id, step_index, name, weight, sort_order, project_id)
      values (p_item, 1000 + idx, v_name, v_w, idx, case when it.project_id is null then pid else null end)
      returning id into v_id;
      insert into public.project_step_settings (project_id, step_id, sort, hidden)
      values (pid, v_id, idx, v_hidden);
    else
      select * into st from public.steps where id = v_id and item_id = p_item and (project_id is null or project_id = pid);
      if not found then raise exception 'Bước không thuộc hạng mục'; end if;

      if v_del then
        if (st.project_id = pid or it.project_id = pid)
           and not exists (select 1 from public.progress p where p.step_id = v_id and (p.is_done or p.is_na)) then
          delete from public.steps where id = v_id;
          continue;
        end if;
        v_hidden := true;
      end if;

      insert into public.project_step_settings (project_id, step_id, name, weight, hidden, sort, updated_at)
      values (pid, v_id,
              case when v_name is distinct from st.name then v_name end,
              case when v_w is distinct from st.weight then v_w end,
              v_hidden, idx, now())
      on conflict (project_id, step_id) do update
        set name = excluded.name, weight = excluded.weight, hidden = excluded.hidden,
            sort = excluded.sort, updated_at = now();
    end if;
    idx := idx + 1;
  end loop;

  select count(*) into visible_count
  from public.steps x
  left join public.project_step_settings o on o.project_id = pid and o.step_id = x.id
  where x.item_id = p_item and (x.project_id is null or x.project_id = pid) and not coalesce(o.hidden, false);
  if visible_count = 0 then raise exception 'Hạng mục phải còn ít nhất 1 bước'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_project_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.sub_items (item_id, name, unit, quantity, note, need_date, sort_order, project_id)
  select item_id, name, unit, quantity, note, need_date, sort_order, new.id
  from public.sub_items where project_id is null;

  insert into public.project_item_settings (project_id, item_id, order_days)
  select new.id, id, coalesce(order_days, 7) from public.items where project_id is null
  on conflict do nothing;

  insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id)
  select new.id, a.id, b.id
  from public.item_dependencies d
  join public.items a on a.stt = d.item_stt       and a.project_id is null
  join public.items b on b.stt = d.depends_on_stt and b.project_id is null
  on conflict do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_item_dependencies(pid uuid, p_item uuid, p_depends uuid[], p_lags integer[] DEFAULT NULL::integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if exists (select 1 from unnest(coalesce(p_depends, '{}')) d(id)
             where not exists (select 1 from public.items i where i.id = d.id and (i.project_id is null or i.project_id = pid))) then
    raise exception 'Có mục điều kiện không thuộc dự án';
  end if;
  delete from public.project_item_dependencies where project_id = pid and item_id = p_item;
  insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id, lag_days)
  select pid, p_item, d.id, greatest(0, least(365, coalesce(p_lags[d.ord], 0)))
  from unnest(coalesce(p_depends, '{}')) with ordinality d(id, ord)
  where d.id <> p_item
  on conflict do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_item_hidden(pid uuid, p_item uuid, p_hidden boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if not exists (select 1 from public.items where id = p_item and (project_id is null or project_id = pid)) then
    raise exception 'Hạng mục không thuộc dự án';
  end if;
  insert into public.project_item_settings (project_id, item_id, hidden)
  values (pid, p_item, p_hidden)
  on conflict (project_id, item_id) do update set hidden = excluded.hidden, updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_membership(target_user uuid, target_project uuid, target_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if target_role is null or target_role = 'none' then
    delete from public.project_members where project_id = target_project and user_id = target_user;
    return;
  end if;
  if target_role not in ('admin','editor','viewer') then raise exception 'Vai trò không hợp lệ'; end if;
  insert into public.project_members (project_id, user_id, role)
  values (target_project, target_user, target_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  update public.profiles set status = 'approved' where id = target_user and status <> 'approved';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_step_materials(pid uuid, sid uuid, p_subs uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_super_admin() or public.is_project_admin(pid)) then
    raise exception 'Chỉ Admin dự án hoặc Admin chính';
  end if;
  if not exists (select 1 from public.steps s join public.items i on i.id = s.item_id
                 where s.id = sid and (s.project_id is null or s.project_id = pid)
                   and (i.project_id is null or i.project_id = pid)) then
    raise exception 'Bước không thuộc dự án';
  end if;
  if exists (select 1 from unnest(coalesce(p_subs, '{}')) x
             where not exists (select 1 from public.sub_items si where si.id = x and si.project_id = pid)) then
    raise exception 'Vật tư không thuộc dự án';
  end if;

  delete from public.step_qty_materials
   where project_id = pid and step_id = sid and not (sub_item_id = any(coalesce(p_subs, '{}')));
  insert into public.step_qty_materials (project_id, step_id, sub_item_id)
  select pid, sid, x from unnest(coalesce(p_subs, '{}')) x
  on conflict do nothing;

  if coalesce(array_length(p_subs, 1), 0) > 0 then
    update public.project_step_settings set qty_total = null, updated_at = now()
     where project_id = pid and step_id = sid;
  end if;
  perform public.recalc_step_qty(pid, sid);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_step_quantity(pid uuid, sid uuid, p_total numeric, p_unit text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_super_admin() or public.is_project_admin(pid)) then
    raise exception 'Chỉ Admin dự án hoặc Admin chính';
  end if;
  if not exists (select 1 from public.steps s join public.items i on i.id = s.item_id
                 where s.id = sid and (s.project_id is null or s.project_id = pid)
                   and (i.project_id is null or i.project_id = pid)) then
    raise exception 'Bước không thuộc dự án';
  end if;
  if p_total is not null and p_total <= 0 then raise exception 'Tổng khối lượng phải lớn hơn 0'; end if;
  delete from public.step_qty_materials where project_id = pid and step_id = sid;
  insert into public.project_step_settings (project_id, step_id, qty_total, qty_unit, updated_at)
  values (pid, sid, p_total, nullif(trim(p_unit), ''), now())
  on conflict (project_id, step_id) do update
    set qty_total = excluded.qty_total, qty_unit = excluded.qty_unit, updated_at = now();
  perform public.recalc_step_qty(pid, sid);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_step_qty_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.recalc_step_qty(old.project_id, old.step_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.recalc_step_qty(new.project_id, new.step_id); end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_step_qty_materials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then perform public.recalc_step_qty(old.project_id, old.step_id);
  else perform public.recalc_step_qty(new.project_id, new.step_id); end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sub_items_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if new.quantity is distinct from old.quantity then
    for r in select project_id, step_id from public.step_qty_materials where sub_item_id = new.id loop
      perform public.recalc_step_qty(r.project_id, r.step_id);
    end loop;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_profile(target_user uuid, p_full_name text, p_phone text, p_company text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_super_admin() or target_user = auth.uid()) then raise exception 'Không có quyền'; end if;
  update public.profiles
     set full_name = nullif(trim(p_full_name), ''),
         phone     = nullif(trim(p_phone), ''),
         company   = nullif(trim(p_company), '')
   where id = target_user;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_project_item(p_item uuid, p_name text, p_zone text, p_weight integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  update public.items
     set name = coalesce(nullif(trim(p_name), ''), name),
         zone_id = coalesce(p_zone, zone_id),
         weight = greatest(coalesce(p_weight, weight), 1)
   where id = p_item and project_id is not null;
  if not found then raise exception 'Chỉ sửa được hạng mục thêm riêng'; end if;
end;
$function$
;

-- TRIGGERS

CREATE TRIGGER trigger_auto_add_super_admin AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION auto_add_super_admin();

CREATE TRIGGER trigger_protect_super_admin BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION protect_super_admin();

CREATE TRIGGER trigger_seed_project_defaults AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION seed_project_defaults();

CREATE TRIGGER trigger_notify_pending_profile AFTER INSERT OR UPDATE OF status ON public.profiles FOR EACH ROW EXECUTE FUNCTION notify_pending_profile();

CREATE TRIGGER step_qty_logs_recalc AFTER INSERT OR DELETE OR UPDATE ON public.step_qty_logs FOR EACH ROW EXECUTE FUNCTION trg_step_qty_logs();

CREATE TRIGGER step_qty_materials_recalc AFTER INSERT OR DELETE ON public.step_qty_materials FOR EACH ROW EXECUTE FUNCTION trg_step_qty_materials();

CREATE TRIGGER sub_items_qty_recalc AFTER UPDATE OF quantity ON public.sub_items FOR EACH ROW EXECUTE FUNCTION trg_sub_items_qty();

CREATE TRIGGER trigger_protect_super_admin_delete BEFORE DELETE ON public.project_members FOR EACH ROW EXECUTE FUNCTION protect_super_admin_delete();

-- POLICIES

create policy pis_read on public.project_item_settings as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy pis_write on public.project_item_settings as PERMISSIVE for ALL to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy sub_items_write on public.sub_items as PERMISSIVE for ALL to authenticated using (
CASE
    WHEN (project_id IS NULL) THEN is_super_admin()
    ELSE is_project_editor(project_id)
END) with check (
CASE
    WHEN (project_id IS NULL) THEN is_super_admin()
    ELSE is_project_editor(project_id)
END);

create policy sub_items_read on public.sub_items as PERMISSIVE for SELECT to authenticated using (((project_id IS NULL) OR is_project_member(project_id) OR is_super_admin()));

create policy labor_allocation_read on public.labor_allocation as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy project_labor_days_read on public.project_labor_days as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy labor_productivity_read on public.labor_productivity as PERMISSIVE for SELECT to authenticated using (((project_id IS NULL) OR is_project_member(project_id) OR is_super_admin()));

create policy items_read on public.items as PERMISSIVE for SELECT to public using (((project_id IS NULL) OR is_project_member(project_id) OR is_super_admin()));

create policy "Members can view project" on public.projects as PERMISSIVE for SELECT to public using ((id IN ( SELECT project_members.project_id
   FROM project_members
  WHERE (project_members.user_id = auth.uid()))));

create policy "Members can view progress" on public.progress as PERMISSIVE for SELECT to public using ((project_id IN ( SELECT project_members.project_id
   FROM project_members
  WHERE (project_members.user_id = auth.uid()))));

create policy "Members can view gantt" on public.gantt_dates as PERMISSIVE for SELECT to public using ((project_id IN ( SELECT project_members.project_id
   FROM project_members
  WHERE (project_members.user_id = auth.uid()))));

create policy "Public read zones" on public.zones as PERMISSIVE for SELECT to public using (true);

create policy "Admin can update project" on public.projects as PERMISSIVE for UPDATE to public using ((id IN ( SELECT project_members.project_id
   FROM project_members
  WHERE ((project_members.user_id = auth.uid()) AND (project_members.role = 'admin'::text)))));

create policy weekly_reports_read on public.weekly_reports as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy weekly_reports_write on public.weekly_reports as PERMISSIVE for ALL to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy risk_log_read on public.risk_log as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy risk_log_write on public.risk_log as PERMISSIVE for ALL to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy projects_super_read on public.projects as PERMISSIVE for SELECT to authenticated using (is_super_admin());

create policy progress_super_read on public.progress as PERMISSIVE for SELECT to authenticated using (is_super_admin());

create policy gantt_super_read on public.gantt_dates as PERMISSIVE for SELECT to authenticated using (is_super_admin());

create policy "Public read dependencies" on public.item_dependencies as PERMISSIVE for SELECT to public using (true);

create policy profiles_select on public.profiles as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR is_super_admin() OR (EXISTS ( SELECT 1
   FROM (project_members me
     JOIN project_members them ON ((them.project_id = me.project_id)))
  WHERE ((me.user_id = auth.uid()) AND (them.user_id = profiles.id))))));

create policy pm_select on public.project_members as PERMISSIVE for SELECT to public using (((user_id = auth.uid()) OR is_project_member(project_id) OR is_super_admin()));

create policy pm_insert on public.project_members as PERMISSIVE for INSERT to public with check ((is_super_admin() OR is_project_admin(project_id) OR ((user_id = auth.uid()) AND (role = 'admin'::text) AND has_admin_role() AND project_is_new(project_id))));

create policy pm_update on public.project_members as PERMISSIVE for UPDATE to public using ((is_super_admin() OR is_project_admin(project_id))) with check ((is_super_admin() OR is_project_admin(project_id)));

create policy pm_delete on public.project_members as PERMISSIVE for DELETE to public using ((is_super_admin() OR is_project_admin(project_id)));

create policy "Only admin can create project" on public.projects as PERMISSIVE for INSERT to public with check ((is_super_admin() OR has_admin_role()));

create policy labor_allocation_write on public.labor_allocation as PERMISSIVE for ALL to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy project_labor_days_write on public.project_labor_days as PERMISSIVE for ALL to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy labor_productivity_write on public.labor_productivity as PERMISSIVE for ALL to authenticated using (
CASE
    WHEN (project_id IS NULL) THEN (has_admin_role() OR is_super_admin())
    ELSE is_project_editor(project_id)
END) with check (
CASE
    WHEN (project_id IS NULL) THEN (has_admin_role() OR is_super_admin())
    ELSE is_project_editor(project_id)
END);

create policy projects_creator_read on public.projects as PERMISSIVE for SELECT to authenticated using ((created_by = auth.uid()));

create policy pid_read on public.project_item_dependencies as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy items_write on public.items as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());

create policy steps_write on public.steps as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());

create policy pss_read on public.project_step_settings as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy steps_read on public.steps as PERMISSIVE for SELECT to public using ((((project_id IS NULL) OR is_project_member(project_id) OR is_super_admin()) AND (EXISTS ( SELECT 1
   FROM items i
  WHERE ((i.id = steps.item_id) AND ((i.project_id IS NULL) OR is_project_member(i.project_id) OR is_super_admin()))))));

create policy sql_read on public.step_qty_logs as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

create policy sql_insert on public.step_qty_logs as PERMISSIVE for INSERT to authenticated with check ((is_project_editor(project_id) AND (created_by = auth.uid())));

create policy sql_update on public.step_qty_logs as PERMISSIVE for UPDATE to authenticated using ((((created_by = auth.uid()) AND is_project_editor(project_id)) OR is_project_admin(project_id) OR is_super_admin())) with check (is_project_editor(project_id));

create policy sql_delete on public.step_qty_logs as PERMISSIVE for DELETE to authenticated using ((((created_by = auth.uid()) AND is_project_editor(project_id)) OR is_project_admin(project_id) OR is_super_admin()));

create policy projects_delete_super on public.projects as PERMISSIVE for DELETE to authenticated using (is_super_admin());

create policy gantt_insert on public.gantt_dates as PERMISSIVE for INSERT to authenticated with check (is_project_editor(project_id));

create policy gantt_update on public.gantt_dates as PERMISSIVE for UPDATE to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy gantt_delete_super on public.gantt_dates as PERMISSIVE for DELETE to authenticated using (is_super_admin());

create policy progress_insert on public.progress as PERMISSIVE for INSERT to authenticated with check (is_project_editor(project_id));

create policy progress_update on public.progress as PERMISSIVE for UPDATE to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));

create policy progress_delete_super on public.progress as PERMISSIVE for DELETE to authenticated using (is_super_admin());

create policy sqm_read on public.step_qty_materials as PERMISSIVE for SELECT to authenticated using ((is_project_member(project_id) OR is_super_admin()));

-- TABLE COLUMNS

-- app_admins: user_id uuid, created_at timestamp with time zone default now()

-- app_meta: key text, value text, updated_at timestamp with time zone default now()

-- auth_users_view: id uuid, email text

-- gantt_dates: id uuid default gen_random_uuid(), project_id uuid, item_id uuid, plan_start date, plan_end date, actual_start date, actual_end date, updated_at timestamp with time zone default now()

-- item_dependencies: id uuid default gen_random_uuid(), item_stt integer, depends_on_stt integer, created_at timestamp with time zone default now()

-- item_progress_view: project_id uuid, item_id uuid, stt integer, item_name text, zone_id text, item_weight integer, total_steps bigint, na_steps bigint, applicable_weight bigint, done_weight bigint, pct_done numeric

-- items: id uuid default gen_random_uuid(), stt integer, name text, zone_id text, weight integer default 10, sort_order numeric default 0, group_type text default 'B'::text, order_days integer default 7, volume numeric, unit text, project_id uuid

-- labor_allocation: id uuid default gen_random_uuid(), project_id uuid, item_id uuid, date date, cn_plan integer default 0, cn_actual integer, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now()

-- labor_productivity: id uuid default gen_random_uuid(), item_id uuid, cn_per_day numeric default 1, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), project_id uuid

-- profiles: id uuid, email text, full_name text, phone text, company text, status text default 'pending'::text, created_at timestamp with time zone default now()

-- progress: id uuid default gen_random_uuid(), project_id uuid, step_id uuid, is_done boolean default false, is_na boolean default false, done_at timestamp with time zone, done_by uuid, note text, updated_at timestamp with time zone default now(), progress_pct numeric

-- project_item_dependencies: project_id uuid, item_id uuid, depends_on_item_id uuid, lag_days integer default 0

-- project_item_settings: project_id uuid, item_id uuid, order_days integer default 7, updated_at timestamp with time zone default now(), hidden boolean default false

-- project_labor_days: id uuid default gen_random_uuid(), project_id uuid, date date, cn_plan integer default 0, cn_actual integer, td_plan integer default 0, td_actual integer, cht integer default 1, hse integer default 1, cnp_plan integer default 0, cnp_actual integer, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now()

-- project_members: id uuid default gen_random_uuid(), project_id uuid, user_id uuid, role text default 'viewer'::text, added_at timestamp with time zone default now()

-- project_step_settings: project_id uuid, step_id uuid, name text, weight integer, hidden boolean default false, sort numeric, updated_at timestamp with time zone default now(), qty_total numeric, qty_unit text

-- projects: id uuid default gen_random_uuid(), name text, client text, factory text, contractor text default 'TTCE-HTE'::text, start_date date, total_days integer default 60, capacity_kwp numeric, panel_count integer, contract_no text, location text, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), share_token text default replace((gen_random_uuid())::text, '-'::text, ''::text), created_by uuid default auth.uid()

-- risk_log: id uuid default gen_random_uuid(), project_id uuid, found_date date, description text, affected_item uuid, severity text, reporter text, solution text, assignee text, resolve_date date, status text default 'Chưa xử lý'::text, created_at timestamp with time zone default now()

-- step_qty_logs: id uuid default gen_random_uuid(), project_id uuid, step_id uuid, log_date date default ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date, qty numeric, note text, created_by uuid default auth.uid(), created_at timestamp with time zone default now(), sub_item_id uuid

-- step_qty_materials: project_id uuid, step_id uuid, sub_item_id uuid, created_at timestamp with time zone default now()

-- steps: id uuid default gen_random_uuid(), item_id uuid, step_index integer, name text, weight integer default 10, sort_order integer default 0, project_id uuid

-- sub_items: id uuid default gen_random_uuid(), item_id uuid, name text, unit text, quantity numeric, note text, need_date date, sort_order integer default 0, created_at timestamp with time zone default now(), is_done boolean default false, done_at timestamp with time zone, project_id uuid

-- weekly_reports: id uuid default gen_random_uuid(), project_id uuid, week_number integer, report_date date, issues text, solutions text, next_plan text, support_needs text, total_pct numeric, created_by uuid, created_at timestamp with time zone default now()

-- zones: id text, label text, icon text, color text, light text, sort_order integer default 0
