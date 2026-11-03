-- =====================================================================
-- 09_project_steps.sql — Các bước (checklist) của hạng mục theo từng dự án
--   - project_step_settings: sửa tên / trọng số / ẩn / thứ tự của bước cho 1 dự án
--   - steps.project_id: bước THÊM RIÊNG cho dự án vào hạng mục mẫu (NULL = bước mẫu
--     hoặc bước của hạng mục thêm riêng)
--   - Dữ liệu tick (progress) giữ nguyên; bước bị ẩn không tính vào %
--   - Chỉ Admin chính sửa (hàm save_item_steps)
-- Đã áp dụng qua migration project_steps_config.
-- =====================================================================

alter table public.steps add column if not exists project_id uuid references public.projects(id) on delete cascade;
create index if not exists steps_project_idx on public.steps(project_id);

create table if not exists public.project_step_settings (
  project_id uuid not null references public.projects(id) on delete cascade,
  step_id    uuid not null references public.steps(id)    on delete cascade,
  name       text,
  weight     integer check (weight is null or weight >= 1),
  hidden     boolean not null default false,
  sort       numeric,
  updated_at timestamptz not null default now(),
  primary key (project_id, step_id)
);
alter table public.project_step_settings enable row level security;
drop policy if exists "pss_read" on public.project_step_settings;
create policy "pss_read" on public.project_step_settings for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());

-- Đọc bước: bước mẫu theo quyền hạng mục; bước thêm riêng chỉ thành viên dự án đó
drop policy if exists "steps_read" on public.steps;
create policy "steps_read" on public.steps for select
  using (
    (steps.project_id is null or public.is_project_member(steps.project_id) or public.is_super_admin())
    and exists (select 1 from public.items i where i.id = steps.item_id
                and (i.project_id is null or public.is_project_member(i.project_id) or public.is_super_admin()))
  );

-- Lưu toàn bộ danh sách bước của 1 hạng mục trong 1 dự án (theo đúng thứ tự gửi lên)
-- p_steps: [{ "id": uuid|null, "name": text, "weight": int, "hidden": bool, "delete": bool }, ...]
create or replace function public.save_item_steps(pid uuid, p_item uuid, p_steps jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it public.items; s jsonb; idx int := 0; v_id uuid; st public.steps; v_name text; v_w int;
        v_hidden boolean; v_del boolean; visible_count int;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  select * into it from public.items where id = p_item and (project_id is null or project_id = pid);
  if not found then raise exception 'Hạng mục không thuộc dự án'; end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'Dữ liệu bước không hợp lệ'; end if;

  for s in select * from jsonb_array_elements(p_steps) loop
    v_name   := nullif(trim(coalesce(s->>'name', '')), '');
    v_w      := greatest(1, coalesce((s->>'weight')::int, 10));
    v_hidden := coalesce((s->>'hidden')::boolean, false);
    v_del    := coalesce((s->>'delete')::boolean, false);
    v_id     := nullif(s->>'id', '')::uuid;

    if v_id is null then
      -- Bước mới
      if v_del or v_name is null then continue; end if;
      insert into public.steps (item_id, step_index, name, weight, sort_order, project_id)
      values (p_item, 1000 + idx, v_name, v_w, idx, case when it.project_id is null then pid else null end)
      returning id into v_id;
      insert into public.project_step_settings (project_id, step_id, sort, hidden)
      values (pid, v_id, idx, v_hidden);
    else
      select * into st from public.steps where id = v_id and item_id = p_item and (project_id is null or project_id = pid);
      if not found then raise exception 'Bước không thuộc hạng mục'; end if;

      if v_del then
        -- Xoá hẳn: chỉ bước do dự án tạo (bước thêm riêng / bước của mục riêng) và chưa có dữ liệu tick
        if (st.project_id = pid or it.project_id = pid)
           and not exists (select 1 from public.progress p where p.step_id = v_id and (p.is_done or p.is_na)) then
          delete from public.steps where id = v_id;
          continue;
        end if;
        v_hidden := true;   -- bước mẫu hoặc đã có dữ liệu → chỉ ẩn
      end if;

      insert into public.project_step_settings (project_id, step_id, name, weight, hidden, sort, updated_at)
      values (pid, v_id,
              case when v_name is distinct from st.name then v_name end,
              case when v_w is distinct from st.weight then v_w end,
              v_hidden, idx, now())
      on conflict (project_id, step_id) do update
        set name = excluded.name, weight = excluded.weight, hidden = excluded.hidden,
            sort = excluded.sort, updated_at = now();
    end if;
    idx := idx + 1;
  end loop;

  -- Phải còn ít nhất 1 bước đang dùng
  select count(*) into visible_count
  from public.steps x
  left join public.project_step_settings o on o.project_id = pid and o.step_id = x.id
  where x.item_id = p_item and (x.project_id is null or x.project_id = pid) and not coalesce(o.hidden, false);
  if visible_count = 0 then raise exception 'Hạng mục phải còn ít nhất 1 bước'; end if;
end;
$$;
revoke execute on function public.save_item_steps(uuid, uuid, jsonb) from public, anon;
grant  execute on function public.save_item_steps(uuid, uuid, jsonb) to authenticated;

-- Link CĐT: hạng mục kèm bước đã áp cấu hình dự án
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
                    'steps', coalesce((
                       select jsonb_agg(to_jsonb(st) || jsonb_build_object(
                                'name', coalesce(o.name, st.name), 'weight', coalesce(o.weight, st.weight))
                              order by coalesce(o.sort, st.sort_order::numeric), st.step_index)
                       from public.steps st
                       left join public.project_step_settings o on o.project_id = pr.id and o.step_id = st.id
                       where st.item_id = i.id and (st.project_id is null or st.project_id = pr.id)
                         and not coalesce(o.hidden, false)), '[]'::jsonb))
                  order by i.sort_order, i.stt)
                  from public.items i
                  left join public.project_item_settings s on s.project_id = pr.id and s.item_id = i.id
                  where (i.project_id is null or i.project_id = pr.id) and not coalesce(s.hidden, false)), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_shared_project(text) to anon, authenticated;
