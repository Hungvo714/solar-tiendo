-- =====================================================================
-- 08_project_items.sql — Hạng mục thi công theo từng dự án
--   - items.project_id NULL  = mục MẪU (55 mục chung)
--     items.project_id = X   = mục THÊM RIÊNG cho dự án X (số thứ tự tự tăng 56, 57...)
--   - project_item_settings.hidden = true → mục mẫu bị ẨN ở dự án đó (giữ dữ liệu, khôi phục được)
--   - project_item_dependencies: điều kiện liên quan RIÊNG từng dự án (theo id hạng mục)
--   - Chỉ Admin chính được cấu hình (qua các hàm bên dưới)
-- Đã áp dụng qua migration project_items_config.
-- =====================================================================

-- 1) Mục thêm riêng cho dự án
alter table public.items add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.items drop constraint if exists items_stt_key;
create unique index if not exists items_scope_stt_key
  on public.items (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), stt);
create index if not exists items_project_idx on public.items(project_id);

-- 2) Ẩn mục theo dự án
alter table public.project_item_settings add column if not exists hidden boolean not null default false;

-- 3) Điều kiện liên quan theo dự án
create table if not exists public.project_item_dependencies (
  project_id         uuid not null references public.projects(id) on delete cascade,
  item_id            uuid not null references public.items(id)    on delete cascade,
  depends_on_item_id uuid not null references public.items(id)    on delete cascade,
  primary key (project_id, item_id, depends_on_item_id),
  check (item_id <> depends_on_item_id)
);
alter table public.project_item_dependencies enable row level security;

-- Chép điều kiện mẫu (theo stt) cho các dự án hiện có
insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id)
select p.id, a.id, b.id
from public.item_dependencies d
join public.items a on a.stt = d.item_stt       and a.project_id is null
join public.items b on b.stt = d.depends_on_stt and b.project_id is null
cross join public.projects p
on conflict do nothing;

-- 4) Quyền đọc
--    items/steps: mẫu → ai cũng đọc (danh mục chung); mục riêng → thành viên dự án / Admin chính
drop policy if exists "Public read items" on public.items;
drop policy if exists "items_read" on public.items;
create policy "items_read" on public.items for select
  using (project_id is null or public.is_project_member(project_id) or public.is_super_admin());

drop policy if exists "Public read steps" on public.steps;
drop policy if exists "steps_read" on public.steps;
create policy "steps_read" on public.steps for select
  using (exists (select 1 from public.items i where i.id = steps.item_id
                 and (i.project_id is null or public.is_project_member(i.project_id) or public.is_super_admin())));

drop policy if exists "pid_read" on public.project_item_dependencies;
create policy "pid_read" on public.project_item_dependencies for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());

-- Ghi trực tiếp items/steps: chỉ Admin chính (mọi thao tác cấu hình đi qua hàm)
drop policy if exists "items_update" on public.items;
drop policy if exists "items_write" on public.items;
create policy "items_write" on public.items for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "steps_write" on public.steps;
create policy "steps_write" on public.steps for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- 5) Hàm cấu hình (chỉ Admin chính)

