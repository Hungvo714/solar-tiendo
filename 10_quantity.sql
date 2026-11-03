-- =====================================================================
-- 10_quantity.sql — Bước đo theo KHỐI LƯỢNG + nhật ký nhập hằng ngày
--   - project_step_settings.qty_total / qty_unit: tổng khối lượng của bước (vd 3600 tấm, 2150 m)
--     Có qty_total > 0  ⇒ bước được đo theo khối lượng
--   - step_qty_logs: mỗi lần nhập (ngày, số lượng, ghi chú, người nhập)
--   - Trigger tự tính progress.progress_pct = lũy kế ÷ tổng; đủ 100% → is_done
--     và tự điền "BD thực tế" của hạng mục = ngày nhập đầu tiên (nếu đang trống)
--   - Đặt tổng: Admin chính hoặc Admin dự án · Nhập hằng ngày: Editor / Admin dự án
-- Đã áp dụng qua migration step_quantity_tracking.
-- =====================================================================

alter table public.project_step_settings add column if not exists qty_total numeric check (qty_total is null or qty_total > 0);
alter table public.project_step_settings add column if not exists qty_unit  text;

create table if not exists public.step_qty_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  step_id     uuid not null references public.steps(id)    on delete cascade,
  log_date    date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  qty         numeric not null check (qty <> 0),
  note        text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists step_qty_logs_proj_step_idx on public.step_qty_logs(project_id, step_id, log_date);
alter table public.step_qty_logs enable row level security;

drop policy if exists "sql_read"   on public.step_qty_logs;
drop policy if exists "sql_insert" on public.step_qty_logs;
drop policy if exists "sql_update" on public.step_qty_logs;
drop policy if exists "sql_delete" on public.step_qty_logs;
create policy "sql_read" on public.step_qty_logs for select to authenticated
  using (public.is_project_member(project_id) or public.is_super_admin());
create policy "sql_insert" on public.step_qty_logs for insert to authenticated
  with check (public.is_project_editor(project_id) and created_by = auth.uid());
create policy "sql_update" on public.step_qty_logs for update to authenticated
  using ((created_by = auth.uid() and public.is_project_editor(project_id)) or public.is_project_admin(project_id) or public.is_super_admin())
  with check (public.is_project_editor(project_id));
create policy "sql_delete" on public.step_qty_logs for delete to authenticated
  using ((created_by = auth.uid() and public.is_project_editor(project_id)) or public.is_project_admin(project_id) or public.is_super_admin());

-- Tính lại % của 1 bước trong 1 dự án từ nhật ký
create or replace function public.recalc_step_qty(pid uuid, sid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_sum numeric; v_pct numeric; v_first date; v_item uuid;
begin
  select qty_total into v_total from public.project_step_settings where project_id = pid and step_id = sid;
  select item_id into v_item from public.steps where id = sid;
  if v_total is null or v_total <= 0 then
    -- Không còn đo khối lượng → xoá % từng phần (giữ trạng thái tick)
    update public.progress set progress_pct = null, updated_at = now() where project_id = pid and step_id = sid;
    return;
  end if;
  select coalesce(sum(qty), 0), min(log_date) into v_sum, v_first
  from public.step_qty_logs where project_id = pid and step_id = sid;
  v_pct := greatest(0, least(100, round(v_sum / v_total * 100, 2)));

  insert into public.progress (project_id, step_id, is_done, is_na, progress_pct, done_at, updated_at)
  values (pid, sid, v_pct >= 100, false, v_pct, case when v_pct >= 100 then now() end, now())
  on conflict (project_id, step_id) do update
    set progress_pct = excluded.progress_pct,
        is_done      = excluded.is_done,
        is_na        = false,
        done_at      = case when excluded.is_done then coalesce(public.progress.done_at, now()) else null end,
        updated_at   = now();

  -- BD thực tế của hạng mục = ngày nhập khối lượng đầu tiên (chỉ điền khi đang trống)
  if v_first is not null and v_item is not null then
    insert into public.gantt_dates (project_id, item_id, actual_start, updated_at)
    values (pid, v_item, v_first, now())
    on conflict (project_id, item_id) do update
      set actual_start = coalesce(public.gantt_dates.actual_start, excluded.actual_start),
          updated_at = case when public.gantt_dates.actual_start is null then now() else public.gantt_dates.updated_at end;
  end if;
end;
$$;
revoke execute on function public.recalc_step_qty(uuid, uuid) from public, anon, authenticated;

create or replace function public.trg_step_qty_logs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.recalc_step_qty(old.project_id, old.step_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.recalc_step_qty(new.project_id, new.step_id); end if;
  return null;
end;
$$;
revoke execute on function public.trg_step_qty_logs() from public, anon, authenticated;
drop trigger if exists step_qty_logs_recalc on public.step_qty_logs;
create trigger step_qty_logs_recalc after insert or update or delete on public.step_qty_logs
  for each row execute function public.trg_step_qty_logs();

-- Đặt / bỏ tổng khối lượng cho 1 bước (Admin chính hoặc Admin dự án)
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
  insert into public.project_step_settings (project_id, step_id, qty_total, qty_unit, updated_at)
  values (pid, sid, p_total, nullif(trim(p_unit), ''), now())
  on conflict (project_id, step_id) do update
    set qty_total = excluded.qty_total, qty_unit = excluded.qty_unit, updated_at = now();
  perform public.recalc_step_qty(pid, sid);
end;
$$;
revoke execute on function public.set_step_quantity(uuid, uuid, numeric, text) from public, anon;
grant  execute on function public.set_step_quantity(uuid, uuid, numeric, text) to authenticated;

-- Danh sách người nhập (tên hiển thị) cho lịch sử — chỉ thành viên dự án
create or replace function public.qty_log_authors(pid uuid)
returns table (user_id uuid, label text) language sql stable security definer set search_path = public as $$
  select distinct l.created_by, coalesce(p.full_name, split_part(p.email, '@', 1))
  from public.step_qty_logs l left join public.profiles p on p.id = l.created_by
  where l.project_id = pid and (public.is_project_member(pid) or public.is_super_admin());
$$;
revoke execute on function public.qty_log_authors(uuid) from public, anon;
grant  execute on function public.qty_log_authors(uuid) to authenticated;

-- save_item_steps (cấu hình bước của Admin chính) không được xoá mất tổng khối lượng đã đặt
-- → giữ qty_total/qty_unit khi upsert (cột không nằm trong danh sách update của hàm đó nên tự giữ nguyên)
