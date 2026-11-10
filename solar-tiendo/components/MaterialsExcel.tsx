'use client'
// Nút Xuất / Nhập Excel danh sách vật tư + màn hình xem trước thay đổi
import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { exportMaterialsXlsx, parseMaterialsXlsx, MatImport } from '@/lib/materialsExcel'
import { fmtVN } from '@/lib/schedule'
import { fmtQty } from '@/lib/qty'

const btn = (c: string): React.CSSProperties => ({
  padding: '5px 12px', background: 'transparent', border: `1px solid ${c}55`, borderRadius: 8,
  color: c, fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
})
const q = (v: any) => v == null || v === '' ? '—' : fmtQty(Number(v))

export default function MaterialsExcel({ projectId, projectName, matItems, subItems, canEdit, onApplied }: {
  projectId: string; projectName: string; matItems: any[]; subItems: Record<string, any[]>
  canEdit: boolean; onApplied: () => Promise<void> | void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'' | 'export' | 'parse' | 'apply'>('')
  const [res, setRes] = useState<MatImport | null>(null)
  const [fileName, setFileName] = useState('')

  async function doExport() {
    setBusy('export')
    try { await exportMaterialsXlsx(projectName, matItems, subItems) }
    catch (e: any) { alert('Lỗi xuất file: ' + (e?.message ?? e)) }
    setBusy('')
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy('parse'); setFileName(f.name)
    try { setRes(await parseMaterialsXlsx(f, matItems, subItems)) }
    catch (err: any) { alert('Không đọc được file: ' + (err?.message ?? err)) }
    setBusy('')
  }
  async function apply() {
    if (!res) return
    setBusy('apply')
    try {
      for (const u of res.updates) {
        const { error } = await supabase.from('sub_items').update(u.after).eq('id', u.id).eq('project_id', projectId)
        if (error) throw error
      }
      if (res.inserts.length) {
        const nextSort: Record<string, number> = {}
        const rows = res.inserts.map(ins => {
          const base = nextSort[ins.item.id] ?? Math.max(0, ...(subItems[ins.item.id] ?? []).map((s: any) => s.sort_order ?? 0)) + 1
          nextSort[ins.item.id] = base + 1
          return { ...ins.after, item_id: ins.item.id, project_id: projectId, sort_order: base }
        })
        const { error } = await supabase.from('sub_items').insert(rows)
        if (error) throw error
      }
      await onApplied()
      alert(`✅ Đã cập nhật ${res.updates.length} vật tư, thêm mới ${res.inserts.length} vật tư.`)
      setRes(null)
    } catch (err: any) {
      alert('Lỗi khi cập nhật: ' + (err?.message ?? err) + '\nMột phần thay đổi có thể đã được lưu — hãy nhập lại file để kiểm tra.')
      await onApplied()
    }
    setBusy('')
  }

  const th: React.CSSProperties = { padding: '5px 8px', fontSize: 9.5, color: '#8899bb', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: 10.5, color: '#c8d8f0', borderTop: '1px solid #ffffff10', verticalAlign: 'top' }
  const diff = (a: any, b: any, f = (x: any) => x ?? '—') =>
    (a ?? null) === (b ?? null) ? <span>{f(b)}</span>
      : <span><s style={{ color: '#8899bb' }}>{f(a)}</s> → <b style={{ color: '#fbbf24' }}>{f(b)}</b></span>

  return (
    <>
      <button onClick={doExport} disabled={!!busy} style={btn('#4ade80')} title="Tải danh sách vật tư ra Excel để điền số lượng, đơn vị">
        {busy === 'export' ? '…' : '⬇️'} Xuất Excel vật tư
      </button>
      {canEdit && <>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={btn('#60a5fa')} title="Tải file Excel đã điền lên để cập nhật">
          {busy === 'parse' ? '…' : '⬆️'} Nhập Excel vật tư
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: 'none' }} />
      </>}

      {res && (
        <div onClick={() => busy !== 'apply' && setRes(null)} style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1b3e', border: '1px solid #ffffff20', borderRadius: 12,
            width: 'min(820px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', color: '#e8eaf0' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff12' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>⬆️ Xem trước thay đổi từ Excel</div>
              <div style={{ fontSize: 10, color: '#8899bb', marginTop: 2 }}>{fileName}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, flexWrap: 'wrap' }}>
                <span style={{ color: '#fbbf24' }}>✏️ Sửa: <b>{res.updates.length}</b></span>
                <span style={{ color: '#4ade80' }}>➕ Thêm mới: <b>{res.inserts.length}</b></span>
                <span style={{ color: '#8899bb' }}>Không đổi: {res.unchanged}</span>
                {res.errors.length > 0 && <span style={{ color: '#FF9999' }}>⚠️ Bỏ qua: <b>{res.errors.length}</b></span>}
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '10px 16px', flex: 1 }}>
              {res.errors.length > 0 && (
                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: '#FF444415', border: '1px solid #FF444440' }}>
                  {res.errors.map((e, i) => <div key={i} style={{ fontSize: 10.5, color: '#FF9999' }}>• {e}</div>)}
                </div>
              )}
              {res.updates.length === 0 && res.inserts.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#8899bb', fontSize: 12 }}>Không có thay đổi nào so với dữ liệu trên app.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#1a2d5a' }}>
                    <th style={th}></th><th style={th}>Hạng mục</th><th style={th}>Tên vật tư</th><th style={th}>Đơn vị</th>
                    <th style={th}>Số lượng</th><th style={th}>Ngày cần</th><th style={th}>Ghi chú</th>
                  </tr></thead>
                  <tbody>
                    {res.updates.map(u => (
                      <tr key={u.id}>
                        <td style={td}>✏️</td>
                        <td style={{ ...td, color: '#8899bb', fontSize: 9.5 }}>#{u.item.no ?? u.item.stt} {u.item.name}</td>
                        <td style={td}>{diff(u.before.name, u.after.name)}</td>
                        <td style={td}>{diff(u.before.unit, u.after.unit)}</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{diff(u.before.quantity == null ? null : Number(u.before.quantity), u.after.quantity, q)}</td>
                        <td style={td}>{diff(u.before.need_date, u.after.need_date, fmtVN)}</td>
                        <td style={td}>{diff(u.before.note, u.after.note)}</td>
                      </tr>
                    ))}
                    {res.inserts.map(ins => (
                      <tr key={'n' + ins.row} style={{ background: '#4ade800a' }}>
                        <td style={td}>➕</td>
                        <td style={{ ...td, color: '#8899bb', fontSize: 9.5 }}>#{ins.item.no ?? ins.item.stt} {ins.item.name}</td>
                        <td style={{ ...td, color: '#4ade80' }}>{ins.after.name}</td>
                        <td style={td}>{ins.after.unit ?? '—'}</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{q(ins.after.quantity)}</td>
                        <td style={td}>{fmtVN(ins.after.need_date)}</td>
                        <td style={td}>{ins.after.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #ffffff12', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 9.5, color: '#8899bb' }}>Vật tư không có trong file vẫn giữ nguyên trên app (không bị xoá).</span>
              <button onClick={() => setRes(null)} disabled={busy === 'apply'} style={{ ...btn('#8899bb'), padding: '8px 14px', fontSize: 11 }}>Huỷ</button>
              <button onClick={apply} disabled={busy === 'apply' || (res.updates.length + res.inserts.length === 0)}
                style={{ padding: '8px 16px', background: '#4ade80', border: 'none', borderRadius: 8, color: '#0d1b3e',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  opacity: res.updates.length + res.inserts.length === 0 ? 0.4 : 1 }}>
                {busy === 'apply' ? 'Đang cập nhật…' : `Áp dụng (${res.updates.length + res.inserts.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
