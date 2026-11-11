'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getItemsForProject, getZones } from '@/lib/queries'

// ⚙️ Cấu hình hạng mục của 1 dự án — chỉ Admin chính
//  - Ẩn / khôi phục hạng mục mẫu
//  - Thêm hạng mục mới (tự nhập danh sách bước)
//  - Sửa điều kiện liên quan ("mục này chờ mục số ...")

type Step = { id?: string; name: string; weight: number; hidden?: boolean; is_extra?: boolean; base_name?: string; base_weight?: number; delete?: boolean }
type It = {
  id: string; stt: number; name: string; zone_id: string; group_type: 'A'|'B'|'C'; weight: number
  order_days?: number; project_id: string|null; hidden: boolean; steps: Step[]
  no: number | null          // số thứ tự hiển thị liên tục (null nếu bị ẩn)
}
type Dep = { item_id: string; depends_on_item_id: string; lag_days?: number; same_day?: boolean }
type Zone = { id: string; label: string }

const C = { bg:'#0a0f1e', card:'#0d1b3e', line:'#ffffff12', text:'#e8eaf0', mute:'#8899bb', acc:'#F5A623' }
const inp: React.CSSProperties = {
  width:'100%', background:C.bg, border:'1px solid #ffffff20', borderRadius:7, padding:'8px 10px',
  color:C.text, fontFamily:'inherit', fontSize:12, outline:'none', boxSizing:'border-box',
}
const btn = (bg: string, c: string, bd?: string): React.CSSProperties => ({
  padding:'6px 11px', background:bg, color:c, border: bd ? `1px solid ${bd}` : 'none', borderRadius:7,
  fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit',
})
const GROUP: Record<string, { l: string; c: string }> = {
  A: { l:'A · Vật tư',     c:'#fbbf24' },
  B: { l:'B · Thi công',   c:'#60a5fa' },
  C: { l:'C · Hoàn thiện', c:'#4ade80' },
}
const STEP_PRESET: Record<string, Step[]> = {
  A: [
    { name:'Lập danh sách & đặt hàng', weight:3 },
    { name:'Vận chuyển đến công trình', weight:3 },
    { name:'Kiểm đếm & nghiệm thu vật tư', weight:4 },
    { name:'Nhập kho / sắp xếp tại công trình', weight:90 },
  ],
  B: [
    { name:'Chuẩn bị / vận chuyển vật tư đến vị trí', weight:10 },
    { name:'Đánh dấu vị trí theo bản vẽ', weight:10 },
    { name:'Thi công', weight:60 },
    { name:'Kiểm tra, hoàn thiện', weight:10 },
    { name:'Nghiệm thu', weight:10 },
  ],
  C: [
    { name:'Kiểm tra trước thực hiện', weight:20 },
    { name:'Thực hiện', weight:50 },
    { name:'Kiểm tra kết quả', weight:20 },
    { name:'Nghiệm thu & ký biên bản', weight:10 },
  ],
}

// Có tạo vòng lặp không: thêm "item chờ dep" mà dep (gián tiếp) lại chờ item
function createsCycle(itemId: string, newDeps: string[], deps: Dep[]) {
  const graph: Record<string, string[]> = {}
  for (const d of deps) if (d.item_id !== itemId) (graph[d.item_id] ??= []).push(d.depends_on_item_id)
  graph[itemId] = newDeps
  const seen = new Set<string>()
  const stack = [...newDeps]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === itemId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    stack.push(...(graph[cur] ?? []))
  }
  return false
}

