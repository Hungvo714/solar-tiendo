// Thống kê bước đo theo KHỐI LƯỢNG: lũy kế, năng suất, dự báo ngày xong, cảnh báo trễ
import type { QtyLog } from './queries'
import { addDays, diffDays } from './schedule'

export const todayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

export const fmtQty = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('vi-VN') : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export type QtyStats = {
  total: number; unit: string; done: number; remaining: number; pct: number
  rate7: number                      // năng suất TB / ngày trong 7 ngày gần nhất (tính cả ngày không nhập)
  rateAll: number                    // năng suất TB từ ngày nhập đầu tiên
  today: number                      // khối lượng nhập hôm nay
  firstDate: string | null; lastDate: string | null
  forecast: string | null            // ngày dự kiến xong theo năng suất 7 ngày
  planEnd: string | null; lateDays: number | null   // >0: dự kiến trễ so với HT kế hoạch
  needRate: number | null            // năng suất cần để kịp HT kế hoạch
  series: { date: string; cum: number }[]           // đường lũy kế theo ngày
}

export function qtyStats(total: number, unit: string | null | undefined, logs: QtyLog[], planEnd?: string | null): QtyStats {
  const today = todayVN()
  const byDate: Record<string, number> = {}
  for (const l of logs) byDate[l.log_date] = (byDate[l.log_date] ?? 0) + Number(l.qty)
  const dates = Object.keys(byDate).sort()
  let cum = 0
  const series = dates.map(d => ({ date: d, cum: (cum += byDate[d]) }))
  const done = Math.max(0, cum)
  const remaining = Math.max(0, total - done)
  const pct = total > 0 ? Math.min(1, done / total) : 0

  const from7 = addDays(today, -6)
  const last7 = dates.filter(d => d >= from7 && d <= today).reduce((s, d) => s + byDate[d], 0)
  const firstDate = dates[0] ?? null, lastDate = dates[dates.length - 1] ?? null
  // Chưa đủ 7 ngày kể từ ngày đầu → chia theo số ngày thực có
  const span7 = firstDate ? Math.min(7, Math.max(1, diffDays(firstDate > from7 ? firstDate : from7, today) + 1)) : 7
  const rate7 = Math.max(0, last7 / span7)
  const rateAll = firstDate ? Math.max(0, done / Math.max(1, diffDays(firstDate, today) + 1)) : 0

  let forecast: string | null = null
  if (remaining <= 0) forecast = lastDate
  else if (rate7 > 0) forecast = addDays(today, Math.ceil(remaining / rate7))

  const pe = planEnd ?? null
  let lateDays: number | null = null, needRate: number | null = null
  if (pe && remaining > 0) {
    if (forecast) lateDays = diffDays(pe, forecast)
    const left = diffDays(today, pe) + 1
    needRate = left > 0 ? remaining / left : null
  } else if (pe && remaining <= 0 && lastDate) lateDays = diffDays(pe, lastDate)

  return { total, unit: unit || '', done, remaining, pct, rate7, rateAll, today: byDate[today] ?? 0,
    firstDate, lastDate, forecast, planEnd: pe, lateDays, needRate, series }
}

// Tình trạng ngắn gọn để tô màu
export function qtyStatus(s: QtyStats): { label: string; color: string } {
  if (s.remaining <= 0) return { label: 'Hoàn thành', color: '#4ade80' }
  if (!s.firstDate) return { label: 'Chưa bắt đầu', color: '#8899bb' }
  if (s.rate7 <= 0) return { label: 'Không có tiến độ 7 ngày', color: '#FF9999' }
  if (s.lateDays != null && s.lateDays > 0) return { label: `Dự kiến trễ ${s.lateDays} ngày`, color: '#FF9999' }
  if (s.planEnd) return { label: 'Kịp kế hoạch', color: '#4ade80' }
  return { label: 'Đang làm', color: '#fbbf24' }
}
