'use client'
// Bước đo theo KHỐI LƯỢNG: nhập hằng ngày (Tiến độ) + báo cáo năng suất / dự báo (Tổng quan, Báo cáo)
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { QtyLog } from '@/lib/queries'
import { fmtVN } from '@/lib/schedule'
import { qtyStats, qtyStatus, fmtQty, todayVN, QtyStats } from '@/lib/qty'

const UNITS = ['tấm', 'm', 'bộ', 'cái', 'm²', 'thanh', 'kg']

const inp: React.CSSProperties = {
  background: '#0a0f1e', border: '1px solid #ffffff25', borderRadius: 5, padding: '5px 8px',
  color: '#e8eaf0', fontFamily: 'inherit', fontSize: 11, outline: 'none', colorScheme: 'dark' as any,
}
const btn = (bg: string, bd: string, c: string): React.CSSProperties => ({
  fontSize: 10, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: bg,
  border: `1px solid ${bd}`, color: c, fontFamily: 'inherit', whiteSpace: 'nowrap',
})

// ---------- Đường lũy kế nhỏ (thực tế vs kế hoạch) ----------
export function Sparkline({ s, planStart, width = 160, height = 36 }:
  { s: QtyStats; planStart?: string | null; width?: number; height?: number }) {
  if (!s.series.length) return null
  const pts = s.series
  const start = [planStart, pts[0].date].filter(Boolean).sort()[0] as string
  const endCands = [s.planEnd, s.forecast, pts[pts.length - 1].date, todayVN()].filter(Boolean) as string[]
  const end = endCands.sort()[endCands.length - 1]
  const t = (d: string) => new Date(d + 'T00:00:00Z').getTime()
  const span = Math.max(1, t(end) - t(start))
  const x = (d: string) => ((t(d) - t(start)) / span) * (width - 4) + 2
  const y = (v: number) => height - 2 - (Math.min(v, s.total) / Math.max(1, s.total)) * (height - 4)
  let path = `M${x(pts[0].date)},${y(0)}`
  for (const p of pts) path += ` L${x(p.date)},${y(p.cum)}`
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-label="Đường lũy kế khối lượng">
      <line x1={2} y1={y(s.total)} x2={width - 2} y2={y(s.total)} stroke="#ffffff20" strokeDasharray="3 3" />
      {planStart && s.planEnd && (
        <line x1={x(planStart)} y1={y(0)} x2={x(s.planEnd)} y2={y(s.total)} stroke="#60a5fa" strokeWidth={1} strokeDasharray="4 3" />
      )}
      {s.forecast && s.remaining > 0 && (
        <line x1={x(last.date)} y1={y(last.cum)} x2={x(s.forecast)} y2={y(s.total)} stroke="#fbbf24" strokeWidth={1} strokeDasharray="2 2" />
      )}
      <path d={path} fill="none" stroke="#4ade80" strokeWidth={1.8} />
      <circle cx={x(last.date)} cy={y(last.cum)} r={2.5} fill="#4ade80" />
    </svg>
  )
}

// ---------- Đặt / bỏ tổng khối lượng ----------
export function QtyConfig({ projectId, step, onDone, onCancel }:
  { projectId: string; step: any; onDone: () => void; onCancel: () => void }) {
  const [total, setTotal] = useState(step.qty_total != null ? String(step.qty_total) : '')
  const [unit, setUnit] = useState(step.qty_unit ?? 'tấm')
  const [busy, setBusy] = useState(false)
  async function save(off = false) {
    const n = off ? null : Number(String(total).replace(',', '.'))
    if (!off && (!n || n <= 0)) { alert('Nhập tổng khối lượng > 0'); return }
    if (off && !confirm('Bỏ đo theo khối lượng cho bước này?\nNhật ký đã nhập vẫn giữ lại; bước quay về tick ✓ như thường.')) return
    setBusy(true)
    const { error } = await supabase.rpc('set_step_quantity', { pid: projectId, sid: step.id, p_total: n, p_unit: off ? null : unit })
    setBusy(false)
    if (error) { alert('Lỗi: ' + error.message); return }
    onDone()
  }
  return (
    <div style={{ margin: '4px 0 6px 24px', padding: '8px 10px', borderRadius: 7, background: '#60a5fa12',
      border: '1px solid #60a5fa40', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#93b4f0' }}>📏 Tổng khối lượng:</span>
      <input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="vd 3600"
        style={{ ...inp, width: 90, fontFamily: 'monospace' }} />
      <input list="qty-units" value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inp, width: 70 }} />
      <datalist id="qty-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <button disabled={busy} onClick={() => save()} style={btn('#1a3a1a', '#4ade80', '#4ade80')}>Lưu</button>
      {step.qty_total != null && <button disabled={busy} onClick={() => save(true)} style={btn('#FF444418', '#FF444455', '#FF9999')}>Bỏ đo khối lượng</button>}
      <button onClick={onCancel} style={btn('transparent', '#ffffff25', '#8899bb')}>Huỷ</button>
      <div style={{ width: '100%', fontSize: 9, color: '#8899bb' }}>
        Bước này sẽ tính % theo lũy kế ÷ tổng; đủ 100% tự đánh dấu xong. Ngày nhập đầu tiên tự điền “BD thực tế” nếu đang trống.
      </div>
    </div>
  )
}

