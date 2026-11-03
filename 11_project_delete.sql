-- 11_project_delete.sql — Chỉ Admin chính được xoá dự án (tránh mất dữ liệu)
-- Đã áp dụng qua migration project_delete_super_admin_only.
drop policy if exists "Admin can delete project" on public.projects;
drop policy if exists "projects_delete_super" on public.projects;
create policy "projects_delete_super" on public.projects for delete to authenticated
  using (public.is_super_admin());
