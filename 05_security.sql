-- =====================================================================
-- 05_security.sql — Siết bảo mật dữ liệu dự án (đã áp dụng qua migration security_hardening)
-- Chạy lại nhiều lần cũng an toàn.
-- =====================================================================

-- 1) Hàm phân quyền bổ sung
create or replace function public.is_project_editor(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid() and role in ('admin','editor'))
         or exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
-- Có quyền sửa ở ít nhất 1 dự án (dùng cho các bảng mẫu dùng chung: items, sub_items)
create or replace function public.has_edit_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where user_id = auth.uid() and role in ('admin','editor'))
         or exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_project_editor(uuid) to authenticated;
grant execute on function public.has_edit_role()          to authenticated;

-- 2) Bảng nhân công: chỉ Editor/Admin của đúng dự án mới được ghi
drop policy if exists "Auth write labor_allocation" on public.labor_allocation;
drop policy if exists "labor_allocation_write" on public.labor_allocation;
create policy "labor_allocation_write" on public.labor_allocation for all to authenticated
  using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));

drop policy if exists "Auth write project_labor_days" on public.project_labor_days;
drop policy if exists "project_labor_days_write" on public.project_labor_days;
create policy "project_labor_days_write" on public.project_labor_days for all to authenticated
  using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));

drop policy if exists "Auth write labor_productivity" on public.labor_productivity;
drop policy if exists "labor_productivity_write" on public.labor_productivity;
create policy "labor_productivity_write" on public.labor_productivity for all to authenticated
  using (case when project_id is null then public.has_admin_role() or public.is_super_admin()
              else public.is_project_editor(project_id) end)
  with check (case when project_id is null then public.has_admin_role() or public.is_super_admin()
                   else public.is_project_editor(project_id) end);

-- 3) Bảng mẫu dùng chung (items, sub_items): chỉ người có quyền Editor/Admin
drop policy if exists "Auth write sub_items" on public.sub_items;
drop policy if exists "sub_items_write" on public.sub_items;
create policy "sub_items_write" on public.sub_items for all to authenticated
  using (public.has_edit_role()) with check (public.has_edit_role());

drop policy if exists "Auth update items" on public.items;
drop policy if exists "items_update" on public.items;
create policy "items_update" on public.items for update to authenticated
  using (public.has_edit_role()) with check (public.has_edit_role());

-- 4) Báo cáo tuần & nhật ký rủi ro (trước đây không có quy tắc → app lưu bị từ chối)
drop policy if exists "weekly_reports_read" on public.weekly_reports;
drop policy if exists "weekly_reports_write" on public.weekly_reports;
create policy "weekly_reports_read" on public.weekly_reports for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
create policy "weekly_reports_write" on public.weekly_reports for all to authenticated
  using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));

drop policy if exists "risk_log_read" on public.risk_log;
drop policy if exists "risk_log_write" on public.risk_log;
create policy "risk_log_read" on public.risk_log for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
create policy "risk_log_write" on public.risk_log for all to authenticated
  using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));

-- 5) Hàm tra user theo email: trước đây ai (kể cả chưa đăng nhập) cũng dò được email có tài khoản
create or replace function public.get_user_id_by_email(user_email text)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_admin_role() or public.is_super_admin()) then
    raise exception 'Không có quyền';
  end if;
  return (select id from auth.users where lower(email) = lower(user_email) limit 1);
end;
$$;

-- 6) Cố định search_path cho các hàm cũ
alter function public.auto_add_super_admin() set search_path = public;
alter function public.protect_super_admin()  set search_path = public;

-- 7) View tiến độ: chạy theo quyền người xem (không vượt quyền)
alter view public.item_progress_view set (security_invoker = true);

-- 8) Thu hồi quyền gọi hàm từ người chưa đăng nhập (anon) và khỏi API cho hàm trigger
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.auto_add_super_admin()  from public, anon, authenticated;
revoke execute on function public.protect_super_admin()   from public, anon, authenticated;

revoke execute on function public.get_user_id_by_email(text)              from public, anon;
revoke execute on function public.list_all_users()                        from public, anon;
revoke execute on function public.list_all_projects()                     from public, anon;
revoke execute on function public.set_membership(uuid, uuid, text)        from public, anon;
revoke execute on function public.approve_user(uuid, uuid, text)          from public, anon;
revoke execute on function public.reject_user(uuid)                       from public, anon;
revoke execute on function public.update_profile(uuid, text, text, text)  from public, anon;
revoke execute on function public.project_is_new(uuid)                    from public, anon;
grant  execute on function public.get_user_id_by_email(text)              to authenticated;
