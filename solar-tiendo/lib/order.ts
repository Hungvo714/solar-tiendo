// Tiến độ ĐẶT HÀNG vật tư (nhóm A)
// - Bước đặt hàng = bước đầu tiên của hạng mục vật tư (vd "Lập danh sách & đặt hàng")
// - Đã đặt = bước đó đã tick (hoặc N/A), hoặc đã nhập "Đặt hàng thực tế"
// - Trễ đặt hàng = tới ngày "Đặt hàng (KH)" (BD kế hoạch) mà vẫn chưa đặt
import { addDays, diffDays } from './schedule'
import { todayVN } from './qty'

export type OrderInfo = {
  orderStep: any | null; ordered: boolean
  planOrder: string | null; planArrive: string | null
  late: boolean; lateDays: number          // 0 = đến hạn hôm nay
}

export function orderInfo(item: any, progressMap: Record<string, any>, ganttMap: Record<string, any>, today = todayVN()): OrderInfo | null {
  if ((item.group_type ?? 'B') !== 'A') return null
  const g = ganttMap[item.id] ?? {}
  const steps = item.steps ?? []
  const orderStep = steps[0] ?? null
  const p = orderStep ? progressMap[orderStep.id] : null
  const ordered = !!(p?.is_done || p?.is_na) || !!g.actual_start
  const planOrder = g.plan_start ?? null
  const late = !ordered && !!planOrder && planOrder <= today
  return { orderStep, ordered, planOrder, planArrive: g.plan_end ?? null, late, lateDays: late ? diffDays(planOrder!, today) : 0 }
}

export const lateOrderLabel = (o: OrderInfo) =>
  o.lateDays === 0 ? 'Đến hạn đặt hàng hôm nay' : `Trễ đặt hàng ${o.lateDays} ngày`

// Tuần tới: thứ Hai → Chủ nhật kế tiếp
export function nextWeekRange(today = todayVN()) {
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()     // 0 = CN
  const mon = addDays(today, dow === 0 ? 1 : 8 - dow)
  return { from: mon, to: addDays(mon, 6) }
}
