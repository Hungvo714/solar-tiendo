-- =====================================================================
-- 12_qty_materials.sql — Bước đo khối lượng THEO VẬT TƯ
--   - Ở bước thi công, chọn 1 / nhiều / tất cả vật tư (sub_items của hạng mục vật tư liên quan)
--   - Tổng của mỗi vật tư = số lượng nhập ở danh sách vật tư (sửa số lượng → % tự tính lại)
--   - Nhập hằng ngày riêng từng vật tư (step_qty_logs.sub_item_id)
--   - % bước = TRUNG BÌNH % các vật tư đã chọn (vật tư chưa có số lượng bỏ qua)
--   - Vẫn giữ cách tự nhập tổng (qty_total) cho bước không có vật tư tương ứng
--   - Sửa lỗi: xoá dự án / bước có nhật ký khối lượng không còn bị lỗi khi cascade
-- Đã áp dụng qua migration qty_from_materials.
-- =====================================================================

create table if not exists public.step_qty_materials (
  project_id  uuid not null references public.projects(id)  on delete cascade,
  step_id     uuid not null references public.steps(id)     on delete cascade,
  sub_item_id uuid not null references public.sub_items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, step_id, sub_item_id)
);
alter table public.step_qty_materials enable row level security;
drop policy if exists "sqm_read" on public.step_qty_materials;
create policy "sqm_read" on public.step_qty_materials for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
grant select on public.step_qty_materials to authenticated;

-- Nhật ký theo từng vật tư; vật tư đã có nhật ký thì không xoá được (tránh mất dữ liệu)
alter table public.step_qty_logs add column if not exists sub_item_id uuid
  references public.sub_items(id) on delete no action;   -- kiểm tra cuối câu lệnh: xoá cả dự án vẫn được
create index if not exists step_qty_logs_sub_idx on public.step_qty_logs(sub_item_id);

