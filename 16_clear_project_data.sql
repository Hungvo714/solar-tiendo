-- =====================================================================
-- 16_clear_project_data.sql — Xoá dữ liệu đã nhập của 1 dự án THEO NHÓM (chỉ Admin chính)
--   p_ticks     : tick hoàn thành / N/A
--   p_plan      : ngày kế hoạch (BD/HT KH, Đặt hàng/Có hàng KH)
--   p_actual    : ngày thực tế
--   p_qty       : khối lượng nhập hằng ngày
--   p_materials : số lượng & ngày cần của vật tư (giữ tên vật tư)
--   p_reports   : báo cáo tuần đã lưu
--   Chạy trong 1 giao dịch: lỗi giữa chừng thì không xoá gì.
--   Không đụng cấu hình hạng mục / bước / điều kiện / tên vật tư.
-- Đã áp dụng qua migration clear_project_data_by_group.
-- =====================================================================

-- Số dòng mỗi nhóm (để hiện trước khi xoá)
create or replace function public.project_data_counts(pid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính'; end if;
  return jsonb_build_object(
    'ticks',     (select count(*) from public.progress where project_id = pid and (is_done or is_na)),
    'plan',      (select count(*) from public.gantt_dates where project_id = pid and (plan_start is not null or plan_end is not null)),
    'actual',    (select count(*) from public.gantt_dates where project_id = pid and (actual_start is not null or actual_end is not null)),
    'qty',       (select count(*) from public.step_qty_logs where project_id = pid),
    'materials', (select count(*) from public.sub_items where project_id = pid and (quantity is not null or need_date is not null)),
    'reports',   (select count(*) from public.weekly_reports where project_id = pid)
  );
end;
$$;
revoke execute on function public.project_data_counts(uuid) from public, anon;
grant  execute on function public.project_data_counts(uuid) to authenticated;

create or replace function public.clear_project_data(pid uuid,
  p_ticks boolean, p_plan boolean, p_actual boolean, p_qty boolean, p_materials boolean, p_reports boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_ticks int := 0; n_plan int := 0; n_actual int := 0; n_qty int := 0; n_mat int := 0; n_rep int := 0;
begin
  if not public.is_super_admin() then raise exception 'Chỉ Admin chính được xoá dữ liệu dự án'; end if;
  if not exists (select 1 from public.projects where id = pid) then raise exception 'Không tìm thấy dự án'; end if;

  -- Khối lượng trước (trigger tự đưa % các bước đo khối lượng về 0)
  if p_qty then
    delete from public.step_qty_logs where project_id = pid;
    get diagnostics n_qty = row_count;
  end if;

  if p_ticks then
    select count(*) into n_ticks from public.progress where project_id = pid and (is_done or is_na);
    delete from public.progress where project_id = pid;
    -- Bước đo khối lượng: % và tick do khối lượng quyết định → tính lại nếu khối lượng vẫn còn
    if not p_qty then
      for r in select distinct step_id from public.step_qty_logs where project_id = pid loop
        perform public.recalc_step_qty(pid, r.step_id);
      end loop;
    end if;
  end if;

  if p_plan then
    update public.gantt_dates set plan_start = null, plan_end = null, updated_at = now()
     where project_id = pid and (plan_start is not null or plan_end is not null);
    get diagnostics n_plan = row_count;
  end if;
  if p_actual then
    update public.gantt_dates set actual_start = null, actual_end = null, updated_at = now()
     where project_id = pid and (actual_start is not null or actual_end is not null);
    get diagnostics n_actual = row_count;
  end if;
  if p_plan or p_actual then
    delete from public.gantt_dates where project_id = pid
      and plan_start is null and plan_end is null and actual_start is null and actual_end is null;
  end if;

  if p_materials then
    update public.sub_items set quantity = null, need_date = null
     where project_id = pid and (quantity is not null or need_date is not null);
    get diagnostics n_mat = row_count;
  end if;

  if p_reports then
    delete from public.weekly_reports where project_id = pid;
    get diagnostics n_rep = row_count;
  end if;

  return jsonb_build_object('ticks', n_ticks, 'plan', n_plan, 'actual', n_actual,
                            'qty', n_qty, 'materials', n_mat, 'reports', n_rep);
end;
$$;
revoke execute on function public.clear_project_data(uuid, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant  execute on function public.clear_project_data(uuid, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
