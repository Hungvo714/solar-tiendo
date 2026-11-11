-- =====================================================================
-- 14_copy_plan.sql — Copy dự án: thêm tuỳ chọn sao chép KẾ HOẠCH THI CÔNG
--   p_plan = { "items": { "<id hạng mục nguồn>": {"s": "yyyy-mm-dd", "e": "yyyy-mm-dd"} },
--              "subs":  { "<id vật tư nguồn>": "yyyy-mm-dd" } }   (ngày cần vật tư)
--   App tính sẵn ngày theo 1 trong 3 cách: dời theo ngày bắt đầu / co-giãn theo BD+HT / giữ nguyên
--   Chỉ ghi ngày KẾ HOẠCH; ngày thực tế không bao giờ copy.
-- Đã áp dụng qua migration copy_project_plan.
-- =====================================================================

drop function if exists public.create_project_copy(uuid, text, text, text, date, int, text);

create or replace function public.create_project_copy(
  p_src uuid, p_name text, p_client text, p_contractor text,
  p_start date, p_total_days int, p_location text, p_plan jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
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

  -- 1) Tạo dự án (trigger tự thêm Admin chính + gieo cấu hình mẫu)
  insert into public.projects (name, client, contractor, start_date, total_days, location, created_by)
  values (trim(p_name), nullif(trim(p_client), ''), nullif(trim(p_contractor), ''),
          coalesce(p_start, (now() at time zone 'Asia/Ho_Chi_Minh')::date), coalesce(p_total_days, 60),
          nullif(trim(p_location), ''), v_uid)
  returning id into v_new;
  insert into public.project_members (project_id, user_id, role) values (v_new, v_uid, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';

  -- 2) Bỏ cấu hình mẫu vừa gieo, thay bằng cấu hình của dự án nguồn
  delete from public.sub_items                 where project_id = v_new;
  delete from public.project_item_settings     where project_id = v_new;
  delete from public.project_item_dependencies where project_id = v_new;

  drop table if exists _imap;
  create temp table _imap (old_id uuid primary key, new_id uuid) on commit drop;
  drop table if exists _smap;
  create temp table _smap (old_id uuid primary key, new_id uuid) on commit drop;
  drop table if exists _vmap;
  create temp table _vmap (old_id uuid primary key, new_id uuid) on commit drop;

  -- Hạng mục thêm riêng
  for r in select * from public.items where project_id = p_src loop
    insert into public.items (stt, name, zone_id, weight, sort_order, group_type, order_days, volume, unit, project_id)
    values (r.stt, r.name, r.zone_id, r.weight, r.sort_order, r.group_type, r.order_days, r.volume, r.unit, v_new)
    returning id into v_id;
    insert into _imap values (r.id, v_id);
  end loop;
  -- Hạng mục mẫu ánh xạ về chính nó
  insert into _imap select id, id from public.items where project_id is null;

  -- Bước: bước thêm riêng vào hạng mục mẫu + bước của hạng mục thêm riêng
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

  -- Cấu hình hạng mục (ẩn, số ngày gia công)
  insert into public.project_item_settings (project_id, item_id, order_days, hidden)
  select v_new, m.new_id, x.order_days, x.hidden
  from public.project_item_settings x join _imap m on m.old_id = x.item_id
  where x.project_id = p_src;

  -- Điều kiện liên quan
  insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id, lag_days)
  select v_new, a.new_id, b.new_id, d.lag_days
  from public.project_item_dependencies d
  join _imap a on a.old_id = d.item_id join _imap b on b.old_id = d.depends_on_item_id
  where d.project_id = p_src;

  -- Cấu hình bước (tên, trọng số, ẩn, thứ tự, tổng khối lượng tự nhập)
  insert into public.project_step_settings (project_id, step_id, name, weight, hidden, sort, qty_total, qty_unit)
  select v_new, m.new_id, x.name, x.weight, x.hidden, x.sort, x.qty_total, x.qty_unit
  from public.project_step_settings x join _smap m on m.old_id = x.step_id
  where x.project_id = p_src;

  -- Danh sách vật tư (ngày cần chỉ có khi copy kế hoạch; không copy trạng thái)
  for r in select * from public.sub_items where project_id = p_src loop
    insert into public.sub_items (item_id, name, unit, quantity, note, sort_order, project_id, need_date)
    values ((select new_id from _imap where old_id = r.item_id), r.name, r.unit, r.quantity, r.note, r.sort_order, v_new,
            nullif(p_plan->'subs'->>r.id::text, '')::date)
    returning id into v_id;
    insert into _vmap values (r.id, v_id);
  end loop;

  -- Bước đo theo vật tư
  insert into public.step_qty_materials (project_id, step_id, sub_item_id)
  select v_new, s.new_id, v.new_id
  from public.step_qty_materials q join _smap s on s.old_id = q.step_id join _vmap v on v.old_id = q.sub_item_id
  where q.project_id = p_src;

  -- Kế hoạch thi công (ngày do app tính sẵn theo cách đã chọn: dời / co-giãn / giữ nguyên)
  if p_plan is not null then
    insert into public.gantt_dates (project_id, item_id, plan_start, plan_end)
    select v_new, m.new_id, nullif(e.value->>'s', '')::date, nullif(e.value->>'e', '')::date
    from jsonb_each(coalesce(p_plan->'items', '{}'::jsonb)) e
    join _imap m on m.old_id = e.key::uuid
    on conflict (project_id, item_id) do update
      set plan_start = excluded.plan_start, plan_end = excluded.plan_end;
  end if;

  return v_new;
end;
$$;
revoke execute on function public.create_project_copy(uuid, text, text, text, date, int, text, jsonb) from public, anon;
grant  execute on function public.create_project_copy(uuid, text, text, text, date, int, text, jsonb) to authenticated;

