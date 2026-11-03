-- =====================================================================
-- 04_accounts.sql — Tài khoản: tự đăng ký (chờ duyệt), Admin chính, quản lý user
-- Chạy 1 lần trong Supabase › SQL Editor › New query › Run
-- Chạy lại nhiều lần cũng an toàn.
-- =====================================================================

-- 1) Bảng hồ sơ người dùng (email, họ tên, trạng thái duyệt)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  company     text,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);

-- 2) Admin chính (toàn quyền duyệt và quản lý user)
--    Muốn thêm Admin chính sau này: insert thêm 1 dòng vào bảng này.
create table if not exists public.app_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- (không có policy → không ai đọc/sửa trực tiếp được, chỉ qua hàm bên dưới)

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'vn.hung714@gmail.com'
on conflict do nothing;

create or replace function public.is_super_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- 3) Tự tạo hồ sơ khi có tài khoản mới
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, company, status)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company',
    'pending'          -- luôn chờ duyệt; Admin chính tạo thì API tự chuyển 'approved'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Hồ sơ cho tài khoản đã có (đang là thành viên dự án → 'approved')
insert into public.profiles (id, email, status, created_at)
select u.id, u.email,
       case when exists (select 1 from public.project_members m where m.user_id = u.id)
              or exists (select 1 from public.app_admins a where a.user_id = u.id)
            then 'approved' else 'pending' end,
       u.created_at
from auth.users u
on conflict (id) do nothing;

-- 5) Quyền đọc profiles: chính mình, Admin chính, hoặc người cùng dự án
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.project_members me
      join public.project_members them on them.project_id = me.project_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

-- Dọn các hàm của bản nháp trước (nếu đã chạy)
drop function if exists public.is_any_admin() cascade;
drop function if exists public.list_pending_users();

-- 6) Danh sách toàn bộ user (chỉ Admin chính)
drop function if exists public.list_managed_users();
create or replace function public.list_all_users()
returns table (
  user_id uuid, email text, full_name text, phone text, company text,
  status text, is_super_admin boolean,
  created_at timestamptz, last_sign_in_at timestamptz,
  memberships jsonb
)
language plpgsql stable
security definer set search_path = public
as $$
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
$$;

-- 7) Danh sách tất cả dự án (để Admin chính gán người vào dự án bất kỳ)
create or replace function public.list_all_projects()
returns table (id uuid, name text)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Chỉ Admin chính';
  end if;
  return query select pr.id, pr.name::text from public.projects pr order by pr.name;
end;
$$;

-- 8) Gán / đổi vai trò / gỡ khỏi dự án (chỉ Admin chính)
create or replace function public.set_membership(target_user uuid, target_project uuid, target_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
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
$$;

-- 9) Duyệt / từ chối / sửa thông tin (chỉ Admin chính)
drop function if exists public.approve_user(uuid, uuid, text);
create or replace function public.approve_user(target_user uuid, target_project uuid, target_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.set_membership(target_user, target_project, coalesce(target_role, 'editor'));
end;
$$;

create or replace function public.reject_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  update public.profiles set status = 'rejected' where id = target_user;
end;
$$;

create or replace function public.update_profile(target_user uuid, p_full_name text, p_phone text, p_company text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not (public.is_super_admin() or target_user = auth.uid()) then raise exception 'Không có quyền'; end if;
  update public.profiles
     set full_name = nullif(trim(p_full_name), ''),
         phone     = nullif(trim(p_phone), ''),
         company   = nullif(trim(p_company), '')
   where id = target_user;
end;
$$;

grant execute on function public.is_super_admin()                       to authenticated;
grant execute on function public.list_all_users()                       to authenticated;
grant execute on function public.list_all_projects()                    to authenticated;
grant execute on function public.set_membership(uuid, uuid, text)       to authenticated;
grant execute on function public.approve_user(uuid, uuid, text)         to authenticated;
grant execute on function public.reject_user(uuid)                      to authenticated;
grant execute on function public.update_profile(uuid, text, text, text) to authenticated;


-- =====================================================================
-- 10) Siết quyền (bắt buộc khi mở đăng ký)
--   - project_members: trước đây "mọi người đăng nhập được làm mọi thứ"
--     → người tự đăng ký có thể tự gán mình làm Admin. Nay chỉ Admin dự án / Admin chính.
--   - projects INSERT: trước đây người chưa có dự án nào cũng tạo được dự án.
-- =====================================================================
create or replace function public.is_project_admin(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid());
$$;
create or replace function public.has_admin_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where user_id = auth.uid() and role = 'admin');
$$;
-- Dự án vừa tạo: chưa có thành viên nào ngoài Admin chính (trigger tự thêm)
create or replace function public.project_is_new(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.project_members m
                     where m.project_id = pid
                       and m.user_id not in (select user_id from public.app_admins));
$$;
grant execute on function public.project_is_new(uuid)    to authenticated;
grant execute on function public.is_project_admin(uuid)  to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.has_admin_role()        to authenticated;

drop policy if exists "Allow all for authenticated" on public.project_members;
drop policy if exists "pm_select" on public.project_members;
drop policy if exists "pm_insert" on public.project_members;
drop policy if exists "pm_update" on public.project_members;
drop policy if exists "pm_delete" on public.project_members;

create policy "pm_select" on public.project_members for select
  using (user_id = auth.uid() or public.is_project_member(project_id) or public.is_super_admin());

create policy "pm_insert" on public.project_members for insert
  with check (
    public.is_super_admin()
    or public.is_project_admin(project_id)
    -- người tạo dự án mới tự gán mình làm Admin (chỉ người đã là Admin ở nơi khác mới tạo được dự án)
    or (user_id = auth.uid() and role = 'admin' and public.has_admin_role()
        and public.project_is_new(project_id))
  );

create policy "pm_update" on public.project_members for update
  using (public.is_super_admin() or public.is_project_admin(project_id))
  with check (public.is_super_admin() or public.is_project_admin(project_id));

create policy "pm_delete" on public.project_members for delete
  using (public.is_super_admin() or public.is_project_admin(project_id));

drop policy if exists "Only admin can create project" on public.projects;
create policy "Only admin can create project" on public.projects for insert
  with check (public.is_super_admin() or public.has_admin_role());

select 'OK — profiles: ' || (select count(*) from public.profiles)
    || ' · Admin chính: ' || coalesce((select string_agg(u.email, ', ')
         from public.app_admins a join auth.users u on u.id = a.user_id), '(chưa có!)') as result;
