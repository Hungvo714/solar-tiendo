'use client'
// Báo cáo ĐẶT HÀNG vật tư: vật tư trễ kế hoạch đặt hàng + kế hoạch đặt hàng tuần tới
import { orderInfo, nextWeekRange } from '@/lib/order'
import { fmtVN, diffDays } from '@/lib/schedule'
import { fmtQty, todayVN } from '@/lib/qty'

type Props = {
  items: any[]; progressMap: Record<string, any>; ganttMap: Record<string, any>
  subItems: Record<string, any[]>; deps: { item_id: string; depends_on_item_id: string }[]
  weekLabel: string; light?: boolean
}

export default function OrderReport({ items, progressMap, ganttMap, subItems, deps, weekLabel, light = false }: Props) {
  const today = todayVN()
  const { from, to } = nextWeekRange(today)
  const byId: Record<string, any> = Object.fromEntries(items.map(i => [i.id, i]))
  const mats = items.filter(i => (i.group_type ?? 'B') === 'A')
    .map(it => ({ it, o: orderInfo(it, progressMap, ganttMap, today)! }))

  const late = mats.filter(x => x.o.late).sort((a, b) => b.o.lateDays - a.o.lateDays)
  const nextWeek = mats.filter(x => !x.o.ordered && x.o.planOrder && x.o.planOrder >= from && x.o.planOrder <= to)
    .sort((a, b) => a.o.planOrder!.localeCompare(b.o.planOrder!))
  // Sắp tới hạn trong tuần này (sau hôm nay, trước tuần tới) — nhắc thêm
  const soon = mats.filter(x => !x.o.ordered && x.o.planOrder && x.o.planOrder > today && x.o.planOrder < from)
    .sort((a, b) => a.o.planOrder!.localeCompare(b.o.planOrder!))

  const c = light
    ? { bg: '#fff', head: '#1F3864', headTx: '#fff', tx: '#1a1a1a', sub: '#555', bd: '#d0d7e2', alt: '#f4f7fb', bad: '#C62828', warn: '#B26A00', title: '#1F3864', okBg: '#f4f7fb' }
    : { bg: '#0d1b3e', head: '#1a2d5a', headTx: '#8899bb', tx: '#c8d8f0', sub: '#8899bb', bd: '#ffffff10', alt: '#ffffff05', bad: '#FF9999', warn: '#fbbf24', title: '#c0d0ef', okBg: '#ffffff08' }
  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 9.5, fontWeight: 600, color: c.headTx, textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 10.5, color: c.tx, borderTop: `1px solid ${c.bd}`, verticalAlign: 'top' }
  const name = (it: any) => `#${it.no ?? it.stt} ${it.name}`
  const mainSubs = (it: any) => (subItems[it.id] ?? []).filter((s: any) => Number(s.quantity) > 0)
  const waiting = (it: any) => deps.filter(d => d.depends_on_item_id === it.id).map(d => byId[d.item_id]).filter(Boolean)
  const subsText = (it: any) => mainSubs(it).map((s: any) => `${s.name} ${fmtQty(Number(s.quantity))}${s.unit ? ' ' + s.unit : ''}`).join(' · ')

  const box = (children: React.ReactNode) => (
    <div style={{ overflowX: 'auto', border: `1px solid ${c.bd}`, borderRadius: 8, background: c.bg }}>{children}</div>
  )
  const empty = (t: string) => (
    <div style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11, background: c.okBg, color: c.sub, border: `1px solid ${c.bd}` }}>{t}</div>
  )

  if (mats.every(x => !x.o.planOrder)) return null     // chưa nhập kế hoạch vật tư nào

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Trễ đặt hàng */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.title, margin: '4px 0 6px' }}>
        🔴 Vật tư trễ kế hoạch đặt hàng {late.length > 0 && <span style={{ color: c.bad }}>({late.length})</span>}
      </div>
      {late.length === 0 ? empty('✅ Không có vật tư nào trễ kế hoạch đặt hàng') : box(
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead style={{ background: c.head }}><tr>
            <th style={th}>Vật tư</th><th style={th}>Đặt hàng KH</th><th style={th}>Trễ</th>
            <th style={th}>Có hàng KH</th><th style={th}>Hạng mục đang chờ</th>
          </tr></thead>
          <tbody>
            {late.map(({ it, o }, i) => {
              const w = waiting(it)
              return (
                <tr key={it.id} style={{ background: i % 2 ? c.alt : 'transparent' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{name(it)}</div>
                    {subsText(it) && <div style={{ fontSize: 9.5, color: c.sub }}>{subsText(it)}</div>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtVN(o.planOrder)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: c.bad, fontWeight: 700 }}>
                    {o.lateDays === 0 ? 'Hạn hôm nay' : `${o.lateDays} ngày`}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtVN(o.planArrive)}</td>
                  <td style={{ ...td, fontSize: 9.5, color: c.sub }}>
                    {w.length ? w.map(x => `#${x.no ?? x.stt} ${x.name}`).join(', ') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Kế hoạch đặt hàng tuần tới */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.title, margin: '12px 0 6px' }}>
        🛒 Kế hoạch đặt hàng tuần tới — {weekLabel}
      </div>
      {nextWeek.length === 0 ? empty('Không có vật tư nào cần đặt hàng trong tuần tới') : box(
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead style={{ background: c.head }}><tr>
            <th style={th}>Vật tư</th><th style={th}>Đặt hàng KH</th><th style={th}>Gia công / giao</th>
            <th style={th}>Có hàng KH</th><th style={th}>Hạng mục đang chờ</th>
          </tr></thead>
          <tbody>
            {nextWeek.map(({ it, o }, i) => {
              const w = waiting(it)
              const lead = o.planOrder && o.planArrive ? diffDays(o.planOrder, o.planArrive) : it.order_days
              return (
                <tr key={it.id} style={{ background: i % 2 ? c.alt : 'transparent' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{name(it)}</div>
                    {subsText(it) && <div style={{ fontSize: 9.5, color: c.sub }}>{subsText(it)}</div>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtVN(o.planOrder)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{lead != null ? `${lead} ngày` : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtVN(o.planArrive)}</td>
                  <td style={{ ...td, fontSize: 9.5, color: c.sub }}>
                    {w.length ? w.map(x => `#${x.no ?? x.stt} ${x.name}`).join(', ') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {soon.length > 0 && (
        <div style={{ fontSize: 10, color: c.warn, marginTop: 6 }}>
          ⏰ Sắp tới hạn trong tuần này: {soon.map(({ it, o }) => `${name(it)} (${fmtVN(o.planOrder)})`).join(' · ')}
        </div>
      )}
      <div style={{ fontSize: 9, color: c.sub, marginTop: 4 }}>
        Trễ đặt hàng = đã tới ngày “Đặt hàng (KH)” mà chưa tick bước đặt hàng (bước đầu tiên của hạng mục vật tư) và chưa có “Đặt hàng thực tế”.
      </div>
    </div>
  )
}
