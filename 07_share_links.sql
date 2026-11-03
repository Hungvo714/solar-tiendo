-- =====================================================================
-- 07_share_links.sql — Link CĐT chỉ xem được đúng 1 dự án
-- Đã áp dụng qua migration share_links_lockdown.
-- =====================================================================

-- 1) Mã chia sẻ riêng mỗi dự án (dự án cũ: mã = id để link đã gửi vẫn chạy)
alter table public.projects add column if not exists share_token text;
update public.projects set share_token = id::text where share_token is null;
alter table public.projects alter column share_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.projects alter column share_token set not null;
create unique index if not exists projects_share_token_key on public.projects(share_token);

-- 2) Hàm đọc dữ liệu cho link CĐT (người ngoài gọi được, chỉ trả về đúng 1 dự án)
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
    'gantt',    coalesce((select jsonb_agg(to_jsonb(d)) from public.gantt_dates d where d.project_id = pr.id), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_shared_project(text) to anon, authenticated;

-- 3) Đổi link (link cũ hết hiệu lực) — CHỈ Admin chính
create or replace function public.regenerate_share_token(pid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if not public.is_super_admin() then
    raise exception 'Chỉ Admin chính mới đổi được link';
  end if;
  update public.projects set share_token = t where id = pid;
  return t;
end;
$$;
revoke execute on function public.regenerate_share_token(uuid) from public, anon;
grant  execute on function public.regenerate_share_token(uuid) to authenticated;

-- 4) Bỏ quyền "ai cũng đọc" trên dữ liệu dự án
drop policy if exists "Public read project"  on public.projects;
drop policy if exists "Public read projects" on public.projects;
drop policy if exists "Public read progress" on public.progress;
drop policy if exists "Public read gantt"    on public.gantt_dates;
drop policy if exists "Public read sub_items"          on public.sub_items;
drop policy if exists "Public read labor_allocation"   on public.labor_allocation;
drop policy if exists "Public read labor_productivity" on public.labor_productivity;
drop policy if exists "Public read project_labor_days" on public.project_labor_days;

-- Người tạo luôn đọc được dự án mình vừa tạo (cần cho bước tạo dự án → gán thành viên)
alter table public.projects add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;
drop policy if exists "projects_creator_read" on public.projects;
create policy "projects_creator_read" on public.projects for select to authenticated using (created_by = auth.uid());

-- Admin chính đọc được mọi dự án (thành viên đã có policy "Members can view ...")
drop policy if exists "projects_super_read" on public.projects;
create policy "projects_super_read" on public.projects for select to authenticated using (public.is_super_admin());
drop policy if exists "progress_super_read" on public.progress;
create policy "progress_super_read" on public.progress for select to authenticated using (public.is_super_admin());
drop policy if exists "gantt_super_read" on public.gantt_dates;
create policy "gantt_super_read" on public.gantt_dates for select to authenticated using (public.is_super_admin());

-- Vật tư phụ: dòng mẫu cho người đã đăng nhập; dòng dự án cho thành viên
drop policy if exists "sub_items_read" on public.sub_items;
create policy "sub_items_read" on public.sub_items for select to authenticated
  using (project_id is null or public.is_project_member(project_id) or public.is_super_admin());

-- Nhân công: chỉ thành viên dự án
drop policy if exists "labor_allocation_read" on public.labor_allocation;
create policy "labor_allocation_read" on public.labor_allocation for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
drop policy if exists "project_labor_days_read" on public.project_labor_days;
create policy "project_labor_days_read" on public.project_labor_days for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
drop policy if exists "labor_productivity_read" on public.labor_productivity;
create policy "labor_productivity_read" on public.labor_productivity for select to authenticated
  using (project_id is null or public.is_project_member(project_id) or public.is_super_admin());

-- (items, steps, zones, item_dependencies là danh mục mẫu chung, không có dữ liệu dự án → giữ đọc công khai)

-- =====================================================================
-- (migration app_meta_for_cron) Phục vụ tác vụ tự động hằng ngày /api/cron/daily
-- =====================================================================
create table if not exists public.app_meta (
  key text primary key, value text, updated_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
create or replace function public.last_user_activity()
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(t) from (
    select max(last_sign_in_at) t from auth.users
    union all select max(updated_at) from public.progress
    union all select max(updated_at) from public.gantt_dates
    union all select max(done_at)    from public.sub_items
    union all select max(created_at) from public.weekly_reports
    union all select max(updated_at) from public.project_item_settings
    union all select max(added_at)   from public.project_members
  ) x;
$$;
revoke execute on function public.last_user_activity() from public, anon, authenticated;
grant  execute on function public.last_user_activity() to service_role;
grant all on table public.app_meta to service_role;
