import { Item, Progress, GanttDate } from './supabase'

export function itemPct(item: Item, progressMap: Record<string, Progress>): number {
  const steps = item.steps ?? []
  let totalW = 0, doneW = 0
  for (const s of steps) {
    const p = progressMap[s.id]
    if (p?.is_na) continue
    totalW += s.weight
    if (p?.is_done) doneW += s.weight
  }
  return totalW > 0 ? doneW / totalW : 0
}

export function zonePct(
  zoneId: string, items: Item[], progressMap: Record<string, Progress>
): number {
  const zi = items.filter(it => it.zone_id === zoneId)
  if (!zi.length) return 0
  let totalW = 0, doneW = 0
  for (const it of zi) {
    totalW += it.weight
    doneW  += itemPct(it, progressMap) * it.weight
  }
  return totalW > 0 ? doneW / totalW : 0
}

export function totalPct(items: Item[], progressMap: Record<string, Progress>): number {
  let totalW = 0, doneW = 0
  for (const it of items) {
    totalW += it.weight
    doneW  += itemPct(it, progressMap) * it.weight
  }
  return totalW > 0 ? doneW / totalW : 0
}

export function fp(v: number) { return (v * 100).toFixed(1) + '%' }

export function statusOf(pct: number, isNA?: boolean) {
  if (isNA)       return { l: '➖ N/A',       c: 'na'      }
  if (pct >= 1)   return { l: '✅ XONG',      c: 'done'    }
  if (pct >= 0.5) return { l: '🔄 ĐANG LÀM', c: 'doing'   }
  if (pct > 0)    return { l: '⏳ BẮT ĐẦU',  c: 'started' }
  return               { l: '□ CHƯA',      c: 'todo'    }
}

export function isItemNA(item: any, progressMap: Record<string, any>): boolean {
  const steps = item.steps ?? []
  if (steps.length === 0) return false
  return steps.every((s: any) => !!progressMap[s.id]?.is_na)
}

export function elapsedDays(startDate: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000))
}

export function getProjectDates(items: any[], ganttMap: Record<string, any>) {
  // BD dự án = ngày BD của mục Chuẩn bị mặt bằng (stt=24) hoặc Bàn giao mặt bằng mái (stt=26)
  const startItem = items.find(it => it.stt === 24) || items.find(it => it.stt === 26)
  const endItem   = items.find(it => it.stt === 55) // COD

  const startG = startItem ? ganttMap[startItem.id] : null
  const endG   = endItem   ? ganttMap[endItem.id]   : null

  const startDate = startG?.actual_start || startG?.plan_start || null
  const endDate   = endG?.actual_end     || endG?.plan_end     || null

  const now = new Date(); now.setHours(0,0,0,0)

  let totalDays = 60
  let elapsedDays = 0
  let weekNum = 1

  if (startDate) {
    const sd = new Date(startDate); sd.setHours(0,0,0,0)
    elapsedDays = Math.max(0, Math.floor((now.getTime() - sd.getTime()) / 86400000))
    if (endDate) {
      const ed = new Date(endDate); ed.setHours(0,0,0,0)
      totalDays = Math.max(1, Math.floor((ed.getTime() - sd.getTime()) / 86400000))
    }
    // Tuần số = số tuần từ BD dự án đến hôm nay
    weekNum = Math.ceil((elapsedDays + 1) / 7)
  }

  return { startDate, endDate, totalDays, elapsedDays, weekNum }
}

export function ganttBar(g: GanttDate | undefined, startDate: string, totalDays: number) {
  if (!g?.plan_start || !g?.plan_end) return null
  const ps = new Date(startDate).getTime()
  const s  = Math.max(0, Math.round((new Date(g.plan_start).getTime() - ps) / 86400000))
  const e  = Math.min(totalDays, Math.round((new Date(g.plan_end).getTime() - ps) / 86400000))
  return { left: (s / totalDays) * 100, width: Math.max(1, ((e - s) / totalDays) * 100) }
}