// ---------- Ô nhập hằng ngày + lịch sử (trang Tiến độ) ----------
export function QtyStepPanel({ projectId, step, logs, planStart, planEnd, canEntry, canManageAll, userId, authors, onChanged }: {
  projectId: string; step: any; logs: QtyLog[]; planStart?: string | null; planEnd?: string | null
  canEntry: boolean; canManageAll: boolean; userId: string; authors: Record<string, string>
  onChanged: () => Promise<void> | void
}) {
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayVN())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [edit, setEdit] = useState<{ id: string; qty: string; date: string; note: string } | null>(null)
  const s = qtyStats(Number(step.qty_total), step.qty_unit, logs, planEnd)
  const stt = qtyStatus(s)
  const u = s.unit

  async function add() {
    const n = Number(qty.replace(',', '.'))
    if (!n) { alert('Nhập số lượng (có thể âm để điều chỉnh)'); return }
    if (date > todayVN()) { alert('Không nhập cho ngày trong tương lai'); return }
    if (n > 0 && s.done + n > s.total * 1.05 &&
        !confirm(`Lũy kế sẽ thành ${fmtQty(s.done + n)}/${fmtQty(s.total)} ${u} — vượt tổng. Vẫn lưu?`)) return
    setBusy(true)
    const { error } = await supabase.from('step_qty_logs').insert({
      project_id: projectId, step_id: step.id, log_date: date, qty: n, note: note.trim() || null, created_by: userId })
    setBusy(false)
    if (error) { alert('Lỗi lưu: ' + error.message); return }
    setQty(''); setNote('')
    const before = s.done
    await onChanged()
    if (before < s.total && before + n >= s.total) alert(`✅ ${step.name}: đã đủ ${fmtQty(s.total)} ${u}.\nNhớ nhập “HT thực tế” cho hạng mục nếu toàn bộ đã xong.`)
  }
  async function saveEdit() {
    if (!edit) return
    const n = Number(edit.qty.replace(',', '.'))
    if (!n) { alert('Số lượng phải khác 0'); return }
    if (edit.date > todayVN()) { alert('Không nhập cho ngày trong tương lai'); return }
    const { error } = await supabase.from('step_qty_logs').update({ qty: n, log_date: edit.date, note: edit.note.trim() || null }).eq('id', edit.id)
    if (error) { alert('Lỗi: ' + error.message); return }
    setEdit(null); await onChanged()
  }
  async function del(id: string) {
    if (!confirm('Xoá dòng nhập này?')) return
    const { error } = await supabase.from('step_qty_logs').delete().eq('id', id)
    if (error) { alert('Lỗi: ' + error.message); return }
    await onChanged()
  }

  const mine = (l: QtyLog) => canManageAll || (canEntry && l.created_by === userId)
  const hist = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at))

  return (
    <div style={{ margin: '2px 0 6px 24px', padding: '8px 10px', borderRadius: 7, background: '#4ade800c', border: '1px solid #4ade8030' }}>
      {/* Tiến độ khối lượng */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: '#e8eaf0', fontFamily: 'monospace' }}>
              <b style={{ color: '#4ade80' }}>{fmtQty(s.done)}</b> / {fmtQty(s.total)} {u}
            </span>
            <span style={{ fontFamily: 'monospace', color: '#4ade80', fontWeight: 700 }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: 6, background: '#ffffff12', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${s.pct * 100}%`, background: '#4ade80', transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9.5, color: '#8899bb', marginTop: 4, lineHeight: 1.6 }}>
            Còn <b style={{ color: '#c0d0ef' }}>{fmtQty(s.remaining)} {u}</b>
            {' · '}Năng suất 7 ngày <b style={{ color: '#c0d0ef' }}>{fmtQty(Math.round(s.rate7 * 10) / 10)} {u}/ngày</b>
            {s.remaining > 0 && s.forecast && <> · Dự kiến xong <b style={{ color: '#fbbf24' }}>{fmtVN(s.forecast)}</b></>}
            {s.planEnd && <> · HT KH {fmtVN(s.planEnd)}</>}
            {s.needRate != null && s.lateDays != null && s.lateDays > 0 && <> · cần <b style={{ color: '#FF9999' }}>{fmtQty(Math.ceil(s.needRate))} {u}/ngày</b> để kịp</>}
            {' · '}<span style={{ color: stt.color }}>{stt.label}</span>
          </div>
        </div>
        <Sparkline s={s} planStart={planStart} />
      </div>

      {/* Nhập hôm nay */}
      {canEntry && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} placeholder={`+ số ${u || 'lượng'}`}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            style={{ ...inp, width: 96, fontFamily: 'monospace', borderColor: '#4ade8060' }} />
          <input type="date" value={date} max={todayVN()} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 130 }} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (khu vực, tổ đội…)"
            style={{ ...inp, flex: 1, minWidth: 120 }} />
          <button disabled={busy} onClick={add} style={btn('#1a3a1a', '#4ade80', '#4ade80')}>{busy ? '…' : 'Lưu'}</button>
        </div>
      )}

      {/* Lịch sử */}
      <div style={{ marginTop: 6 }}>
        <span onClick={() => setShowHist(v => !v)} style={{ fontSize: 9.5, color: '#60a5fa', cursor: 'pointer' }}>
          {showHist ? '▲' : '▼'} Lịch sử nhập ({logs.length}){s.today ? ` · hôm nay +${fmtQty(s.today)} ${u}` : ''}
        </span>
        {showHist && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
            {hist.length === 0 && <div style={{ fontSize: 10, color: '#ffffff40', fontStyle: 'italic' }}>Chưa có dữ liệu</div>}
            {hist.map(l => edit?.id === l.id ? (
              <div key={l.id} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="date" value={edit.date} max={todayVN()} onChange={e => setEdit({ ...edit, date: e.target.value })} style={{ ...inp, width: 124 }} />
                <input inputMode="decimal" value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} style={{ ...inp, width: 80, fontFamily: 'monospace' }} />
                <input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} style={{ ...inp, flex: 1, minWidth: 100 }} />
                <button onClick={saveEdit} style={btn('#1a3a1a', '#4ade80', '#4ade80')}>Lưu</button>
                <button onClick={() => setEdit(null)} style={btn('transparent', '#ffffff25', '#8899bb')}>Huỷ</button>
              </div>
            ) : (
              <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: '#8899bb',
                padding: '3px 6px', borderRadius: 5, background: '#ffffff05' }}>
                <span style={{ width: 70 }}>{fmtVN(l.log_date)}</span>
                <span style={{ width: 80, fontFamily: 'monospace', color: l.qty < 0 ? '#FF9999' : '#4ade80' }}>
                  {l.qty > 0 ? '+' : ''}{fmtQty(l.qty)} {u}
                </span>
                <span style={{ flex: 1, color: '#c0d0ef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.note ?? ''}</span>
                <span style={{ fontSize: 9 }}>{l.created_by ? authors[l.created_by] ?? '' : ''}</span>
                {mine(l) && <>
                  <span title="Sửa" onClick={() => setEdit({ id: l.id, qty: String(l.qty), date: l.log_date, note: l.note ?? '' })} style={{ cursor: 'pointer' }}>✏️</span>
                  <span title="Xoá" onClick={() => del(l.id)} style={{ cursor: 'pointer' }}>🗑️</span>
                </>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Bảng báo cáo khối lượng (Tổng quan / Báo cáo) ----------
export type QtyRow = { item: any; step: any; s: QtyStats; planStart: string | null }

// Chỉ lấy bước ĐANG THI CÔNG: đã có khối lượng nhập (hoặc hạng mục đã có BD thực tế)
// và chưa xong (còn khối lượng, hạng mục chưa có HT thực tế). Chưa làm / đã xong → không hiện.
export function buildQtyRows(items: any[], logs: QtyLog[], ganttMap: Record<string, any>): QtyRow[] {
  const rows: QtyRow[] = []
  for (const it of items) for (const st of it.steps ?? []) {
    if (st.qty_total == null) continue
    const g = ganttMap[it.id] ?? {}
    const s = qtyStats(Number(st.qty_total), st.qty_unit, logs.filter(l => l.step_id === st.id), g.plan_end ?? null)
    const started = s.done > 0 || !!g.actual_start
    const finished = s.remaining <= 0 || !!g.actual_end
    if (!started || finished) continue
    rows.push({ item: it, step: st, planStart: g.plan_start ?? null, s })
  }
  return rows
}

export function QtyReport({ rows, light = false, title = '📏 Khối lượng đang thi công' }: { rows: QtyRow[]; light?: boolean; title?: string }) {
  if (!rows.length) return null
  const c = light
    ? { bg: '#fff', head: '#1F3864', headTx: '#fff', tx: '#1a1a1a', sub: '#555', bd: '#d0d7e2', alt: '#f4f7fb', ok: '#2E7D32', bad: '#C62828', warn: '#B26A00' }
    : { bg: '#0d1b3e', head: '#1a2d5a', headTx: '#8899bb', tx: '#c8d8f0', sub: '#8899bb', bd: '#ffffff10', alt: '#ffffff05', ok: '#4ade80', bad: '#FF9999', warn: '#fbbf24' }
  const col = (k: string) => k === '#4ade80' ? c.ok : k === '#FF9999' ? c.bad : k === '#fbbf24' ? c.warn : c.sub
  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 9.5, fontWeight: 600, color: c.headTx, textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 10.5, color: c.tx, borderTop: `1px solid ${c.bd}`, verticalAlign: 'middle' }
  const late = rows.filter(r => r.s.remaining > 0 && ((r.s.lateDays ?? 0) > 0 || (r.s.firstDate && r.s.rate7 <= 0)))
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: light ? '#1F3864' : '#c0d0ef', marginBottom: 6 }}>
        {title}
        {late.length > 0 && <span style={{ marginLeft: 8, fontSize: 10, color: c.bad, fontWeight: 600 }}>🔴 {late.length} bước có nguy cơ trễ</span>}
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${c.bd}`, borderRadius: 8, background: c.bg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead style={{ background: c.head }}>
            <tr>
              <th style={th}>Hạng mục / Bước</th><th style={th}>Lũy kế / Tổng</th><th style={th}>%</th>
              <th style={th}>NS 7 ngày</th><th style={th}>Dự kiến xong</th><th style={th}>HT KH</th>
              <th style={th}>Tình trạng</th><th style={th}>Lũy kế</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, step, s, planStart }, i) => {
              const stt = qtyStatus(s)
              return (
                <tr key={step.id} style={{ background: i % 2 ? c.alt : 'transparent' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>#{item.no ?? item.stt} {item.name}</div>
                    <div style={{ fontSize: 9.5, color: c.sub }}>{step.name}</div>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtQty(s.done)} / {fmtQty(s.total)} {s.unit}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{(s.pct * 100).toFixed(1)}%</td>
                  <td style={{ ...td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtQty(Math.round(s.rate7 * 10) / 10)} {s.unit}/ng</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.remaining <= 0 ? fmtVN(s.lastDate) : s.forecast ? fmtVN(s.forecast) : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtVN(s.planEnd)}</td>
                  <td style={{ ...td, color: col(stt.color), whiteSpace: 'nowrap' }}>
                    {stt.label}
                    {s.needRate != null && (s.lateDays ?? 0) > 0 && <div style={{ fontSize: 9, color: c.sub }}>cần {fmtQty(Math.ceil(s.needRate))} {s.unit}/ngày</div>}
                  </td>
                  <td style={td}><Sparkline s={s} planStart={planStart} width={110} height={28} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: c.sub, marginTop: 4 }}>
        Đường xanh lá: lũy kế thực tế · xanh dương đứt: kế hoạch (BD→HT KH) · vàng đứt: dự báo theo năng suất 7 ngày
      </div>
    </div>
  )
}
