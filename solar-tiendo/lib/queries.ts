import { supabase, Progress, GanttDate } from './supabase'

export const PROJECT_ID = '00000000-0000-0000-0000-000000000001'

export async function getProject() {
  const { data } = await supabase.from('projects').select('*').single()
  return data
}

export async function getItemsWithSteps() {
  const { data, error } = await supabase
    .from('items')
    .select('*, steps(*)')
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

// Hạng mục kèm số ngày đặt hàng RIÊNG của dự án (bảng project_item_settings)
export async function getItemsForProject(projectId: string) {
  const [items, { data: settings }] = await Promise.all([
    getItemsWithSteps(),
    supabase.from('project_item_settings').select('item_id, order_days').eq('project_id', projectId),
  ])
  const od: Record<string, number> = {}
  for (const s of settings ?? []) od[(s as any).item_id] = (s as any).order_days
  return (items as any[]).map(it => (it.id in od ? { ...it, order_days: od[it.id] } : it))
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
