-- =====================================================================
-- 06_per_project_data.sql — Tách dữ liệu dùng chung thành dữ liệu riêng từng dự án
--   - sub_items (vật tư phụ / hạng mục con): thêm project_id.
--       project_id NULL  = dòng MẪU (dùng để tạo cho dự án mới)
--       project_id = X   = dữ liệu riêng của dự án X (tick xong, số lượng...)
--   - Số ngày đặt hàng (order_days): chuyển từ bảng items (dùng chung)
--       sang project_item_settings (riêng từng dự án). items.order_days giữ làm mặc định.
-- Đã áp dụng qua migration per_project_sub_items_and_order_days.
-- =====================================================================

-- 1) sub_items theo dự án
alter table public.sub_items
  add column if not exists project_id uuid references public.projects(id) on delete cascade;
create index if not exists sub_items_project_item_idx on public.sub_items(project_id, item_id);

-- Chép mẫu cho các dự án hiện có (chỉ chép nếu dự án chưa có bản riêng)
insert into public.sub_items (item_id, name, unit, quantity, note, need_date, sort_order, is_done, done_at, project_id)
select s.item_id, s.name, s.unit, s.quantity, s.note, s.need_date, s.sort_order, s.is_done, s.done_at, p.id
from public.sub_items s
cross join public.projects p
where s.project_id is null
  and not exists (select 1 from public.sub_items x where x.project_id = p.id);

-- Dòng mẫu không mang trạng thái "đã xong"
update public.sub_items set is_done = false, done_at = null where project_id is null;

-- 2) Cài đặt hạng mục theo dự án (số ngày đặt hàng)
create table if not exists public.project_item_settings (
  project_id  uuid not null references public.projects(id) on delete cascade,
  item_id     uuid not null references public.items(id)    on delete cascade,
  order_days  integer not null default 7,
  updated_at  timestamptz not null default now(),
  primary key (project_id, item_id)
);

insert into public.project_item_settings (project_id, item_id, order_days)
select p.id, i.id, coalesce(i.order_days, 7)
from public.projects p cross join public.items i
on conflict do nothing;

alter table public.project_item_settings enable row level security;
drop policy if exists "pis_read"  on public.project_item_settings;
drop policy if exists "pis_write" on public.project_item_settings;
create policy "pis_read" on public.project_item_settings for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
create policy "pis_write" on public.project_item_settings for all to authenticated
  using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));

-- 3) Quyền ghi sub_items: dòng mẫu chỉ Admin chính; dòng của dự án → Editor/Admin dự án đó
drop policy if exists "sub_items_write" on public.sub_items;
create policy "sub_items_write" on public.sub_items for all to authenticated
  using (case when project_id is null then public.is_super_admin() else public.is_project_editor(project_id) end)
  with check (case when project_id is null then public.is_super_admin() else public.is_project_editor(project_id) end);

-- 4) Dự án mới tạo: tự chép vật tư phụ mẫu + số ngày đặt hàng mặc định
create or replace function public.seed_project_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sub_items (item_id, name, unit, quantity, note, need_date, sort_order, project_id)
  select item_id, name, unit, quantity, note, need_date, sort_order, new.id
  from public.sub_items where project_id is null;

  insert into public.project_item_settings (project_id, item_id, order_days)
  select new.id, id, coalesce(order_days, 7) from public.items
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.seed_project_defaults() from public, anon, authenticated;

drop trigger if exists trigger_seed_project_defaults on public.projects;
create trigger trigger_seed_project_defaults
  after insert on public.projects
  for each row execute function public.seed_project_defaults();

-- =====================================================================
-- (migration request_reapproval) Người bị từ chối tự gửi lại yêu cầu duyệt
-- =====================================================================
create or replace function public.request_reapproval(p_full_name text, p_phone text, p_company text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'rejected') then
    raise exception 'Tài khoản không ở trạng thái bị từ chối';
  end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Vui lòng nhập họ tên'; end if;
  update public.profiles
     set status = 'pending', full_name = trim(p_full_name),
         phone = nullif(trim(p_phone), ''), company = nullif(trim(p_company), ''),
         created_at = now()
   where id = auth.uid();
end;
$$;
revoke execute on function public.request_reapproval(text, text, text) from public, anon;
grant  execute on function public.request_reapproval(text, text, text) to authenticated;
