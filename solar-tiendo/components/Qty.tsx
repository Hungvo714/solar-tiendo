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

// ---------- Dòng khối lượng của 1 bước: 1 dòng (tự nhập tổng) hoặc mỗi vật tư 1 dòng ----------
export type QtyLine = { key: string; subItemId: string | null; label: string | null; total: number; unit: string; logs: QtyLog[] }

export const isQtyStep = (st: any) => st?.qty_total != null || (st?.qty_materials?.length ?? 0) > 0

export function stepLines(step: any, logs: QtyLog[], subById: Record<string, any>): QtyLine[] {
  const mine = logs.filter(l => l.step_id === step.id)
  if ((step.qty_materials?.length ?? 0) > 0) {
    return (step.qty_materials as string[]).map(id => subById[id]).filter(Boolean).map((sub: any) => ({
      key: sub.id, subItemId: sub.id, label: sub.name,
      total: Number(sub.quantity) || 0, unit: sub.unit ?? '',
      logs: mine.filter(l => l.sub_item_id === sub.id),
    }))
  }
  if (step.qty_total != null) return [{ key: step.id, subItemId: null, label: null,
    total: Number(step.qty_total), unit: step.qty_unit ?? '', logs: mine.filter(l => !l.sub_item_id) }]
  return []
}

// Vật tư có thể chọn: của các hạng mục vật tư mà hạng mục này đang chờ (điều kiện liên quan)
export type MatGroup = { itemId: string; title: string; subs: any[] }

