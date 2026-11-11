// Tính KẾ HOẠCH THI CÔNG cho dự án mới khi sao chép từ dự án nguồn
//   shift : dời toàn bộ theo ngày bắt đầu mới (giữ nguyên thời lượng, khoảng cách)
//   scale : co / giãn cho vừa [ngày bắt đầu, ngày hoàn thành] mới
//           - hạng mục thi công: co/giãn vị trí và thời lượng (tối thiểu 1 ngày)
//           - vật tư: KHÔNG co thời gian gia công → ngày có hàng co theo lịch, ngày đặt = có hàng − số ngày gia công
//           - sau đó đẩy lùi các hạng mục vi phạm điều kiện liên quan (giữ thời lượng)
//   keep  : giữ nguyên ngày như dự án nguồn
import { supabase } from './supabase'
import { getItemsForProject, getGanttDates, getProjectDependencies, getSubItemsById } from './queries'
import { addDays, diffDays, earliestPlanStart, Dep } from './schedule'

export type PlanMode = 'shift' | 'scale' | 'keep'

export type SourcePlan = {
  projectId: string; anchor: string | null; srcEnd: string | null
  items: any[]; gantt: Record<string, any>; deps: Dep[]; subs: Record<string, any>
}

export async function loadSourcePlan(projectId: string): Promise<SourcePlan> {
  const [{ data: proj }, items, gd, subs] = await Promise.all([
    supabase.from('projects').select('start_date').eq('id', projectId).single(),
    getItemsForProject(projectId), getGanttDates(projectId), getSubItemsById(projectId),
  ])
  const deps = await getProjectDependencies(projectId, items as any[])
  const gantt: Record<string, any> = {}
  for (const g of gd as any[]) gantt[g.item_id] = g
  const starts = (items as any[]).map(i => gantt[i.id]?.plan_start).filter(Boolean).sort()
  const ends = (items as any[]).map(i => gantt[i.id]?.plan_end ?? gantt[i.id]?.plan_start).filter(Boolean).sort()
  const anchor = (proj as any)?.start_date ?? starts[0] ?? null
  return { projectId, anchor, srcEnd: ends[ends.length - 1] ?? null, items: items as any[], gantt, deps, subs }
}

export const hasPlan = (sp: SourcePlan | null) => !!sp && Object.values(sp.gantt).some((g: any) => g.plan_start || g.plan_end)

export type PlanRow = { item: any; s: string | null; e: string | null; srcS: string | null; srcE: string | null; pushed: boolean; warn?: string }
export type PlanResult = {
  start: string; end: string | null; totalDays: number | null
  items: Record<string, { s: string | null; e: string | null }>
  subs: Record<string, string>
  rows: PlanRow[]; warnings: string[]
}

export function computePlan(sp: SourcePlan, mode: PlanMode, newStart: string, newEnd?: string | null): PlanResult {
  const warnings: string[] = []
  const anchor = sp.anchor ?? newStart
  const out: Record<string, { s: string | null; e: string | null }> = {}
  const pushed = new Set<string>()

  let start = mode === 'keep' ? anchor : newStart
  let pos = (d: string) => d
  let durOf = (n: number) => n
  if (mode === 'shift') {
    const off = diffDays(anchor, newStart)
    pos = d => addDays(d, off)
  } else if (mode === 'scale') {
    const span = sp.srcEnd ? diffDays(anchor, sp.srcEnd) : 0
    const newSpan = newEnd ? diffDays(newStart, newEnd) : 0
    const f = span > 0 && newSpan > 0 ? newSpan / span : 1
    pos = d => addDays(newStart, Math.round(diffDays(anchor, d) * f))
    durOf = n => Math.max(0, Math.round(n * f))
  }

  for (const it of sp.items) {
    const g = sp.gantt[it.id]; if (!g || (!g.plan_start && !g.plan_end)) continue
    const s0 = g.plan_start ?? null, e0 = g.plan_end ?? null
    if (mode !== 'scale') { out[it.id] = { s: s0 ? pos(s0) : null, e: e0 ? pos(e0) : null }; continue }
    if (it.group_type === 'A') {
      // Vật tư: giữ nguyên số ngày gia công
      const e = e0 ? pos(e0) : null
      const lead = s0 && e0 ? diffDays(s0, e0) : null
      out[it.id] = { s: e && lead != null ? addDays(e, -lead) : (s0 ? pos(s0) : null), e }
    } else {
      const s = s0 ? pos(s0) : null
      out[it.id] = { s, e: s && s0 && e0 ? addDays(s, durOf(diffDays(s0, e0))) : (e0 ? pos(e0) : null) }
    }
  }

  // Co/giãn: đẩy lùi hạng mục vi phạm điều kiện liên quan (giữ thời lượng mới)
  if (mode === 'scale') {
    const byId: Record<string, any> = Object.fromEntries(sp.items.map(i => [i.id, i]))
    for (let loop = 0; loop < 60; loop++) {
      let changed = false
      for (const it of sp.items) {
        const cur = out[it.id]; if (!cur?.s) continue
        const g: Record<string, any> = {}
        for (const k of Object.keys(out)) g[k] = { plan_start: out[k].s, plan_end: out[k].e }
        const need = earliestPlanStart(it.id, sp.deps, byId, g).date
        if (need && cur.s < need) {
          const dur = cur.e ? diffDays(cur.s, cur.e) : null
          out[it.id] = { s: need, e: dur != null ? addDays(need, dur) : cur.e }
          pushed.add(it.id); changed = true
        }
      }
      if (!changed) break
    }
  }

  // Ngày cần vật tư
  const subs: Record<string, string> = {}
  for (const sub of Object.values(sp.subs) as any[]) {
    if (!sub.need_date) continue
    subs[sub.id] = mode === 'keep' ? sub.need_date : pos(sub.need_date)
  }

  const rows: PlanRow[] = []
  for (const it of sp.items) {
    const o = out[it.id]; if (!o) continue
    const g = sp.gantt[it.id] ?? {}
    let warn: string | undefined
    if (it.group_type === 'A' && o.s && o.s < start) warn = `Phải đặt hàng trước ngày bắt đầu dự án (${diffDays(o.s, start)} ngày)`
    rows.push({ item: it, s: o.s, e: o.e, srcS: g.plan_start ?? null, srcE: g.plan_end ?? null, pushed: pushed.has(it.id), warn })
  }
  const ends = rows.map(r => r.e ?? r.s).filter(Boolean).sort() as string[]
  const end = ends[ends.length - 1] ?? null

  const earlyOrders = rows.filter(r => r.warn).length
  if (earlyOrders) warnings.push(`${earlyOrders} vật tư phải đặt hàng TRƯỚC ngày bắt đầu dự án để kịp ngày có hàng.`)
  if (mode === 'scale' && newEnd && end && end > newEnd)
    warnings.push(`Không kịp ngày hoàn thành đã chọn: theo thời gian gia công vật tư và điều kiện liên quan, sớm nhất hoàn thành ${end.split('-').reverse().join('/')} (trễ ${diffDays(newEnd, end)} ngày).`)
  if (mode === 'scale' && pushed.size) warnings.push(`${pushed.size} hạng mục được lùi lại để không vi phạm điều kiện liên quan.`)
  if (mode === 'keep') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    const past = rows.filter(r => r.s && r.s < today).length
    if (past) warnings.push(`${past} hạng mục có ngày kế hoạch đã qua — dự án mới sẽ báo trễ ngay (kể cả trễ đặt hàng).`)
  }

  return {
    start, end, totalDays: end ? diffDays(start, end) + 1 : null,
    items: out, subs, rows, warnings,
  }
}
