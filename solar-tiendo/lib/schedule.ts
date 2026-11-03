// Quy tắc liên kết ngày giữa các hạng mục (dùng ở trang Tiến độ)
//
// Vật tư (nhóm A):  BD = ngày đặt hàng · HT = ngày CÓ HÀNG · order_days = số ngày gia công/giao hàng
//                   ngày có hàng = ngày đặt hàng + order_days
// Liên kết "X chờ Y" (+ lag_days ngày chờ):
//   - Y là vật tư   → X bắt đầu sớm nhất = ngày có hàng của Y + lag (được làm ngay trong ngày có hàng)
//   - Y là thi công → X bắt đầu sớm nhất = ngày hoàn thành của Y + 1 + lag
// Kế hoạch so với kế hoạch (chặn + gợi ý); thực tế so với thực tế (chỉ cảnh báo, không bao giờ tự sửa).

export type Dep = {
  item_id: string; depends_on_item_id: string; lag_days?: number
  item_stt?: number; depends_on_stt?: number
}
type G = Record<string, any>
type ItemLite = { id: string; name: string; group_type?: string; order_days?: number; no?: number | null; stt?: number }

export function addDays(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, day + n))
  return t.toISOString().slice(0, 10)
}
export function diffDays(a: string, b: string): number {      // b - a (ngày)
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number)
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000)
}
export const fmtVN = (d?: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`
}

const offsetOf = (pre: ItemLite | undefined, dep: Dep) =>
  (pre?.group_type === 'A' ? 0 : 1) + Math.max(0, dep.lag_days ?? 0)

export type StartReason = { dep: Dep; pre: ItemLite; preDate: string; earliest: string }

// Ngày bắt đầu KẾ HOẠCH sớm nhất của 1 mục, theo ngày kế hoạch của các mục nó chờ
export function earliestPlanStart(itemId: string, deps: Dep[], byId: Record<string, ItemLite>, gantt: G) {
  let date: string | null = null
  const reasons: StartReason[] = []
  for (const d of deps) {
    if (d.item_id !== itemId) continue
    const pre = byId[d.depends_on_item_id]; if (!pre) continue
    const end = gantt[pre.id]?.plan_end
    if (!end) continue
    const e = addDays(end, offsetOf(pre, d))
    reasons.push({ dep: d, pre, preDate: end, earliest: e })
    if (!date || e > date) date = e
  }
  return { date, reasons }
}

// Ngày CÓ HÀNG cần có (muộn nhất) để kịp cho mục thi công bắt đầu ngày `start`
export function requiredArrival(start: string, dep: Dep) {
  return addDays(start, -Math.max(0, dep.lag_days ?? 0))
}

// Dời các mục phụ thuộc (KẾ HOẠCH) để không vi phạm, giữ nguyên số ngày thi công của từng mục.
// Trả về danh sách thay đổi (chưa lưu) — dây chuyền nhiều cấp.
export type PlanChange = { itemId: string; plan_start: string; plan_end: string | null; oldStart: string }
export function cascadePlan(fromIds: string[], deps: Dep[], byId: Record<string, ItemLite>, gantt: G): PlanChange[] {
  const g: G = {}
  for (const k of Object.keys(gantt)) g[k] = { ...gantt[k] }
  const changes: Record<string, PlanChange> = {}
  const queue = [...fromIds]
  let guard = 0
  while (queue.length && guard++ < 2000) {
    const cur = queue.shift()!
    for (const d of deps) {
      if (d.depends_on_item_id !== cur) continue
      const x = byId[d.item_id]; if (!x) continue
      const xs = g[x.id]?.plan_start
      if (!xs) continue                                      // chưa có kế hoạch → không dời
      const need = earliestPlanStart(x.id, deps, byId, g).date
      if (!need || xs >= need) continue
      const xe = g[x.id]?.plan_end
      const dur = xe ? diffDays(xs, xe) : null
      const ns = need, ne = dur != null ? addDays(need, dur) : null
      g[x.id] = { ...(g[x.id] ?? {}), plan_start: ns, plan_end: ne ?? xe ?? null }
      changes[x.id] = { itemId: x.id, plan_start: ns, plan_end: ne ?? xe ?? null, oldStart: changes[x.id]?.oldStart ?? xs }
      queue.push(x.id)
    }
  }
  return Object.values(changes)
}

// Cảnh báo THỰC TẾ (không chặn): bắt đầu thực tế trước khi mục chờ có hàng / hoàn thành
export function actualWarnings(item: ItemLite, deps: Dep[], byId: Record<string, ItemLite>, gantt: G,
                               isDone: (id: string) => boolean): string[] {
  const out: string[] = []
  const as = gantt[item.id]?.actual_start
  if (!as) return out
  for (const d of deps) {
    if (d.item_id !== item.id) continue
    const pre = byId[d.depends_on_item_id]; if (!pre) continue
    const label = `#${pre.no ?? pre.stt} ${pre.name}`
    const verb = pre.group_type === 'A' ? 'có hàng' : 'hoàn thành'
    const ae = gantt[pre.id]?.actual_end
    if (!ae) {
      if (!isDone(pre.id)) out.push(`Đã bắt đầu thực tế nhưng ${label} chưa ${verb}`)
      continue
    }
    const need = addDays(ae, offsetOf(pre, d))
    if (as < need) out.push(`Bắt đầu thực tế sớm hơn ${diffDays(as, need)} ngày so với khi ${label} ${verb}${d.lag_days ? ` (+${d.lag_days} ngày chờ)` : ''}`)
  }
  return out
}
