-- 11_project_delete.sql — Chỉ Admin chính được xoá dự án (tránh mất dữ liệu)
-- Đã áp dụng qua migration project_delete_super_admin_only.
drop policy if exists "Admin can delete project" on public.projects;
drop policy if exists "projects_delete_super" on public.projects;
create policy "projects_delete_super" on public.projects for delete to authenticated
  using (public.is_super_admin());

-- (migration progress_gantt_delete_super_only) Xoá tick / ngày chỉ Admin chính (nút "Xóa dữ liệu")
--   Editor / Admin dự án vẫn thêm & sửa (upsert) bình thường.
drop policy if exists "Editor can write gantt" on public.gantt_dates;
drop policy if exists "Editors can update gantt" on public.gantt_dates;
drop policy if exists "Editor can write progress" on public.progress;
drop policy if exists "Editors can update progress" on public.progress;
create policy "gantt_insert" on public.gantt_dates for insert to authenticated with check (public.is_project_editor(project_id));
create policy "gantt_update" on public.gantt_dates for update to authenticated using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));
create policy "gantt_delete_super" on public.gantt_dates for delete to authenticated using (public.is_super_admin());
create policy "progress_insert" on public.progress for insert to authenticated with check (public.is_project_editor(project_id));
create policy "progress_update" on public.progress for update to authenticated using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));
create policy "progress_delete_super" on public.progress for delete to authenticated using (public.is_super_admin());
