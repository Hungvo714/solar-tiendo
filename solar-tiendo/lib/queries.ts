import { supabase, Progress, GanttDate } from './supabase'

export const PROJECT_ID = '00000000-0000-0000-0000-000000000001'

export async function getProject() {
  const { data } = await supabase.from('projects').select('*').single()
  return data
}

// Toàn bộ hạng mục người dùng đọc được (mẫu + mục riêng của các dự án mình tham gia).
// KHÔNG dùng trực tiếp cho 1 dự án — dùng getItemsForProject.
export async function getItemsWithSteps() {
  const { data, error } = await supabase
    .from('items')
    .select('*, steps(*)')
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

const sortItems = (a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || a.stt - b.stt

// Gắn số thứ tự HIỂN THỊ liên tục 1..N cho các mục đang dùng (mục ẩn: no = null).
// stt (mã gốc) giữ nguyên cho điều kiện liên quan và các mốc 24/26/55.
export function numberItems<T extends { hidden?: boolean }>(items: T[]): (T & { no: number | null })[] {
  let n = 0
  return items.map(it => ({ ...it, no: it.hidden ? null : ++n }))
}
// Áp cấu hình BƯỚC của dự án (project_step_settings): tên, trọng số, ẩn, thứ tự;
// chỉ giữ bước mẫu + bước thêm riêng của đúng dự án này.
function applySteps(it: any, projectId: string, ov: Record<string, any>, includeHiddenSteps: boolean) {
  const steps = (it.steps ?? [])
    .filter((s: any) => s.project_id == null || s.project_id === projectId)
    .map((s: any) => {
      const o = ov[s.id]
      return {
        ...s,
        base_name: s.name, base_weight: s.weight,
        name: o?.name ?? s.name,
        weight: o?.weight ?? s.weight,
        hidden: !!o?.hidden,
        _sort: o?.sort != null ? Number(o.sort) : Number(s.sort_order ?? s.step_index ?? 0),
        is_extra: s.project_id === projectId,         // bước thêm riêng cho dự án
        qty_total: o?.qty_total != null ? Number(o.qty_total) : null,   // đo theo khối lượng
        qty_unit:  o?.qty_unit ?? null,
      }
    })
    .sort((a: any, b: any) => a._sort - b._sort || (a.step_index ?? 0) - (b.step_index ?? 0))
    .filter((s: any) => includeHiddenSteps || !s.hidden)
  return { ...it, steps }
}

// Hạng mục của 1 dự án: mục mẫu + mục thêm riêng, áp số ngày đặt hàng riêng và cấu hình bước,
// BỎ các mục bị ẩn (trừ khi includeHidden — dùng cho trang cấu hình, có cờ hidden)
export async function getItemsForProject(projectId: string,
  opts: { includeHidden?: boolean; includeHiddenSteps?: boolean } = {}) {
  const [items, { data: settings }, { data: stepSet }] = await Promise.all([
    getItemsWithSteps(),
    supabase.from('project_item_settings').select('item_id, order_days, hidden').eq('project_id', projectId),
    supabase.from('project_step_settings').select('step_id, name, weight, hidden, sort, qty_total, qty_unit').eq('project_id', projectId),
  ])
  const st: Record<string, { order_days: number; hidden: boolean }> = {}
  for (const s of settings ?? []) st[(s as any).item_id] = s as any
  const ov: Record<string, any> = {}
  for (const s of stepSet ?? []) ov[(s as any).step_id] = s
  const list = (items as any[])
    .filter(it => it.project_id == null || it.project_id === projectId)
    .map(it => ({
      ...applySteps(it, projectId, ov, !!opts.includeHiddenSteps),
      order_days: st[it.id]?.order_days ?? it.order_days,
      hidden: !!st[it.id]?.hidden,
    }))
    .filter(it => opts.includeHidden || !it.hidden)
    .sort(sortItems)
  return numberItems(list)
}

// Điều kiện liên quan của dự án.
// Trả về dạng cũ {item_stt, depends_on_stt} để các màn hình hiện có dùng lại;
// chỉ giữ điều kiện giữa các mục đang hiển thị.
export async function getProjectDependencies(projectId: string, items: any[]) {
  const { data } = await supabase.from('project_item_dependencies')
    .select('item_id, depends_on_item_id, lag_days').eq('project_id', projectId)
  const sttOf: Record<string, number> = {}
  for (const it of items) sttOf[it.id] = it.stt
  return (data ?? [])
    .filter((d: any) => d.item_id in sttOf && d.depends_on_item_id in sttOf)
    .map((d: any) => ({
      item_stt: sttOf[d.item_id], depends_on_stt: sttOf[d.depends_on_item_id],
      item_id: d.item_id as string, depends_on_item_id: d.depends_on_item_id as string,
      lag_days: (d.lag_days ?? 0) as number,
    }))
}

// Nhật ký khối lượng hằng ngày của dự án (bước đo theo khối lượng)
export type QtyLog = { id: string; project_id: string; step_id: string; log_date: string; qty: number; note: string | null; created_by: string | null; created_at: string }
export async function getQtyLogs(projectId: string): Promise<QtyLog[]> {
  const { data } = await supabase.from('step_qty_logs').select('*')
    .eq('project_id', projectId).order('log_date').order('created_at')
  return (data ?? []).map((l: any) => ({ ...l, qty: Number(l.qty) }))
}

// Vật tư phụ (hạng mục con) RIÊNG của dự án
export async function getSubItems(projectId: string, itemIds: string[]) {
  if (itemIds.length === 0) return {} as Record<string, any[]>
  const { data } = await supabase.from('sub_items').select('*')
    .eq('project_id', projectId).in('item_id', itemIds).order('sort_order')
  const map: Record<string, any[]> = {}
  for (const s of data ?? []) (map[s.item_id] ??= []).push(s)
  return map
}

export async function getZones() {
  const { data } = await supabase.from('zones').select('*').order('sort_order')
  return data ?? []
}

export async function getProgress(projectId: string) {
  const { data } = await supabase
    .from('progress')
    .select('*')
    .eq('project_id', projectId)
  return data ?? []
}

export async function getGanttDates(projectId: string) {
  const { data } = await supabase
    .from('gantt_dates')
    .select('*')
    .eq('project_id', projectId)
  return data ?? []
}

export async function upsertProgress(
  projectId: string, stepId: string, isDone: boolean, isNa = false
) {
  const { data, error } = await supabase.from('progress').upsert({
    project_id: projectId,
    step_id:    stepId,
    is_done:    isDone,
    is_na:      isNa,
    done_at:    isDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,step_id' }).select()
  if (error) throw error
  return data
}

export async function upsertGantt(
  projectId: string, itemId: string, field: string, value: string
) {
  const { data, error } = await supabase.from('gantt_dates').upsert({
    project_id: projectId,
    item_id:    itemId,
    [field]:    value || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,item_id' }).select()
  if (error) throw error
  return data
}

export function subscribeProgress(projectId: string, cb: (p: Progress) => void) {
  return supabase.channel('progress-' + projectId)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'progress',
      filter: `project_id=eq.${projectId}`
    }, payload => cb(payload.new as Progress))
    .subscribe()
}

export function subscribeGantt(projectId: string, cb: (g: GanttDate) => void) {
  return supabase.channel('gantt-' + projectId)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'gantt_dates',
      filter: `project_id=eq.${projectId}`
    }, payload => cb(payload.new as GanttDate))
    .subscribe()
}
