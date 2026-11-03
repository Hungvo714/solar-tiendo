-- =====================================================================
-- 04_accounts.sql — Tài khoản: tự đăng ký (chờ duyệt) + hiển thị email
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

-- 2) Tự tạo hồ sơ khi có tài khoản mới trong Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, company, status)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company',
    coalesce(new.raw_user_meta_data->>'status', 'pending')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Tạo hồ sơ cho các tài khoản đã có từ trước
--    (ai đang là thành viên dự án → 'approved', còn lại → 'pending')
insert into public.profiles (id, email, status, created_at)
select u.id, u.email,
       case when exists (select 1 from public.project_members m where m.user_id = u.id)
            then 'approved' else 'pending' end,
       u.created_at
from auth.users u
on conflict (id) do nothing;

-- 4) Hàm kiểm tra: người đang đăng nhập có là Admin của ít nhất 1 dự án?
create or replace function public.is_any_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- 5) Quyền đọc bảng profiles: chính mình, hoặc Admin
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_any_admin());

-- (Không cho sửa trực tiếp; mọi thay đổi đi qua các hàm bên dưới)

-- 6) Danh sách tài khoản đang chờ duyệt (chỉ Admin gọi được)
create or replace function public.list_pending_users()
returns setof public.profiles
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.is_any_admin() then
    raise exception 'Chỉ Admin mới xem được danh sách chờ duyệt';
  end if;
  return query
    select p.* from public.profiles p
    where p.status = 'pending'
      and not exists (select 1 from public.project_members m where m.user_id = p.id)
    order by p.created_at desc;
end;
$$;

-- 7) Duyệt: gán vào dự án với vai trò (người gọi phải là Admin của dự án đó)
create or replace function public.approve_user(target_user uuid, target_project uuid, target_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if target_role not in ('admin','editor','viewer') then
    raise exception 'Vai trò không hợp lệ';
  end if;
  if not exists (
    select 1 from public.project_members
    where project_id = target_project and user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Bạn không phải Admin của dự án này';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (target_project, target_user, target_role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  update public.profiles set status = 'approved' where id = target_user;
end;
$$;

-- 8) Từ chối
create or replace function public.reject_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_any_admin() then
    raise exception 'Chỉ Admin mới từ chối được';
  end if;
  update public.profiles set status = 'rejected' where id = target_user;
end;
$$;

grant execute on function public.is_any_admin()                    to authenticated;
grant execute on function public.list_pending_users()              to authenticated;
grant execute on function public.approve_user(uuid, uuid, text)    to authenticated;
grant execute on function public.reject_user(uuid)                 to authenticated;

select 'OK — đã tạo profiles: ' || count(*) || ' tài khoản' as result from public.profiles;