export default function ItemsConfigPage() {
  const [pid, setPid]           = useState('')
  const [project, setProject]   = useState<any>(null)
  const [zones, setZones]       = useState<Zone[]>([])
  const [items, setItems]       = useState<It[]>([])
  const [deps, setDeps]         = useState<Dep[]>([])
  const [ready, setReady]       = useState(false)
  const [busy, setBusy]         = useState(false)
  const [q, setQ]               = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [editDeps, setEditDeps] = useState<It|null>(null)
  const [editItem, setEditItem] = useState<It|null>(null)
  const [editSteps, setEditSteps] = useState<It|null>(null)
  const [adding, setAdding]     = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('project') || ''
    if (!p) { window.location.href = '/projects'; return }
    setPid(p)
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: sup } = await supabase.rpc('is_super_admin')
      if (!sup) { window.location.href = '/projects'; return }
      const [{ data: proj }, z] = await Promise.all([
        supabase.from('projects').select('id,name,client').eq('id', p).single(), getZones(),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      setProject(proj); setZones(z as Zone[])
      await reload(p)
      setReady(true)
    })()
  }, [])

  async function reload(p = pid) {
    const [it, { data: d }] = await Promise.all([
      getItemsForProject(p, { includeHidden: true, includeHiddenSteps: true }),
      supabase.from('project_item_dependencies').select('item_id, depends_on_item_id, lag_days, same_day').eq('project_id', p),
    ])
    setItems(it as It[]); setDeps((d ?? []) as Dep[])
  }

  async function run(fn: () => Promise<any>) {
    setBusy(true)
    try { await fn(); await reload() }
    catch (e: any) { alert('Lỗi: ' + (e?.message ?? e)) }
    finally { setBusy(false) }
  }
  const rpc = async (name: string, args: any) => {
    const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data
  }

  const byId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const zoneLabel = (id: string) => zones.find(z => z.id === id)?.label ?? id
  const visible = items.filter(i => !i.hidden)
  const hidden  = items.filter(i => i.hidden)
  const depsOf  = (id: string) => deps.filter(d => d.item_id === id).map(d => byId[d.depends_on_item_id]).filter(Boolean)
  const lagOf   = (id: string, pre: string) => deps.find(d => d.item_id === id && d.depends_on_item_id === pre)?.lag_days ?? 0
  const sameOf  = (id: string, pre: string) => !!deps.find(d => d.item_id === id && d.depends_on_item_id === pre)?.same_day
  const waitingOn = (id: string) => deps.filter(d => d.depends_on_item_id === id).map(d => byId[d.item_id]).filter(i => i && !i.hidden)

  const k = q.trim().toLowerCase()
  const match = (i: It) => !k || String(i.no) === k || i.name.toLowerCase().includes(k)

  if (!ready) return <div style={{ minHeight:'100vh', background:C.bg, color:C.mute, display:'flex',
    alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>Đang tải...</div>

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'system-ui,sans-serif', fontSize:13 }}>
      {editDeps && (
        <DepsModal item={editDeps} items={visible} current={depsOf(editDeps.id).map(i => i.id)} busy={busy}
          lags={Object.fromEntries(deps.filter(d => d.item_id === editDeps.id).map(d => [d.depends_on_item_id, d.lag_days ?? 0]))}
          same={Object.fromEntries(deps.filter(d => d.item_id === editDeps.id).map(d => [d.depends_on_item_id, !!d.same_day]))}
          onClose={() => setEditDeps(null)}
          onSave={(ids, lags, same) => {
            if (createsCycle(editDeps.id, ids, deps)) {
              alert('Không lưu được: điều kiện này tạo vòng lặp (mục A chờ B, B lại chờ A). Kiểm tra lại các mục đã chọn.')
              return
            }
            run(async () => {
              await rpc('set_item_dependencies', { pid, p_item: editDeps.id, p_depends: ids, p_lags: ids.map(id => lags[id] ?? 0), p_same: ids.map(id => !!same[id]) })
              setEditDeps(null)
            })
          }}/>
      )}
      {adding && (
        <ItemModal zones={zones} items={visible} busy={busy} onClose={() => setAdding(false)}
          onSave={(f) => run(async () => {
            await rpc('add_project_item', {
              pid, p_name: f.name, p_zone: f.zone, p_group: f.group, p_weight: f.weight,
              p_steps: f.steps, p_depends: f.depends, p_order_days: f.orderDays,
              p_after: f.after || null,
            })
            setAdding(false)
          })}/>
      )}
      {editSteps && (
        <StepsModal item={editSteps} busy={busy} onClose={() => setEditSteps(null)}
          onSave={(list) => run(async () => {
            await rpc('save_item_steps', {
              pid, p_item: editSteps.id,
              p_steps: list.map(x => ({ id: x.id ?? null, name: x.name, weight: x.weight, hidden: !!x.hidden, delete: !!x.delete })),
            })
            setEditSteps(null)
          })}/>
      )}
      {editItem && (
        <ItemModal zones={zones} items={visible} busy={busy} edit={editItem} onClose={() => setEditItem(null)}
          onSave={(f) => run(async () => {
            await rpc('update_project_item', { p_item: editItem.id, p_name: f.name, p_zone: f.zone, p_weight: f.weight })
            // Đổi vị trí nếu chọn mốc khác
            const idx = visible.findIndex(i => i.id === editItem.id)
            const prevId = idx > 0 ? visible[idx - 1].id : ''
            if (f.after && f.after !== prevId) {
              await rpc('move_project_item', { pid, p_item: editItem.id, p_after: f.after })
            }
            setEditItem(null)
          })}/>
      )}

      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)', padding:'14px 20px', display:'flex',
        alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${C.line}`, position:'sticky', top:0, zIndex:50 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>⚙️ Cấu hình hạng mục</div>
          <div style={{ fontSize:10, color:C.mute, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {project?.name}
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => window.location.href = `/progress?project=${pid}`} style={btn('transparent', C.mute, '#ffffff20')}>Tiến độ</button>
          <button onClick={() => window.location.href = '/projects'} style={btn('transparent', C.mute, '#ffffff20')}>← Dự án</button>
        </div>
      </header>

      <main style={{ maxWidth:860, margin:'0 auto', padding:20 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:12, color:C.mute }}>
            <b style={{ color:C.text }}>{visible.length}</b> hạng mục đang dùng ·
            <b style={{ color:C.text }}> {hidden.length}</b> đã ẩn ·
            <b style={{ color:C.text }}> {items.filter(i => i.project_id).length}</b> mục thêm riêng
          </div>
          <div style={{ flex:1 }}/>
          <button onClick={() => setAdding(true)} style={btn(C.acc, '#0d1b3e')}>+ Thêm hạng mục</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm theo số thứ tự hoặc tên hạng mục..."
          style={{ ...inp, padding:'10px 12px', marginBottom:14 }}/>
        <div style={{ fontSize:11, color:C.mute, marginBottom:14, lineHeight:1.6 }}>
          💡 <b>Ẩn</b>: mục không còn hiện ở Tiến độ / Gantt / Báo cáo và không tính vào %, dữ liệu đã nhập vẫn giữ, khôi phục lại được.
          <br/>💡 <b>Điều kiện</b>: "mục này chờ mục số …". Ngày bắt đầu của mục sẽ không được sớm hơn ngày hoàn thành của các mục nó chờ.
        </div>

        {(['A','B','C'] as const).map(g => {
          const list = visible.filter(i => i.group_type === g && match(i))
          if (!list.length) return null
          return (
            <div key={g} style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:700, color:GROUP[g].c, margin:'0 0 8px' }}>{GROUP[g].l} ({list.length})</div>
              {list.map(it => {
                const ds = depsOf(it.id).filter(d => !d.hidden)
                const hiddenDeps = depsOf(it.id).filter(d => d.hidden)
                const wo = waitingOn(it.id)
                return (
                  <div key={it.id} style={{ background:C.card, border:`1px solid ${it.project_id ? '#F5A62355' : C.line}`,
                    borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                      <div style={{ width:30, flexShrink:0, fontWeight:700, color:GROUP[g].c, fontFamily:'monospace', fontSize:13 }}>
                        {it.no}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>
                          {it.name}
                          {it.project_id && <span style={{ marginLeft:6, fontSize:10, color:C.acc, border:`1px solid ${C.acc}66`,
                            borderRadius:5, padding:'0 5px' }}>Riêng dự án</span>}
                        </div>
                        <div style={{ fontSize:10, color:C.mute, marginTop:2 }}>
                          {zoneLabel(it.zone_id)} · trọng số {it.weight} · {(it.steps ?? []).filter(x => !x.hidden).length} bước
                          {(it.steps ?? []).some(x => x.hidden || x.is_extra || (x.base_name && x.base_name !== x.name) || (x.base_weight != null && x.base_weight !== x.weight))
                            && <span style={{ color:C.acc }}> · đã chỉnh bước</span>}
                        </div>
                        <div style={{ fontSize:11, marginTop:5, display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ color:C.mute }}>Chờ:</span>
                          {ds.length === 0 ? <span style={{ color:'#ffffff40' }}>—</span> : ds.map(d => (
                            <span key={d.id} title={d.name} style={{ background:'#ffffff0d', borderRadius:5, padding:'1px 6px',
                              color:GROUP[d.group_type]?.c ?? C.text }}>#{d.no}{sameOf(it.id, d.id) ? ' (cùng ngày)' : ''}{lagOf(it.id, d.id) ? ` +${lagOf(it.id, d.id)}n` : ''}</span>
                          ))}
                          {hiddenDeps.length > 0 && (
                            <span style={{ color:'#ffffff40' }} title="Các mục này đang bị ẩn nên không áp dụng">
                              (+{hiddenDeps.length} mục đã ẩn)
                            </span>
                          )}
                          {wo.length > 0 && <span style={{ color:'#ffffff50', marginLeft:6 }}>
                            · {wo.length} mục đang chờ mục này
                          </span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:5, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        <button disabled={busy} onClick={() => setEditSteps(it)} style={btn('#1a2d5a', C.text, '#ffffff20')}>📝 Các bước</button>
                        <button disabled={busy} onClick={() => setEditDeps(it)} style={btn('#1a2d5a', C.text, '#4472C4')}>🔗 Điều kiện</button>
                        {it.project_id && (
                          <button disabled={busy} onClick={() => setEditItem(it)} style={btn('#1a2d5a', C.text, '#ffffff20')}>✏️ Sửa</button>
                        )}
                        <button disabled={busy} onClick={() => {
                          const msg = wo.length
                            ? `Ẩn mục #${it.no} "${it.name}"?\n\nCó ${wo.length} mục đang chờ mục này (${wo.map(w => '#' + w.no).join(', ')}). Điều kiện đó sẽ tạm không áp dụng khi mục bị ẩn.\n\nSố thứ tự các mục phía sau sẽ tự dồn lên.`
                            : `Ẩn mục #${it.no} "${it.name}" khỏi dự án?\n\nSố thứ tự các mục phía sau sẽ tự dồn lên.`
                          if (confirm(msg)) run(() => rpc('set_item_hidden', { pid, p_item: it.id, p_hidden: true }))
                        }} style={btn('#FF444415', '#FF8888')}>🙈 Ẩn</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Mục đã ẩn */}
        <div style={{ marginTop:20, borderTop:`1px solid ${C.line}`, paddingTop:14 }}>
          <button onClick={() => setShowHidden(v => !v)} style={btn('transparent', C.mute, '#ffffff20')}>
            {showHidden ? '▲' : '▼'} Mục đã ẩn ({hidden.length})
          </button>
          {showHidden && (
            <div style={{ marginTop:10 }}>
              {hidden.length === 0 && <div style={{ fontSize:12, color:C.mute }}>Chưa ẩn mục nào.</div>}
              {hidden.map(it => (
                <div key={it.id} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 12px',
                  background:'#ffffff06', borderRadius:8, marginBottom:5 }}>
                  <div style={{ width:30, fontFamily:'monospace', color:'#ffffff30' }}>—</div>
                  <div style={{ flex:1, color:C.mute, fontSize:12 }}>{it.name}</div>
                  <button disabled={busy} onClick={() => run(() => rpc('set_item_hidden', { pid, p_item: it.id, p_hidden: false }))}
                    style={btn('#375623', '#fff')}>↩ Khôi phục</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/* ---------- Chọn các mục điều kiện ---------- */
function DepPicker({ items, selfId, value, onChange }: {
  items: It[]; selfId?: string; value: string[]; onChange: (ids: string[]) => void
}) {
  const [q, setQ] = useState('')
  const k = q.trim().toLowerCase()
  const list = items.filter(i => i.id !== selfId && (!k || String(i.no) === k || i.name.toLowerCase().includes(k)))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Lọc theo số hoặc tên..." style={{ ...inp, marginBottom:6 }}/>
      <div style={{ maxHeight:260, overflowY:'auto', border:`1px solid ${C.line}`, borderRadius:8, padding:4 }}>
        {list.map(i => (
          <label key={i.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'5px 6px', borderRadius:6,
            cursor:'pointer', background: value.includes(i.id) ? '#4472C422' : 'transparent', fontSize:12 }}>
            <input type="checkbox" checked={value.includes(i.id)} onChange={() => toggle(i.id)}/>
            <span style={{ width:28, fontFamily:'monospace', color:GROUP[i.group_type]?.c }}>#{i.no}</span>
            <span style={{ flex:1 }}>{i.name}</span>
          </label>
        ))}
        {list.length === 0 && <div style={{ fontSize:11, color:C.mute, padding:8 }}>Không có mục phù hợp</div>}
      </div>
      <div style={{ fontSize:11, color:C.mute, marginTop:6 }}>
        Đã chọn: {value.length === 0 ? 'không chờ mục nào' :
          items.filter(i => value.includes(i.id)).sort((a, b) => (a.no ?? 0) - (b.no ?? 0)).map(i => '#' + i.no).join(', ')}
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#000000bb', display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:999, padding:16 }}>
      <div style={{ background:C.card, border:'1px solid #4472C4', borderRadius:14, padding:20, width:560,
        maxWidth:'100%', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>{title}</div>
          <button onClick={onClose} style={btn('transparent', C.mute)}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DepsModal({ item, items, current, lags, same, busy, onClose, onSave }: {
  item: It; items: It[]; current: string[]; lags: Record<string, number>; same: Record<string, boolean>; busy: boolean
  onClose: () => void; onSave: (ids: string[], lags: Record<string, number>, same: Record<string, boolean>) => void
}) {
  const [val, setVal] = useState<string[]>(current)
  const [lag, setLag] = useState<Record<string, number>>(lags)
  const [sd, setSd] = useState<Record<string, boolean>>(same)
  const selected = items.filter(i => val.includes(i.id)).sort((a, b) => (a.no ?? 0) - (b.no ?? 0))
  return (
    <Modal title={`🔗 Điều kiện của mục #${item.no}`} onClose={onClose}>
      <div style={{ fontSize:12, color:C.mute, marginBottom:10 }}>
        <b style={{ color:C.text }}>{item.name}</b> chỉ được bắt đầu sau khi các mục đánh dấu dưới đây hoàn thành
        (với vật tư: kể từ ngày <b>có hàng</b>):
      </div>
      <DepPicker items={items} selfId={item.id} value={val} onChange={setVal}/>
      {selected.length > 0 && (
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:6 }}>Số ngày chờ thêm (mặc định 0)</div>
          {selected.map(p => (
            <div key={p.id} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5, fontSize:12 }}>
              <span style={{ width:34, fontFamily:'monospace', color:GROUP[p.group_type]?.c }}>#{p.no}</span>
              <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
              <input type="number" min={0} max={365} value={lag[p.id] ?? 0}
                onChange={e => setLag(prev => ({ ...prev, [p.id]: Math.max(0, Math.min(365, parseInt(e.target.value) || 0)) }))}
                style={{ ...inp, width:64 }}/>
              <span style={{ fontSize:11, color:C.mute, width:36 }}>ngày</span>
              {p.group_type !== 'A' ? (
                <label title="Được bắt đầu ngay trong ngày mục này hoàn thành" style={{ display:'flex', gap:4, alignItems:'center',
                  fontSize:11, color: sd[p.id] ? '#4ade80' : C.mute, cursor:'pointer', width:86, whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={!!sd[p.id]} onChange={e => setSd(prev => ({ ...prev, [p.id]: e.target.checked }))}/>
                  Cùng ngày
                </label>
              ) : <span style={{ width:86 }}/>}
            </div>
          ))}
          <div style={{ fontSize:10, color:C.mute, lineHeight:1.6, marginTop:4 }}>
            Vật tư: bắt đầu được <b>ngay trong ngày có hàng</b> + số ngày chờ.<br/>
            Thi công: bắt đầu <b>ngày hôm sau khi xong</b> + số ngày chờ (vd đổ bê tông → chờ 7 ngày);
            tick <b>Cùng ngày</b> nếu được bắt đầu ngay trong ngày mục trước hoàn thành (vd COD ngay ngày xong chạy thử).
          </div>
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <button disabled={busy} onClick={() => onSave(val, lag, sd)} style={btn('#375623', '#fff')}>{busy ? '⏳' : '✓ Lưu điều kiện'}</button>
        <button onClick={onClose} style={btn('transparent', C.mute, '#ffffff20')}>Huỷ</button>
      </div>
    </Modal>
  )
}

/* ---------- Sửa các bước của hạng mục (theo dự án) ---------- */
function StepsModal({ item, busy, onClose, onSave }: {
  item: It; busy: boolean; onClose: () => void; onSave: (list: Step[]) => void
}) {
  const [list, setList] = useState<Step[]>((item.steps ?? []).map(x => ({ ...x })))
  const owned = (x: Step) => !x.id || !!x.is_extra || !!item.project_id     // bước do dự án tạo
  const live = list.filter(x => !x.hidden && !x.delete)
  const totalW = live.reduce((a, x) => a + (Number(x.weight) || 0), 0)
  const set = (i: number, patch: Partial<Step>) => setList(prev => prev.map((x, j) => j === i ? { ...x, ...patch } : x))
  const move = (i: number, d: -1 | 1) => setList(prev => {
    const j = i + d; if (j < 0 || j >= prev.length) return prev
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const submit = () => {
    if (live.length === 0) { alert('Hạng mục phải còn ít nhất 1 bước'); return }
    if (live.some(x => !x.name.trim())) { alert('Có bước chưa có tên'); return }
    onSave(list.map(x => ({ ...x, name: x.name.trim(), weight: Math.max(1, Number(x.weight) || 1) })))
  }
  return (
    <Modal title={`📝 Các bước — mục #${item.no}`} onClose={onClose}>
      <div style={{ fontSize:12, color:C.mute, marginBottom:10, lineHeight:1.6 }}>
        <b style={{ color:C.text }}>{item.name}</b> — chỉnh riêng cho dự án này, không ảnh hưởng dự án khác.
        <br/>% của hạng mục = tổng trọng số các bước đã tick ÷ tổng trọng số các bước đang dùng.
      </div>
      {list.map((x, i) => {
        const off = x.hidden || x.delete
        const share = !off && totalW ? Math.round((Number(x.weight) || 0) / totalW * 100) : null
        const renamed = x.base_name && x.base_name !== x.name
        return (
          <div key={x.id ?? 'new' + i} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6,
            opacity: off ? 0.45 : 1 }}>
            <div style={{ display:'flex', flexDirection:'column' }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btn('transparent', C.mute), padding:'0 5px', fontSize:10 }}>▲</button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1} style={{ ...btn('transparent', C.mute), padding:'0 5px', fontSize:10 }}>▼</button>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <input value={x.name} disabled={off} onChange={e => set(i, { name: e.target.value })}
                placeholder="Tên bước" style={inp}/>
              <div style={{ fontSize:9, color:'#ffffff50', marginTop:2 }}>
                {!x.id ? 'Bước mới' : x.is_extra || item.project_id ? 'Bước riêng dự án' : 'Bước mẫu'}
                {renamed && ` · gốc: "${x.base_name}"`}
                {x.delete ? ' · sẽ xoá' : x.hidden ? ' · đang ẩn' : ''}
              </div>
            </div>
            <input type="number" min={1} value={x.weight} disabled={off} title="Trọng số bước"
              onChange={e => set(i, { weight: parseInt(e.target.value) || 1 })} style={{ ...inp, width:60 }}/>
            <span style={{ width:34, fontSize:10, color:C.mute, textAlign:'right' }}>{share != null ? share + '%' : ''}</span>
            {off ? (
              <button onClick={() => set(i, { hidden: false, delete: false })} style={btn('#375623', '#fff')}>↩</button>
            ) : owned(x) ? (
              <button title={x.id ? 'Xoá (nếu đã có dữ liệu tick sẽ chỉ ẩn)' : 'Bỏ bước mới'}
                onClick={() => x.id ? set(i, { delete: true }) : setList(prev => prev.filter((_, j) => j !== i))}
                style={btn('#FF444415', '#FF8888')}>✕</button>
            ) : (
              <button title="Ẩn bước mẫu khỏi dự án này" onClick={() => set(i, { hidden: true })}
                style={btn('#FF444415', '#FF8888')}>🙈</button>
            )}
          </div>
        )
      })}
      <button onClick={() => setList(prev => [...prev, { name:'', weight:10 }])}
        style={{ ...btn('transparent', C.mute, '#ffffff20'), marginTop:4 }}>+ Thêm bước</button>
      <div style={{ fontSize:11, color:C.mute, marginTop:8 }}>
        Tổng trọng số đang dùng: <b style={{ color:C.text }}>{totalW}</b> · {live.length} bước
      </div>
      <div style={{ fontSize:10, color:'#ffffff50', marginTop:4, lineHeight:1.6 }}>
        🙈 Ẩn bước mẫu: không hiện và không tính %, dữ liệu tick giữ lại, bấm ↩ để dùng lại.
        ✕ Xoá bước riêng: xoá hẳn nếu chưa tick; đã tick thì chỉ ẩn.
      </div>
      <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <button disabled={busy} onClick={submit} style={btn('#375623', '#fff')}>{busy ? '⏳ Đang lưu...' : '✓ Lưu các bước'}</button>
        <button onClick={onClose} style={btn('transparent', C.mute, '#ffffff20')}>Huỷ</button>
      </div>
    </Modal>
  )
}

/* ---------- Thêm / sửa hạng mục ---------- */
function ItemModal({ zones, items, busy, edit, onClose, onSave }: {
  zones: Zone[]; items: It[]; busy: boolean; edit?: It; onClose: () => void
  onSave: (f: { name: string; zone: string; group: string; weight: number; orderDays: number; steps: Step[]; depends: string[]; after: string }) => void
}) {
  // Vị trí: mặc định cuối danh sách (mục mới) / giữ nguyên (khi sửa)
  const prevOf = (id: string) => { const idx = items.findIndex(i => i.id === id); return idx > 0 ? items[idx - 1].id : '' }
  const [after, setAfter] = useState<string>(edit ? prevOf(edit.id) : '')
  const [name, setName]     = useState(edit?.name ?? '')
  const [zone, setZone]     = useState(edit?.zone_id ?? zones[0]?.id ?? '')
  const [group, setGroup]   = useState<'A'|'B'|'C'>(edit?.group_type ?? 'B')
  const [weight, setWeight] = useState(edit?.weight ?? 20)
  const [orderDays, setOrderDays] = useState(edit?.order_days ?? 7)
  const [steps, setSteps]   = useState<Step[]>(STEP_PRESET.B.map(s => ({ ...s })))
  const [depends, setDepends] = useState<string[]>([])
  const [touchedSteps, setTouchedSteps] = useState(false)

  const changeGroup = (g: 'A'|'B'|'C') => {
    setGroup(g)
    if (!touchedSteps) setSteps(STEP_PRESET[g].map(s => ({ ...s })))
  }
  const setStep = (i: number, patch: Partial<Step>) => {
    setTouchedSteps(true); setSteps(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s))
  }
  const totalW = steps.reduce((a, s) => a + (Number(s.weight) || 0), 0)

  const submit = () => {
    if (!name.trim()) { alert('Nhập tên hạng mục'); return }
    if (!edit) {
      const valid = steps.filter(s => s.name.trim())
      if (!valid.length) { alert('Cần ít nhất 1 bước có tên'); return }
      onSave({ name, zone, group, weight, orderDays, steps: valid.map(s => ({ name: s.name.trim(), weight: Math.max(1, Number(s.weight) || 1) })), depends, after })
    } else {
      onSave({ name, zone, group, weight, orderDays, steps: [], depends: [], after })
    }
  }

  return (
    <Modal title={edit ? `✏️ Sửa mục #${edit.no}` : '+ Thêm hạng mục mới'} onClose={onClose}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div style={{ gridColumn:'1 / -1' }}>
          <label style={{ fontSize:10, color:C.mute }}>Tên hạng mục *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="VD: Thi công lắp đặt BESS"/>
        </div>
        <div>
          <label style={{ fontSize:10, color:C.mute }}>Khu vực</label>
          <select value={zone} onChange={e => setZone(e.target.value)} style={inp}>
            {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:10, color:C.mute }}>Trọng số (độ lớn so với các mục khác)</label>
          <input type="number" min={1} value={weight} onChange={e => setWeight(parseInt(e.target.value) || 1)} style={inp}/>
        </div>
        <div style={{ gridColumn:'1 / -1' }}>
          <label style={{ fontSize:10, color:C.mute }}>Vị trí trong danh sách</label>
          <select value={after} onChange={e => setAfter(e.target.value)} style={inp}>
            {!edit && <option value="">— Cuối danh sách —</option>}
            {edit && after === '' && <option value="">— (giữ nguyên) —</option>}
            {items.filter(i => i.id !== edit?.id).map(i => (
              <option key={i.id} value={i.id}>Chèn sau #{i.no} · {i.name}</option>
            ))}
          </select>
        </div>
        {!edit && (
          <div>
            <label style={{ fontSize:10, color:C.mute }}>Nhóm</label>
            <select value={group} onChange={e => changeGroup(e.target.value as any)} style={inp}>
              <option value="A">A · Vật tư</option>
              <option value="B">B · Thi công</option>
              <option value="C">C · Hoàn thiện / đóng điện</option>
            </select>
          </div>
        )}
        {!edit && group === 'A' && (
          <div>
            <label style={{ fontSize:10, color:C.mute }}>Thời gian đặt hàng (ngày)</label>
            <input type="number" min={1} max={90} value={orderDays} onChange={e => setOrderDays(parseInt(e.target.value) || 7)} style={inp}/>
          </div>
        )}
      </div>

      {!edit && (<>
        <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', margin:'6px 0' }}>
          Các bước công việc <span style={{ fontWeight:400, color:C.mute, fontSize:11 }}>(trọng số các bước: tổng {totalW})</span>
        </div>
        {steps.map((s, i) => (
          <div key={i} style={{ display:'flex', gap:6, marginBottom:5, alignItems:'center' }}>
            <span style={{ width:18, fontSize:11, color:C.mute, textAlign:'right' }}>{i + 1}.</span>
            <input value={s.name} onChange={e => setStep(i, { name: e.target.value })} placeholder="Tên bước" style={{ ...inp, flex:1 }}/>
            <input type="number" min={1} value={s.weight} onChange={e => setStep(i, { weight: parseInt(e.target.value) || 1 })}
              title="Trọng số bước" style={{ ...inp, width:64 }}/>
            <button onClick={() => { setTouchedSteps(true); setSteps(prev => prev.filter((_, j) => j !== i)) }}
              disabled={steps.length <= 1} style={btn('#FF444415', '#FF8888')}>✕</button>
          </div>
        ))}
        <button onClick={() => { setTouchedSteps(true); setSteps(prev => [...prev, { name:'', weight:10 }]) }}
          style={{ ...btn('transparent', C.mute, '#ffffff20'), marginBottom:12 }}>+ Thêm bước</button>

        <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', margin:'6px 0' }}>Điều kiện: mục này chờ các mục</div>
        <DepPicker items={items} value={depends} onChange={setDepends}/>
      </>)}

      {edit && (
        <div style={{ fontSize:11, color:C.mute, marginBottom:10 }}>
          Sửa điều kiện bằng nút 🔗 Điều kiện. Danh sách bước của mục đã tạo hiện chưa sửa ở đây.
          <br/>Mục mẫu không đổi vị trí được; chỉ mục thêm riêng mới chọn được vị trí.
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <button disabled={busy} onClick={submit} style={btn('#375623', '#fff')}>
          {busy ? '⏳ Đang lưu...' : edit ? '✓ Lưu' : '✓ Thêm hạng mục'}
        </button>
        <button onClick={onClose} style={btn('transparent', C.mute, '#ffffff20')}>Huỷ</button>
      </div>
    </Modal>
  )
}