// ---------- Cấu hình đo khối lượng: chọn vật tư hoặc tự nhập tổng ----------
export function QtyConfig({ projectId, step, related, others, onDone, onCancel }: {
  projectId: string; step: any; related: MatGroup[]; others: MatGroup[]
  onDone: () => void; onCancel: () => void
}) {
  const hasMats = (step.qty_materials?.length ?? 0) > 0
  const [mode, setMode] = useState<'mat' | 'manual'>(
    hasMats ? 'mat' : step.qty_total != null ? 'manual' : related.some(g => g.subs.length) ? 'mat' : 'manual')
  const [sel, setSel] = useState<Set<string>>(new Set(step.qty_materials ?? []))
  const [showOthers, setShowOthers] = useState(
    (step.qty_materials ?? []).some((id: string) => others.some(g => g.subs.some(x => x.id === id))))
  const [total, setTotal] = useState(step.qty_total != null ? String(step.qty_total) : '')
  const [unit, setUnit] = useState(step.qty_unit ?? 'tấm')
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectable = (g: MatGroup) => g.subs.filter(x => Number(x.quantity) > 0)
  const allOf = (g: MatGroup) => {
    const ids = selectable(g).map(x => x.id)
    const on = ids.every(id => sel.has(id))
    setSel(prev => { const n = new Set(prev); ids.forEach(id => on ? n.delete(id) : n.add(id)); return n })
  }

  async function saveMats() {
    if (sel.size === 0) { alert('Chọn ít nhất 1 vật tư'); return }
    setBusy(true)
    const { error } = await supabase.rpc('set_step_materials', { pid: projectId, sid: step.id, p_subs: Array.from(sel) })
    setBusy(false)
    if (error) { alert('Lỗi: ' + error.message); return }
    onDone()
  }
  async function saveManual() {
    const n = Number(String(total).replace(',', '.'))
    if (!n || n <= 0) { alert('Nhập tổng khối lượng > 0'); return }
    setBusy(true)
    const { error } = await supabase.rpc('set_step_quantity', { pid: projectId, sid: step.id, p_total: n, p_unit: unit })
    setBusy(false)
    if (error) { alert('Lỗi: ' + error.message); return }
    onDone()
  }
  async function turnOff() {
    if (!confirm('Bỏ đo theo khối lượng cho bước này?\nNhật ký đã nhập vẫn giữ lại; bước quay về tick ✓ như thường.')) return
    setBusy(true)
    const { error } = await supabase.rpc('set_step_quantity', { pid: projectId, sid: step.id, p_total: null, p_unit: null })
    setBusy(false)
    if (error) { alert('Lỗi: ' + error.message); return }
    onDone()
  }

  const tab = (m: 'mat' | 'manual', label: string) => (
    <span onClick={() => setMode(m)} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
      background: mode === m ? '#60a5fa30' : 'transparent', border: `1px solid ${mode === m ? '#60a5fa' : '#ffffff20'}`,
      color: mode === m ? '#c0d8ff' : '#8899bb' }}>{label}</span>
  )
  const group = (g: MatGroup) => {
    const ok = selectable(g)
    return (
      <div key={g.itemId} style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#c0d0ef', fontWeight: 600, marginBottom: 3 }}>
          <span style={{ flex: 1 }}>{g.title}</span>
          {ok.length > 1 && <span onClick={() => allOf(g)} style={{ fontSize: 9, color: '#60a5fa', cursor: 'pointer', fontWeight: 400 }}>
            {ok.every(x => sel.has(x.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</span>}
        </div>
        {g.subs.length === 0 && <div style={{ fontSize: 9.5, color: '#ffffff40', fontStyle: 'italic', paddingLeft: 4 }}>Chưa có vật tư trong danh sách</div>}
        {g.subs.map(x => {
          const has = Number(x.quantity) > 0
          return (
            <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 6px', borderRadius: 5,
              fontSize: 10.5, color: has ? '#e8eaf0' : '#ffffff40', cursor: has ? 'pointer' : 'not-allowed',
              background: sel.has(x.id) ? '#4ade8012' : 'transparent' }}>
              <input type="checkbox" disabled={!has} checked={sel.has(x.id)} onChange={() => toggle(x.id)} />
              <span style={{ flex: 1 }}>{x.name}</span>
              <span style={{ fontFamily: has ? 'monospace' : 'inherit', fontSize: 10, fontStyle: has ? 'normal' : 'italic' }}>
                {has ? `${fmtQty(Number(x.quantity))} ${x.unit ?? ''}` : 'chưa nhập số lượng'}
              </span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ margin: '4px 0 6px 24px', padding: '8px 10px', borderRadius: 7, background: '#60a5fa12', border: '1px solid #60a5fa40' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#93b4f0' }}>📏 Đo khối lượng:</span>
        {tab('mat', '📦 Theo vật tư')}{tab('manual', '✍️ Tự nhập tổng')}
      </div>

      {mode === 'mat' ? (<>
        {related.length === 0 && (
          <div style={{ fontSize: 9.5, color: '#fbbf24', marginBottom: 6 }}>
            Hạng mục này chưa có điều kiện chờ hạng mục vật tư nào. Có thể thêm ở ⚙️ Hạng mục → 🔗 Điều kiện, hoặc chọn trong vật tư khác bên dưới.
          </div>
        )}
        {related.map(group)}
        {others.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <span onClick={() => setShowOthers((v: boolean) => !v)} style={{ fontSize: 9.5, color: '#60a5fa', cursor: 'pointer' }}>
              {showOthers ? '▲ Ẩn' : '▼ Xem'} vật tư của các hạng mục vật tư khác
            </span>
            {showOthers && <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>{others.map(group)}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button disabled={busy} onClick={saveMats} style={btn('#1a3a1a', '#4ade80', '#4ade80')}>Lưu ({sel.size} vật tư)</button>
          {isQtyStep(step) && <button disabled={busy} onClick={turnOff} style={btn('#FF444418', '#FF444455', '#FF9999')}>Bỏ đo khối lượng</button>}
          <button onClick={onCancel} style={btn('transparent', '#ffffff25', '#8899bb')}>Huỷ</button>
        </div>
        <div style={{ fontSize: 9, color: '#8899bb', marginTop: 6 }}>
          Mỗi vật tư nhập hằng ngày riêng; % bước = trung bình % các vật tư đã chọn. Tổng lấy theo số lượng ở danh sách vật tư (sửa ở đó là tự cập nhật).
        </div>
      </>) : (<>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#8899bb' }}>Tổng:</span>
          <input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="vd 3600"
            style={{ ...inp, width: 90, fontFamily: 'monospace' }} />
          <input list="qty-units" value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inp, width: 70 }} />
          <datalist id="qty-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          <button disabled={busy} onClick={saveManual} style={btn('#1a3a1a', '#4ade80', '#4ade80')}>Lưu</button>
          {isQtyStep(step) && <button disabled={busy} onClick={turnOff} style={btn('#FF444418', '#FF444455', '#FF9999')}>Bỏ đo khối lượng</button>}
          <button onClick={onCancel} style={btn('transparent', '#ffffff25', '#8899bb')}>Huỷ</button>
        </div>
        <div style={{ fontSize: 9, color: '#8899bb', marginTop: 6 }}>
          Dùng khi không có vật tư tương ứng (lối đi, đường nước…). % = lũy kế ÷ tổng; đủ 100% tự đánh dấu xong.
        </div>
      </>)}
    </div>
  )
}

// ---------- 1 dòng khối lượng: tiến độ + ô nhập + lịch sử ----------
function QtyLineView({ projectId, step, line, planStart, planEnd, canEntry, canManageAll, userId, authors, onChanged, compact }: {
  projectId: string; step: any; line: QtyLine; planStart?: string | null; planEnd?: string | null
  canEntry: boolean; canManageAll: boolean; userId: string; authors: Record<string, string>
  onChanged: () => Promise<void> | void; compact: boolean
}) {
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayVN())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [edit, setEdit] = useState<{ id: string; qty: string; date: string; note: string } | null>(null)
  const logs = line.logs
  const s = qtyStats(line.total, line.unit, logs, planEnd)
  const stt = qtyStatus(s)
  const u = s.unit
  const name = line.label ? `${step.name} · ${line.label}` : step.name

  async function add() {
    const n = Number(qty.replace(',', '.'))
    if (!n) { alert('Nhập số lượng (có thể âm để điều chỉnh)'); return }
    if (date > todayVN()) { alert('Không nhập cho ngày trong tương lai'); return }
    if (n > 0 && s.done + n > s.total * 1.05 &&
        !confirm(`Lũy kế sẽ thành ${fmtQty(s.done + n)}/${fmtQty(s.total)} ${u} — vượt tổng. Vẫn lưu?`)) return
    setBusy(true)
    const { error } = await supabase.from('step_qty_logs').insert({
      project_id: projectId, step_id: step.id, sub_item_id: line.subItemId,
      log_date: date, qty: n, note: note.trim() || null, created_by: userId })
    setBusy(false)
    if (error) { alert('Lỗi lưu: ' + error.message); return }
    setQty(''); setNote('')
    const before = s.done
    await onChanged()
    if (before < s.total && before + n >= s.total) alert(`✅ ${name}: đã đủ ${fmtQty(s.total)} ${u}.`)
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

  if (line.total <= 0) return (
    <div style={{ fontSize: 10, color: '#fbbf24', padding: '4px 0' }}>
      {line.label ? <b>{line.label}: </b> : null}chưa có số lượng — nhập số lượng ở danh sách vật tư của hạng mục vật tư.
    </div>
  )

  return (
    <div style={{ padding: compact ? '6px 0' : 0, borderTop: compact ? '1px solid #ffffff10' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, gap: 8 }}>
            <span style={{ color: '#e8eaf0' }}>
              {line.label && <b style={{ color: '#c0d0ef', marginRight: 6 }}>📦 {line.label}</b>}
              <span style={{ fontFamily: 'monospace' }}><b style={{ color: '#4ade80' }}>{fmtQty(s.done)}</b> / {fmtQty(s.total)} {u}</span>
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

// ---------- Khối lượng của 1 bước (trang Tiến độ) ----------
export function QtyStepPanel({ projectId, step, logs, subById, planStart, planEnd, canEntry, canManageAll, userId, authors, onChanged }: {
  projectId: string; step: any; logs: QtyLog[]; subById: Record<string, any>; planStart?: string | null; planEnd?: string | null
  canEntry: boolean; canManageAll: boolean; userId: string; authors: Record<string, string>
  onChanged: () => Promise<void> | void
}) {
  const lines = stepLines(step, logs, subById)
  const multi = lines.length > 1
  const valid = lines.filter(l => l.total > 0)
  const avg = valid.length ? valid.reduce((a, l) => a + Math.min(1, Math.max(0, l.logs.reduce((x, y) => x + Number(y.qty), 0) / l.total)), 0) / valid.length : 0
  return (
    <div style={{ margin: '2px 0 6px 24px', padding: '8px 10px', borderRadius: 7, background: '#4ade800c', border: '1px solid #4ade8030' }}>
      {multi && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#c0d0ef', marginBottom: 4 }}>
          <span>Theo {lines.length} vật tư — % bước = trung bình</span>
          <b style={{ color: '#4ade80', fontFamily: 'monospace' }}>{(avg * 100).toFixed(1)}%</b>
        </div>
      )}
      {lines.length === 0 && <div style={{ fontSize: 10, color: '#fbbf24' }}>Vật tư đã chọn không còn trong danh sách — bấm 📏 để chọn lại.</div>}
      {lines.map(line => (
        <QtyLineView key={line.key} projectId={projectId} step={step} line={line} planStart={planStart} planEnd={planEnd}
          canEntry={canEntry} canManageAll={canManageAll} userId={userId} authors={authors} onChanged={onChanged} compact={multi} />
      ))}
    </div>
  )
}

// ---------- Bảng báo cáo khối lượng (Tổng quan / Báo cáo) ----------
export type QtyRow = { key: string; item: any; step: any; label: string | null; s: QtyStats; planStart: string | null }

// Chỉ lấy bước ĐANG THI CÔNG: đã có khối lượng nhập
// và chưa xong (còn khối lượng, hạng mục chưa có HT thực tế). Chưa làm / đã xong → không hiện.
export function buildQtyRows(items: any[], logs: QtyLog[], ganttMap: Record<string, any>, subById: Record<string, any> = {}): QtyRow[] {
  const rows: QtyRow[] = []
  for (const it of items) for (const st of it.steps ?? []) {
    if (!isQtyStep(st)) continue
    const g = ganttMap[it.id] ?? {}
    for (const line of stepLines(st, logs, subById)) {
      if (line.total <= 0) continue
      const s = qtyStats(line.total, line.unit, line.logs, g.plan_end ?? null)
      const started = !!s.firstDate && s.done > 0          // đã có khối lượng nhập thực tế
      const finished = s.remaining <= 0 || !!g.actual_end
      if (!started || finished) continue
      rows.push({ key: st.id + ':' + line.key, item: it, step: st, label: line.label, planStart: g.plan_start ?? null, s })
    }
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
        {late.length > 0 && <span style={{ marginLeft: 8, fontSize: 10, color: c.bad, fontWeight: 600 }}>🔴 {late.length} mục có nguy cơ trễ</span>}
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
            {rows.map(({ key, item, step, label, s, planStart }, i) => {
              const stt = qtyStatus(s)
              return (
                <tr key={key} style={{ background: i % 2 ? c.alt : 'transparent' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>#{item.no ?? item.stt} {item.name}</div>
                    <div style={{ fontSize: 9.5, color: c.sub }}>{step.name}{label ? <b> · {label}</b> : null}</div>
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
