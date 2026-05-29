-- Chạy sau khi tạo user đầu tiên trong Supabase Auth
-- Thay YOUR_USER_ID bằng UUID từ Authentication > Users

-- Tạo dự án mặc định
insert into projects (
  id, name, client, factory, contractor, start_date, total_days, capacity_kwp
) values (
  '00000000-0000-0000-0000-000000000001',
  'Điện mặt trời Louvre',
  'Công ty TNHH Dệt Sợi Louvre',
  'Nhà máy Dệt Sợi Louvre',
  'TTCE-HTE',
  CURRENT_DATE,
  60,
  500
) on conflict (id) do nothing;

-- Thêm user đầu tiên làm admin (thay UUID bên dưới)
-- insert into project_members (project_id, user_id, role)
-- values ('00000000-0000-0000-0000-000000000001', 'YOUR_USER_ID', 'admin');

select 'Project created: ' || name as result from projects limit 1;
