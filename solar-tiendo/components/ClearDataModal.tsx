'use client'
// Xoá dữ liệu đã nhập của dự án THEO NHÓM (chỉ Admin chính)
// - Tick chọn nhóm, xem số dòng sẽ xoá, gõ lại tên dự án
// - Tải file sao lưu phần sắp xoá về máy trước khi xoá
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Key = 'ticks' | 'plan' | 'actual' | 'qty' | 'materials' | 'reports'
const GROUPS: { key: Key; label: string; note: string }[] = [
  { key: 'ticks',     label: 'Tick hoàn thành / N/A',                   note: 'Bước đo khối lượng vẫn giữ % nếu không xoá khối lượng' },
  { key: 'plan',      label: 'Ngày kế hoạch',                           note: 'BD/HT kế hoạch, Đặt hàng / Có hàng (KH)' },
  { key: 'actual',    label: 'Ngày thực tế',                            note: 'BD/HT thực tế, Đặt hàng / Có hàng thực tế' },
  { key: 'qty',       label: 'Khối lượng nhập hằng ngày',               note: '% các bước đo khối lượng về 0' },
  { key: 'materials', label: 'Số lượng & ngày cần của vật tư',          note: 'Giữ tên vật tư, chỉ xoá số lượng và ngày cần' },
  { key: 'reports',   label: 'Báo cáo tuần đã lưu',                     note: '' },
]
const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9 _.,()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

export default function ClearDataModal({ projectId, projectName, onClose, onDone }: {
  projectId: string; projectName: string; onClose: () => void; onDone: () => void
}) {
  const [counts, setCounts] = useState<Record<Key, number> | null>(null)
  const [sel, setSel] = useState<Record<Key, boolean>>({ ticks: false, plan: false, actual: false, qty: false, materials: false, reports: false })
  const [typed, setTyped] = useState('')
  const [backup, setBackup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('project_data_counts', { pid: projectId }).then(({ data, error }) => {
      if (error) setErr(error.message); else setCounts(data as any)
    })
  }, [projectId])

  const chosen = GROUPS.filter(g => sel[g.key])
  const all = GROUPS.every(g => sel[g.key])
  const nameOk = typed.trim() === projectName.trim()
  const total = counts ? chosen.reduce((s, g) => s + (counts[g.key] ?? 0), 0) : 0

  async function downloadBackup() {
    const q = (t: string, cols = '*') => supabase.from(t).select(cols).eq('project_id', projectId)
    const out: Record<string, any> = { project: projectName, project_id: projectId, exported_at: new Date().toISOString(), groups: chosen.map(g => g.key) }
    if (sel.ticks) out.progress = (await q('progress')).data
    if (sel.plan || sel.actual) out.gantt_dates = (await q('gantt_dates')).data
    if (sel.qty) out.step_qty_logs = (await q('step_qty_logs')).data
    if (sel.materials) out.sub_items = (await q('sub_items', 'id, item_id, name, unit, quantity, need_date')).data
    if (sel.reports) out.weekly_reports = (await q('weekly_reports')).data
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    a.download = `Sao luu truoc khi xoa - ${safeName(projectName)} - ${d}.json`
    a.style.display = 'none'; document.body.appendChild(a); a.click()
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 3000)
  }

  async function run() {
    if (!chosen.length || !nameOk) return
    setBusy(true); setErr('')
    try {
      if (backup) await downloadBackup()
      const { data, error } = await supabase.rpc('clear_project_data', {
        pid: projectId, p_ticks: sel.ticks, p_plan: sel.plan, p_actual: sel.actual,
        p_qty: sel.qty, p_materials: sel.materials, p_reports: sel.reports,
      })
      if (error) throw error
      const r = data as Record<Key, number>
      alert('✅ Đã xoá:\n' + chosen.map(g => `• ${g.label}: ${r[g.key] ?? 0}`).join('\n') +
        (backup ? '\n\nFile sao lưu đã được tải về máy.' : ''))
      onDone()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
    setBusy(false)
  }

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: '#000000b0', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1b3e', border: '1px solid #FF444455', borderRadius: 12,
        width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', color: '#e8eaf0', padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#FF9999' }}>🗑️ Xoá dữ liệu đã nhập</div>
        <div style={{ fontSize: 11, color: '#8899bb', marginTop: 2 }}>{projectName}</div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#8899bb' }}>Chọn nhóm cần xoá:</span>
          <span onClick={() => setSel(Object.fromEntries(GROUPS.map(g => [g.key, !all])) as any)}
            style={{ fontSize: 10.5, color: '#60a5fa', cursor: 'pointer' }}>{all ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</span>
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {GROUPS.map(g => {
            const n = counts?.[g.key]
            return (
              <label key={g.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: sel[g.key] ? '#FF444414' : '#ffffff06', border: `1px solid ${sel[g.key] ? '#FF444450' : '#ffffff10'}` }}>
                <input type="checkbox" checked={sel[g.key]} onChange={e => setSel(p => ({ ...p, [g.key]: e.target.checked }))} style={{ marginTop: 2 }} />
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</span>
                  {g.note && <div style={{ fontSize: 9.5, color: '#8899bb', marginTop: 1 }}>{g.note}</div>}
                </span>
                <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: n ? '#fbbf24' : '#8899bb', whiteSpace: 'nowrap' }}>
                  {n == null ? '…' : `${n} dòng`}
                </span>
              </label>
            )
          })}
        </div>
        <div style={{ fontSize: 9.5, color: '#8899bb', marginTop: 6 }}>
          Không xoá cấu hình hạng mục, các bước, điều kiện liên quan và tên vật tư (chỉnh ở ⚙️ Hạng mục).
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 11.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} />
          💾 Tải file sao lưu phần sắp xoá về máy trước khi xoá
        </label>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: '#8899bb', marginBottom: 4 }}>Gõ lại chính xác tên dự án để xác nhận:</div>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={projectName}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0a0f1e', border: `1px solid ${nameOk ? '#4ade8070' : '#ffffff25'}`,
              borderRadius: 8, padding: '9px 10px', color: '#e8eaf0', fontFamily: 'inherit', fontSize: 12, outline: 'none' }} />
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 11, color: '#FF9999' }}>Lỗi: {err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
          {chosen.length > 0 && counts && <span style={{ flex: 1, fontSize: 10.5, color: '#fbbf24' }}>Sẽ xoá {total} dòng · không thể hoàn tác</span>}
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #ffffff25',
            borderRadius: 8, color: '#8899bb', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>Huỷ</button>
          <button onClick={run} disabled={busy || !chosen.length || !nameOk}
            style={{ padding: '8px 16px', background: '#C62828', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 700, cursor: busy || !chosen.length || !nameOk ? 'not-allowed' : 'pointer',
              opacity: busy || !chosen.length || !nameOk ? 0.45 : 1 }}>
            {busy ? 'Đang xoá…' : `🗑️ Xoá ${chosen.length ? `(${chosen.length} nhóm)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