-- Ẩn / khôi phục một hạng mục trong dự án
create or replace function public.set_item_hidden(pid uuid, p_item uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if not exists (select 1 from public.items where id = p_item and (project_id is null or project_id = pid)) then
    raise exception 'Hạng mục không thuộc dự án';
  end if;
  insert into public.project_item_settings (project_id, item_id, hidden)
  values (pid, p_item, p_hidden)
  on conflict (project_id, item_id) do update set hidden = excluded.hidden, updated_at = now();
end;
$$;

-- Đặt lại toàn bộ điều kiện của một hạng mục: "mục này chờ các mục ..."
create or replace function public.set_item_dependencies(pid uuid, p_item uuid, p_depends uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if exists (select 1 from unnest(coalesce(p_depends, '{}')) d(id)
             where not exists (select 1 from public.items i where i.id = d.id and (i.project_id is null or i.project_id = pid))) then
    raise exception 'Có mục điều kiện không thuộc dự án';
  end if;
  delete from public.project_item_dependencies where project_id = pid and item_id = p_item;
  insert into public.project_item_dependencies (project_id, item_id, depends_on_item_id)
  select pid, p_item, d from unnest(coalesce(p_depends, '{}')) d where d <> p_item
  on conflict do nothing;
end;
$$;

-- Thêm hạng mục mới cho dự án (kèm danh sách bước [{name, weight}] và điều kiện)
create or replace function public.add_project_item(
  pid uuid, p_name text, p_zone text, p_group text, p_weight integer,
  p_steps jsonb, p_depends uuid[] default '{}', p_order_days integer default 7)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_stt int; v_sort int; s jsonb; i int := 0;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Thiếu tên hạng mục'; end if;
  if p_group not in ('A','B','C') then raise exception 'Nhóm phải là A, B hoặc C'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'Cần ít nhất 1 bước';
  end if;

  select coalesce(max(stt), 0) + 1, coalesce(max(sort_order), 0) + 1 into v_stt, v_sort
  from public.items where project_id is null or project_id = pid;

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
$$;

-- Sửa tên / khu vực / trọng số của mục THÊM RIÊNG (mục mẫu không sửa ở đây)
create or replace function public.update_project_item(p_item uuid, p_name text, p_zone text, p_weight integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  update public.items
     set name = coalesce(nullif(trim(p_name), ''), name),
         zone_id = coalesce(p_zone, zone_id),
         weight = greatest(coalesce(p_weight, weight), 1)
   where id = p_item and project_id is not null;
  if not found then raise exception 'Chỉ sửa được hạng mục thêm riêng'; end if;
end;
$$;

revoke execute on function public.set_item_hidden(uuid, uuid, boolean)            from public, anon;
revoke execute on function public.set_item_dependencies(uuid, uuid, uuid[])       from public, anon;
revoke execute on function public.add_project_item(uuid, text, text, text, integer, jsonb, uuid[], integer) from public, anon;
revoke execute on function public.update_project_item(uuid, text, text, integer)  from public, anon;
grant  execute on function public.set_item_hidden(uuid, uuid, boolean)            to authenticated;
grant  execute on function public.set_item_dependencies(uuid, uuid, uuid[])       to authenticated;
grant  execute on function public.add_project_item(uuid, text, text, text, integer, jsonb, uuid[], integer) to authenticated;
grant  execute on function public.update_project_item(uuid, text, text, integer)  to authenticated;

-- 6) Dự án mới: chép thêm điều kiện mẫu
create or replace function public.seed_project_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
revoke execute on function public.seed_project_defaults() from public, anon, authenticated;

-- 7) Link CĐT: trả kèm danh sách hạng mục đã áp dụng cấu hình dự án
create or replace function public.get_shared_project(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
                    'steps', coalesce((select jsonb_agg(to_jsonb(st) order by st.sort_order, st.step_index)
                                       from public.steps st where st.item_id = i.id), '[]'::jsonb))
                  order by i.sort_order, i.stt)
                  from public.items i
                  left join public.project_item_settings s on s.project_id = pr.id and s.item_id = i.id
                  where (i.project_id is null or i.project_id = pr.id) and not coalesce(s.hidden, false)), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_shared_project(text) to anon, authenticated;

-- =====================================================================
-- (migration project_items_insert_position) Chèn mục mới vào giữa / đổi vị trí
--   items.sort_order → numeric; add_project_item thêm p_after; move_project_item
--   (xem nội dung đầy đủ trong lịch sử migration của Supabase)
-- =====================================================================
alter table public.items alter column sort_order type numeric using sort_order::numeric;

-- =====================================================================
-- (migration dependency_lag_days) Số ngày chờ cho từng liên kết
-- =====================================================================
alter table public.project_item_dependencies add column if not exists lag_days integer not null default 0
  check (lag_days between 0 and 365);
-- set_item_dependencies(pid, p_item, p_depends uuid[], p_lags integer[] default null)