create or replace function public.recalc_step_qty(pid uuid, sid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_sum numeric; v_pct numeric; v_first date; v_item uuid; v_nmat int;
begin
  -- Dự án / bước đang bị xoá (cascade) → bỏ qua
  if not exists (select 1 from public.projects where id = pid) then return; end if;
  select item_id into v_item from public.steps where id = sid;
  if v_item is null then return; end if;

  select count(*) into v_nmat from public.step_qty_materials where project_id = pid and step_id = sid;

  if v_nmat > 0 then
    -- Theo vật tư: trung bình % từng vật tư có số lượng
    select avg(least(100, greatest(0,
             coalesce((select sum(l.qty) from public.step_qty_logs l
                       where l.project_id = pid and l.step_id = sid and l.sub_item_id = m.sub_item_id), 0)
             / s.quantity * 100)))
      into v_pct
    from public.step_qty_materials m join public.sub_items s on s.id = m.sub_item_id
    where m.project_id = pid and m.step_id = sid and s.quantity > 0;
    v_pct := round(coalesce(v_pct, 0), 2);
    select min(log_date) into v_first from public.step_qty_logs
      where project_id = pid and step_id = sid and sub_item_id in
        (select sub_item_id from public.step_qty_materials where project_id = pid and step_id = sid);
  else
    select qty_total into v_total from public.project_step_settings where project_id = pid and step_id = sid;
    if v_total is null or v_total <= 0 then
      update public.progress set progress_pct = null, updated_at = now() where project_id = pid and step_id = sid;
      return;
    end if;
    select coalesce(sum(qty), 0), min(log_date) into v_sum, v_first
    from public.step_qty_logs where project_id = pid and step_id = sid and sub_item_id is null;
    v_pct := greatest(0, least(100, round(v_sum / v_total * 100, 2)));
  end if;

  insert into public.progress (project_id, step_id, is_done, is_na, progress_pct, done_at, updated_at)
  values (pid, sid, v_pct >= 100, false, v_pct, case when v_pct >= 100 then now() end, now())
  on conflict (project_id, step_id) do update
    set progress_pct = excluded.progress_pct,
        is_done      = excluded.is_done,
        is_na        = false,
        done_at      = case when excluded.is_done then coalesce(public.progress.done_at, now()) else null end,
        updated_at   = now();

  if v_first is not null then
    insert into public.gantt_dates (project_id, item_id, actual_start, updated_at)
    values (pid, v_item, v_first, now())
    on conflict (project_id, item_id) do update
      set actual_start = coalesce(public.gantt_dates.actual_start, excluded.actual_start),
          updated_at = case when public.gantt_dates.actual_start is null then now() else public.gantt_dates.updated_at end;
  end if;
end;
$$;
revoke execute on function public.recalc_step_qty(uuid, uuid) from public, anon, authenticated;

-- Liên kết vật tư thay đổi → tính lại
create or replace function public.trg_step_qty_materials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.recalc_step_qty(old.project_id, old.step_id);
  else perform public.recalc_step_qty(new.project_id, new.step_id); end if;
  return null;
end;
$$;
revoke execute on function public.trg_step_qty_materials() from public, anon, authenticated;
drop trigger if exists step_qty_materials_recalc on public.step_qty_materials;
create trigger step_qty_materials_recalc after insert or delete on public.step_qty_materials
  for each row execute function public.trg_step_qty_materials();

-- Sửa số lượng vật tư → tính lại các bước đang dùng vật tư đó
create or replace function public.trg_sub_items_qty()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.quantity is distinct from old.quantity then
    for r in select project_id, step_id from public.step_qty_materials where sub_item_id = new.id loop
      perform public.recalc_step_qty(r.project_id, r.step_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.trg_sub_items_qty() from public, anon, authenticated;
drop trigger if exists sub_items_qty_recalc on public.sub_items;
create trigger sub_items_qty_recalc after update of quantity on public.sub_items
  for each row execute function public.trg_sub_items_qty();

-- Chọn vật tư cho bước (Admin chính / Admin dự án). Mảng rỗng = bỏ chọn hết.
create or replace function public.set_step_materials(pid uuid, sid uuid, p_subs uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.is_project_admin(pid)) then
    raise exception 'Chỉ Admin dự án hoặc Admin chính';
  end if;
  if not exists (select 1 from public.steps s join public.items i on i.id = s.item_id
                 where s.id = sid and (s.project_id is null or s.project_id = pid)
                   and (i.project_id is null or i.project_id = pid)) then
    raise exception 'Bước không thuộc dự án';
  end if;
  if exists (select 1 from unnest(coalesce(p_subs, '{}')) x
             where not exists (select 1 from public.sub_items si where si.id = x and si.project_id = pid)) then
    raise exception 'Vật tư không thuộc dự án';
  end if;

  delete from public.step_qty_materials
   where project_id = pid and step_id = sid and not (sub_item_id = any(coalesce(p_subs, '{}')));
  insert into public.step_qty_materials (project_id, step_id, sub_item_id)
  select pid, sid, x from unnest(coalesce(p_subs, '{}')) x
  on conflict do nothing;

  -- Theo vật tư thì bỏ tổng tự nhập
  if coalesce(array_length(p_subs, 1), 0) > 0 then
    update public.project_step_settings set qty_total = null, updated_at = now()
     where project_id = pid and step_id = sid;
  end if;
  perform public.recalc_step_qty(pid, sid);
end;
$$;
revoke execute on function public.set_step_materials(uuid, uuid, uuid[]) from public, anon;
grant  execute on function public.set_step_materials(uuid, uuid, uuid[]) to authenticated;

-- Tự nhập tổng (hoặc bỏ đo khối lượng) → bỏ liên kết vật tư
create or replace function public.set_step_quantity(pid uuid, sid uuid, p_total numeric, p_unit text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.is_project_admin(pid)) then
    raise exception 'Chỉ Admin dự án hoặc Admin chính';
  end if;
  if not exists (select 1 from public.steps s join public.items i on i.id = s.item_id
                 where s.id = sid and (s.project_id is null or s.project_id = pid)
                   and (i.project_id is null or i.project_id = pid)) then
    raise exception 'Bước không thuộc dự án';
  end if;
  if p_total is not null and p_total <= 0 then raise exception 'Tổng khối lượng phải lớn hơn 0'; end if;
  delete from public.step_qty_materials where project_id = pid and step_id = sid;
  insert into public.project_step_settings (project_id, step_id, qty_total, qty_unit, updated_at)
  values (pid, sid, p_total, nullif(trim(p_unit), ''), now())
  on conflict (project_id, step_id) do update
    set qty_total = excluded.qty_total, qty_unit = excluded.qty_unit, updated_at = now();
  perform public.recalc_step_qty(pid, sid);
end;
$$;
