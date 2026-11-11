-- =====================================================================
-- 13_copy_project.sql — Tạo dự án MỚI bằng cách sao chép cấu hình từ dự án có sẵn
--   Copy: hạng mục ẩn/thêm riêng/thứ tự, bước (tên, trọng số, ẩn, thêm, thứ tự),
--         điều kiện liên quan + ngày chờ, số ngày gia công, danh sách vật tư
--         (tên, đơn vị, số lượng, ghi chú), cấu hình đo khối lượng
--   KHÔNG copy: ngày KH/TT, ngày cần vật tư, tick, khối lượng đã nhập, báo cáo, link CĐT, thành viên
--   Quyền: Admin chính, hoặc Admin của dự án nguồn. Admin chính luôn là Admin của dự án mới
--   (trigger auto_add_super_admin có sẵn) và không bị gỡ khỏi dự án.
-- Đã áp dụng qua migration copy_project_setup.
-- =====================================================================

create or replace function public.create_project_copy(
  p_src uuid, p_name text, p_client text, p_contractor text,
  p_start date, p_total_days int, p_location text)
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

  -- Danh sách vật tư (không copy ngày cần, trạng thái)
  for r in select * from public.sub_items where project_id = p_src loop
    insert into public.sub_items (item_id, name, unit, quantity, note, sort_order, project_id)
    values ((select new_id from _imap where old_id = r.item_id), r.name, r.unit, r.quantity, r.note, r.sort_order, v_new)
    returning id into v_id;
    insert into _vmap values (r.id, v_id);
  end loop;

  -- Bước đo theo vật tư
  insert into public.step_qty_materials (project_id, step_id, sub_item_id)
  select v_new, s.new_id, v.new_id
  from public.step_qty_materials q join _smap s on s.old_id = q.step_id join _vmap v on v.old_id = q.sub_item_id
  where q.project_id = p_src;

  -- % = 0 cho các bước đo khối lượng (không có dữ liệu nhập)
  return v_new;
end;
$$;
revoke execute on function public.create_project_copy(uuid, text, text, text, date, int, text) from public, anon;
grant  execute on function public.create_project_copy(uuid, text, text, text, date, int, text) to authenticated;

-- Admin chính luôn là Admin của mọi dự án: không ai khác gỡ được khỏi dự án
create or replace function public.protect_super_admin_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.user_id in (select user_id from public.app_admins)
     and exists (select 1 from public.projects where id = old.project_id)   -- xoá cả dự án thì cho qua
     and not public.is_super_admin() then
    raise exception 'Không thể gỡ Admin chính khỏi dự án';
  end if;
  return old;
end;
$$;
revoke execute on function public.protect_super_admin_delete() from public, anon, authenticated;
drop trigger if exists trigger_protect_super_admin_delete on public.project_members;
create trigger trigger_protect_super_admin_delete before delete on public.project_members
  for each row execute function public.protect_super_admin_delete();
