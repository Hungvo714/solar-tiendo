'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, fp, statusOf } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsForProject, getProjectDependencies, getSubItems, getZones, getProgress, getGanttDates, upsertProgress, upsertGantt } from '@/lib/queries'
import { addDays, diffDays, fmtVN, earliestPlanStart, requiredArrival, cascadePlan, actualWarnings } from '@/lib/schedule'
import type { Dep, PlanChange, StartReason } from '@/lib/schedule'

const TABS = [
  { path:'/dashboard', icon:'ti-layout-dashboard', label:'Tổng quan' },
  { path:'/progress',  icon:'ti-checklist',        label:'Tiến độ'   },
  { path:'/gantt',     icon:'ti-calendar-event',   label:'Gantt'     },
  { path:'/report',    icon:'ti-file-description', label:'Báo cáo'   },
]

const GROUPS = [
  { key:'A', label:'A. HẠNG MỤC VẬT TƯ',          color:'#E65100' },
  { key:'B', label:'B. HẠNG MỤC THI CÔNG',          color:'#1565C0' },
  { key:'C', label:'C. HẠNG MỤC ĐẤU NỐI VẬN HÀNH', color:'#2E7D32' },
]

export default function ProgressPage() {
  const [project,      setProject]      = useState<Project | null>(null)
  const [zones,        setZones]        = useState<Zone[]>([])
  const [items,        setItems]        = useState<Item[]>([])
  const [progressMap,  setProgressMap]  = useState<Record<string, Progress>>({})
  const [ganttMap,     setGanttMap]     = useState<Record<string, GanttDate>>({})
  const [loading,      setLoading]      = useState(true)
  const [projectId,    setProjectId]    = useState('')
  const [filterZone,   setFilterZone]   = useState('all')
  const [search,       setSearch]       = useState('')
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({})
  const [isViewer,     setIsViewer]     = useState(false)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [dependencies, setDependencies] = useState<Dep[]>([])
  const [subItems,     setSubItems]     = useState<Record<string, any[]>>({})
  const [editSubItem,  setEditSubItem]  = useState<{itemId:string, sub?:any}|null>(null)
  // Hộp thoại xung đột ngày kế hoạch
  const [dateDlg,      setDateDlg]      = useState<
    | { kind: 'start'; item: any; value: string; earliest: string; bad: StartReason[];
        materialFix: { item: any; plan_start: string; plan_end: string }[]; patches: Record<string, Record<string, string|null>> }
    | { kind: 'cascade'; changes: PlanChange[]; undo: Record<string, Record<string, string|null>> }
    | null>(null)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: proj }, z, it, pr, gd, { data: memberData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(), getItemsForProject(pid), getProgress(pid), getGanttDates(pid),
        supabase.from('project_members').select('role').eq('project_id', pid).eq('user_id', user?.id ?? '').single(),
      ])
      // Điều kiện liên quan RIÊNG của dự án (chỉ giữa các mục đang hiển thị)
      const deps = await getProjectDependencies(pid, it as any[])
      if (!proj) { window.location.href = '/projects'; return }
      const role = (memberData as any)?.role ?? 'viewer'
      setIsViewer(role === 'viewer')
      setIsAdmin(role === 'admin')
      setProject(proj); setZones(z); setItems(it as Item[])
      const pm: Record<string, Progress> = {}
      for (const p of pr) pm[(p as Progress).step_id] = p as Progress
      setProgressMap(pm)
      const gm: Record<string, GanttDate> = {}
      for (const g of gd) gm[(g as GanttDate).item_id] = g as GanttDate
      setGanttMap(gm)
      setDependencies((deps ?? []) as Dep[])
      // Load sub_items cho nhóm A
      const itemIds = (it as any[]).filter((i:any) => i.group_type === 'A').map((i:any) => i.id)
      setSubItems(await getSubItems(pid, itemIds))
      setLoading(false)
    }
    load()
  }, [])

  async function resetAll() {
    if (!confirm('⚠️ Xóa TẤT CẢ dữ liệu đã nhập của dự án này?\n\nBao gồm:\n- Tất cả tick hoàn thành / N/A\n- Tất cả ngày BD/HT kế hoạch và thực tế\n\nHành động này KHÔNG THỂ hoàn tác!')) return
    if (!confirm('Xác nhận lần 2: Bạn chắc chắn muốn xóa hết?')) return

    // Xóa progress
    await supabase.from('progress').delete().eq('project_id', projectId)
    // Xóa gantt dates
    await supabase.from('gantt_dates').delete().eq('project_id', projectId)
    // Reset state
    setProgressMap({})
    setGanttMap({})
    alert('✅ Đã xóa toàn bộ dữ liệu. Trang sẽ tải lại...')
    window.location.reload()
  }

  async function toggleSubItem(itemId: string, subId: string, isDone: boolean) {
    const now = new Date().toISOString()
    const { error } = await supabase.from('sub_items').update({
      is_done: !isDone, done_at: !isDone ? now : null
    }).eq('id', subId).eq('project_id', projectId)
    if (error) { alert('Lỗi lưu: ' + error.message); return }
    setSubItems(prev => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map(s =>
        s.id === subId ? { ...s, is_done: !isDone, done_at: !isDone ? now : null } : s
      )
    }))
  }

  async function saveSubItem(itemId: string, sub: any) {
    const payload = {
      name:     sub.name,
      unit:     sub.unit     || null,
      quantity: sub.quantity || null,
      note:     sub.note     || null,
    }
    if (sub.id) {
      const { error } = await supabase.from('sub_items').update(payload).eq('id', sub.id).eq('project_id', projectId)
      if (error) { alert('Lỗi lưu: ' + error.message); return }
    } else {
      const { error } = await supabase.from('sub_items').insert({ ...payload, item_id: itemId, project_id: projectId, sort_order: 99 })
      if (error) { alert('Lỗi thêm: ' + error.message); return }
    }
    const { data } = await supabase.from('sub_items').select('*')
      .eq('item_id', itemId).eq('project_id', projectId).order('sort_order')
    setSubItems(prev => ({ ...prev, [itemId]: data ?? [] }))
    setEditSubItem(null)
  }

  async function deleteSubItem(itemId: string, subId: string) {
    if (!confirm('Xoá vật tư phụ này?')) return
    await supabase.from('sub_items').delete().eq('id', subId).eq('project_id', projectId)
    setSubItems(prev => ({ ...prev, [itemId]: (prev[itemId] ?? []).filter(s => s.id !== subId) }))
  }

  // ===================== LIÊN KẾT NGÀY (quy tắc: lib/schedule.ts) =====================
  const byId: Record<string, any> = Object.fromEntries(items.map((i: any) => [i.id, i]))
  const isItemDone = (id: string) => { const it = byId[id]; return !!it && itemPct(it, progressMap) >= 1 }
  const depLabel = (it: any) => `#${it?.no ?? it?.stt} ${it?.name ?? ''}`
  const todayStr = () => new Date().toLocaleDateString('en-CA')

  async function toggleStep(stepId: string, isDone: boolean, item?: any) {
    const newDone = !isDone
    setProgressMap(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], step_id: stepId, project_id: projectId,
        is_done: newDone, is_na: false } as Progress
    }))
    await upsertProgress(projectId, stepId, newDone)

    // Tick xong bước cuối của mục thi công (B/C) → tự đánh dấu xong vật tư mà mục đó chờ.
    // KHÔNG tự ghi ngày có hàng thực tế (người dùng nhập ngày thật).
    if (newDone && item && item.group_type !== 'A') {
      const steps = (item.steps ?? [])
      const allDone = steps.every((s: any) =>
        s.id === stepId ? true : !!progressMap[s.id]?.is_done || !!progressMap[s.id]?.is_na
      )
      if (allDone) {
        const missingDate: string[] = []
        for (const d of dependencies.filter(d => d.item_id === item.id)) {
          const vt = byId[d.depends_on_item_id]
          if (!vt || vt.group_type !== 'A' || itemPct(vt, progressMap) >= 1) continue
          for (const vs of (vt.steps ?? [])) {
            if (!progressMap[vs.id]?.is_done) {
              setProgressMap(prev => ({
                ...prev,
                [vs.id]: { ...prev[vs.id], step_id: vs.id, project_id: projectId, is_done: true, is_na: false } as Progress
              }))
              await upsertProgress(projectId, vs.id, true)
            }
          }
          if (!(ganttMap[vt.id] as any)?.actual_end) missingDate.push(depLabel(vt))
        }
        if (missingDate.length) {
          alert(`✅ Đã tự đánh dấu xong vật tư:\n${missingDate.join('\n')}\n\nNhớ nhập "Có hàng thực tế" (ngày hàng về thật) cho các vật tư này.`)
        }
      }
    }
  }

  async function toggleNA(stepId: string, isNa: boolean) {
    setProgressMap(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], step_id: stepId, project_id: projectId,
        is_na: !isNa, is_done: false } as Progress
    }))
    await upsertProgress(projectId, stepId, false, !isNa)
  }

  async function updateGantt(itemId: string, field: string, value: string) {
    setGanttMap(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], item_id: itemId, project_id: projectId,
        [field]: value || null } as GanttDate
    }))
    await upsertGantt(projectId, itemId, field, value)
  }

  type Patches = Record<string, Record<string, string | null>>
  const overlay = (patches: Patches, base: any = ganttMap) => {
    const g: any = { ...base }
    for (const [id, p] of Object.entries(patches)) g[id] = { ...(g[id] ?? {}), ...p }
    return g
  }
  async function applyDates(patches: Patches) {
    for (const [id, p] of Object.entries(patches))
      for (const [f, v] of Object.entries(p)) await updateGantt(id, f, v ?? '')
  }
  const snapshot = (patches: Patches): Patches => {
    const u: Patches = {}
    for (const [id, p] of Object.entries(patches)) {
      u[id] = {}
      for (const f of Object.keys(p)) u[id][f] = (ganttMap[id] as any)?.[f] ?? null
    }
    return u
  }

  // Sau khi đổi ngày KẾ HOẠCH: kiểm tra các mục phụ thuộc, đề xuất dời dây chuyền
  function checkCascade(patches: Patches, undo: Patches) {
    const changes = cascadePlan(Object.keys(patches), dependencies, byId, overlay(patches))
    if (changes.length) setDateDlg({ kind: 'cascade', changes, undo })
  }

  // Vật tư: đổi số ngày gia công → ngày có hàng chạy theo ngày đặt hàng
  async function recalcMaterial(item: any, days: number) {
    const g = ganttMap[item.id] as any
    const patches: Patches = {}
    if (g?.plan_start) patches[item.id] = { plan_end: addDays(g.plan_start, days) }
    else if (g?.plan_end) patches[item.id] = { plan_start: addDays(g.plan_end, -days) }
    else return
    const undo = snapshot(patches)
    await applyDates(patches)
    checkCascade(patches, undo)
  }

  async function updateGanttSmart(item: any, field: string, value: string) {
    const isA = item.group_type === 'A'
    const days = item.order_days ?? 7
    const patches: Patches = { [item.id]: { [field]: value || null } }

    // Vật tư (kế hoạch): ngày đặt hàng + số ngày gia công = ngày có hàng
    if (isA && value && field === 'plan_start') patches[item.id].plan_end = addDays(value, days)
    if (isA && value && field === 'plan_end')   patches[item.id].plan_start = addDays(value, -days)

    // Thi công (kế hoạch): nhập ngày bắt đầu
    if (!isA && field === 'plan_start' && value) {
      for (const d of dependencies.filter(d => d.item_id === item.id)) {
        const vt = byId[d.depends_on_item_id]
        const vg = vt ? ganttMap[vt.id] as any : null
        // Vật tư chưa có ngày → tính ngược: phải có hàng / đặt hàng muộn nhất ngày ...
        if (vt?.group_type === 'A' && !vg?.plan_start && !vg?.plan_end) {
          const arr = requiredArrival(value, d)
          patches[vt.id] = { plan_end: arr, plan_start: addDays(arr, -(vt.order_days ?? 7)) }
        }
      }
      const { date: earliest, reasons } = earliestPlanStart(item.id, dependencies, byId, overlay(patches))
      if (earliest && value < earliest) {
        const bad = reasons.filter(r => value < r.earliest)
        const allMaterial = bad.every(r => r.pre.group_type === 'A')
        const materialFix = allMaterial ? bad.map(r => {
          const arr = requiredArrival(value, r.dep)
          return { item: r.pre, plan_end: arr, plan_start: addDays(arr, -(r.pre.order_days ?? 7)) }
        }) : []
        setDateDlg({ kind: 'start', item, value, earliest, bad, materialFix, patches })
        return
      }
    }

    const undo = snapshot(patches)
    await applyDates(patches)
    if (field === 'plan_start' || field === 'plan_end') checkCascade(patches, undo)
  }

  // Chọn cách xử lý trong hộp thoại xung đột ngày
  async function resolveStart(choice: 'shift' | 'material') {
    if (!dateDlg || dateDlg.kind !== 'start') return
    const { item, earliest, materialFix } = dateDlg
    const patches: Patches = JSON.parse(JSON.stringify(dateDlg.patches))
    if (choice === 'shift') {
      const g = ganttMap[item.id] as any
      patches[item.id].plan_start = earliest
      if (g?.plan_end && g.plan_end < earliest) {
        const dur = g.plan_start ? Math.max(0, diffDays(g.plan_start, g.plan_end)) : 0
        patches[item.id].plan_end = addDays(earliest, dur)
      }
    } else {
      for (const f of materialFix) patches[f.item.id] = { plan_start: f.plan_start, plan_end: f.plan_end }
    }
    setDateDlg(null)
    const undo = snapshot(patches)
    await applyDates(patches)
    checkCascade(patches, undo)
  }
  async function resolveCascade(choice: 'apply' | 'undo') {
    if (!dateDlg || dateDlg.kind !== 'cascade') return
    const dlg = dateDlg
    setDateDlg(null)
    if (choice === 'apply') {
      const p: Patches = {}
      for (const c of dlg.changes) p[c.itemId] = { plan_start: c.plan_start, ...(c.plan_end ? { plan_end: c.plan_end } : {}) }
      await applyDates(p)
    } else {
      await applyDates(dlg.undo)
    }
  }

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  const filtered = items.filter((it: any) =>
    (filterZone === 'all' || it.zone_id === filterZone || it.group_type === filterZone) &&
    (!search || it.name.toLowerCase().includes(search.toLowerCase()))
  )

  const showGroups = filterZone === 'all' || filterZone === 'A' || filterZone === 'B' || filterZone === 'C'

  function renderItem(item: any) {
    const pct  = itemPct(item, progressMap)
    const z    = zones.find((zn: any) => zn.id === item.zone_id)
    const st   = statusOf(pct)
    const open = !!expanded[item.id]
    const steps = (item.steps ?? [])   // đã sắp theo cấu hình bước của dự án
    const isA  = item.group_type === 'A'
    const myDeps = dependencies.filter(d => d.item_id === item.id && byId[d.depends_on_item_id])
    const planEarliest = isA ? null : earliestPlanStart(item.id, dependencies, byId, ganttMap as any).date
    const warns = actualWarnings(item, dependencies, byId, ganttMap as any, isItemDone)
    return (
      <div key={item.id} style={{ background:'#0d1b3e',
        border: `1px solid ${open ? z?.color ?? '#ffffff15' : '#ffffff10'}`,
        borderRadius:10, overflow:'hidden' }}>

        {/* Header */}
        <div onClick={() => setExpanded(p => ({...p, [item.id]: !open}))}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 12px', cursor:'pointer', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            <div style={{ width:28, height:28, borderRadius:7, flexShrink:0,
              background: z ? z.light+'33' : '#1a2d5a',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {z && <i className={`ti ${z.icon}`} style={{ fontSize:16, color:z.color }}/>}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#e8eaf0',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                <span style={{ color:'#8899bb', marginRight:4 }}>{item.no ?? item.stt}.</span>
                {item.name}
                {warns.length > 0 && <span title={warns.join('\n')} style={{ marginLeft:6 }}>🔴</span>}
              </div>
              <div style={{ display:'flex', gap:5, marginTop:2 }}>
                <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8,
                  background: z ? z.light+'44' : '#1a2d5a', color: z?.color }}>
                  {z?.label}
                </span>
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8,
                  background:'#ffffff10', color:'#8899bb' }}>W:{item.weight}</span>
                {(() => {
                  const g = ganttMap[item.id] as any
                  const bdKH = g?.plan_start
                  const htKH = g?.plan_end
                  const bdTT = g?.actual_start
                  const htTT = g?.actual_end
                  const fmtShort = (d: string) => new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
                  const kh = bdKH || htKH ? `KH: ${bdKH ? fmtShort(bdKH) : '?'} - Đến ${htKH ? fmtShort(htKH) : '?'}` : null
                  const tt = bdTT || htTT ? `TT: ${bdTT ? fmtShort(bdTT) : '?'} - Đến ${htTT ? fmtShort(htTT) : '?'}` : null
                  if (!kh && !tt) return null
                  return (
                    <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8,
                      background:'#1a2d5a', color:'#8899bb', lineHeight:1.6,
                      display:'flex', flexDirection:'column', gap:1 }}>
                      {kh && <span style={{ color:'#60a5fa' }}>{kh}</span>}
                      {tt && <span style={{ color:'#4ade80' }}>{tt}</span>}
                    </span>
                  )
                })()}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, width:60 }}>
              <div style={{ height:3, borderRadius:2, width:`${pct*100}%`,
                background:z?.color, minWidth:2, transition:'width .4s', alignSelf:'flex-end' }}/>
              <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:600 }}>{fp(pct)}</span>
            </div>
            <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8,
              background:'#ffffff10', whiteSpace:'nowrap',
              color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</span>
            <span style={{ fontSize:9, color:'#8899bb' }}>{open?'▲':'▼'}</span>
          </div>
        </div>

        {/* Body */}
        {open && (
          <div style={{ borderTop:`1px solid ${z?.color ?? '#ffffff15'}`, padding:12 }}>
            {/* Vật tư (nhóm A): số ngày gia công / giao hàng */}
            {(item as any).group_type === 'A' && !isViewer && (
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
                marginBottom:8, padding:'6px 10px', borderRadius:7,
                background:'#fbbf2410', border:'1px solid #fbbf2430' }}>
                <span style={{ fontSize:10, color:'#fbbf24' }}>⏱️ Gia công / giao hàng:</span>
                <input type="number" min="0" max="180"
                  value={(item as any).order_days ?? 7}
                  onChange={e => {
                    const days = Math.max(0, parseInt(e.target.value) || 0)
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, order_days: days } as any : it
                    ))
                  }}
                  onBlur={async e => {
                    const days = Math.max(0, parseInt(e.target.value) || 0)
                    // Lưu RIÊNG cho dự án này (không ảnh hưởng dự án khác)
                    const { error } = await supabase.from('project_item_settings').upsert(
                      { project_id: projectId, item_id: item.id, order_days: days, updated_at: new Date().toISOString() },
                      { onConflict: 'project_id,item_id' })
                    if (error) { alert('Lỗi lưu: ' + error.message); return }
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, order_days: days } as any : it
                    ))
                    // Ngày có hàng = ngày đặt hàng + số ngày (kế hoạch)
                    await recalcMaterial({ ...item, order_days: days }, days)
                  }}
                  style={{ width:54, background:'#0a0f1e', border:'1px solid #fbbf2440',
                    borderRadius:5, padding:'3px 6px', color:'#fbbf24',
                    fontFamily:'monospace', fontSize:12, outline:'none', textAlign:'center' }}/>
                <span style={{ fontSize:10, color:'#8899bb' }}>ngày</span>
                {(ganttMap[item.id] as any)?.plan_start && (
                  <span style={{ fontSize:10, color:'#8899bb' }}>
                    · đặt {fmtVN((ganttMap[item.id] as any).plan_start)} → có hàng <b style={{ color:'#fbbf24' }}>{fmtVN((ganttMap[item.id] as any).plan_end)}</b>
                  </span>
                )}
              </div>
            )}

            {/* Điều kiện liên quan + cảnh báo thực tế */}
            {myDeps.length > 0 && (
              <div style={{ marginBottom:8, padding:'6px 10px', borderRadius:7, background:'#4472C412',
                border:'1px solid #4472C433', fontSize:10, color:'#8899bb', lineHeight:1.7 }}>
                <span style={{ color:'#93b4f0' }}>🔗 Chờ:</span>{' '}
                {myDeps.map((d, i) => {
                  const pre = byId[d.depends_on_item_id]
                  const pe = (ganttMap[pre.id] as any)?.plan_end
                  return (
                    <span key={i} style={{ marginRight:8, whiteSpace:'nowrap' }}>
                      <b style={{ color:'#c0d0ef' }}>#{pre.no ?? pre.stt}</b> {pre.name}
                      {' '}({pre.group_type === 'A' ? 'có hàng' : 'xong'} {fmtVN(pe)}{d.lag_days ? `, +${d.lag_days} ngày chờ` : ''})
                    </span>
                  )
                })}
                {planEarliest && <div>→ Bắt đầu kế hoạch sớm nhất: <b style={{ color:'#60a5fa' }}>{fmtVN(planEarliest)}</b></div>}
              </div>
            )}
            {warns.map((w, i) => (
              <div key={i} style={{ marginBottom:6, padding:'5px 10px', borderRadius:7, background:'#FF444418',
                border:'1px solid #FF444455', fontSize:10, color:'#FF9999' }}>🔴 {w}</div>
            ))}

            {/* Ngày (kế hoạch / thực tế) */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
              {(isA
                ? [['plan_start','Đặt hàng (KH)'],['plan_end','Có hàng (KH)'],['actual_start','Đặt hàng thực tế'],['actual_end','Có hàng thực tế']]
                : [['plan_start','BD Kế hoạch'],['plan_end','HT Kế hoạch'],['actual_start','BD Thực tế'],['actual_end','HT Thực tế']]
              ).map(([field, label]) => {
                const val = (ganttMap[item.id] as any)?.[field] ?? ''
                const g = ganttMap[item.id] as any
                return (
                  <div key={field} style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:130 }}>
                    <label style={{ fontSize:10, color:'#8899bb' }}>
                      {label}
                      {field === 'plan_start' && !isA && planEarliest && !val && (
                        <span style={{ color:'#60a5fa' }}> · sớm nhất {fmtVN(planEarliest)}</span>
                      )}
                    </label>
                    <input type="date" value={val}
                      min={isViewer ? undefined : (
                        field === 'plan_end' ? (g?.plan_start || undefined) :
                        field === 'actual_end' ? (g?.actual_start || undefined) : undefined
                      )}
                      readOnly={isViewer}
                      onChange={e => {
                        if (isViewer) return
                        const v = e.target.value
                        // Thứ tự BD ≤ HT trong cùng một mục (vật tư kế hoạch tự tính nên bỏ qua)
                        if (!isA || field.startsWith('actual')) {
                          if (field === 'plan_start' && g?.plan_end && v > g.plan_end) {
                            alert('⚠️ Ngày BD kế hoạch không được sau ngày HT kế hoạch!'); return
                          }
                          if (field === 'plan_end' && g?.plan_start && v && v < g.plan_start) {
                            alert('⚠️ Ngày HT kế hoạch không được trước ngày BD kế hoạch!'); return
                          }
                        }
                        if (field === 'actual_start' && g?.actual_end && v > g.actual_end) {
                          alert(isA ? '⚠️ Ngày đặt hàng thực tế không được sau ngày có hàng thực tế!' : '⚠️ Ngày BD thực tế không được sau ngày HT thực tế!'); return
                        }
                        if (field === 'actual_end' && g?.actual_start && v && v < g.actual_start) {
                          alert(isA ? '⚠️ Ngày có hàng thực tế không được trước ngày đặt hàng thực tế!' : '⚠️ Ngày HT thực tế không được trước ngày BD thực tế!'); return
                        }
                        updateGanttSmart(item, field, v)
                      }}
                      style={{ background:'#0a0f1e', border:`1px solid ${z?.color ?? '#ffffff20'}`,
                        borderRadius:5, padding:'5px 8px', color:'#60a5fa',
                        fontFamily:'inherit', fontSize:11, outline:'none', width:'100%',
                        colorScheme:'dark' as any,
                        opacity: isViewer ? 0.5 : 1 }}/>
                  </div>
                )
              })}
            </div>

            {/* Steps */}
            {isViewer && (
              <div style={{ background:'#185FA510', border:'1px solid #185FA530',
                borderRadius:7, padding:'5px 10px', fontSize:10, color:'#60a5fa', marginBottom:8 }}>
                🔒 Chế độ xem — không thể chỉnh sửa
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {steps.map((step: any) => {
                const p    = progressMap[step.id]
                const done = !!p?.is_done
                const na   = !!p?.is_na
                return (
                  <div key={step.id} style={{ display:'flex', alignItems:'center', gap:8,
                    padding:'7px 9px', borderRadius:7,
                    background: done ? '#1a3a1a' : na ? '#ffffff05' : '#ffffff06' }}>
                    <div onClick={() => !isViewer && toggleStep(step.id, done, item)}
                      style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                        cursor: isViewer ? 'not-allowed' : 'pointer',
                        opacity: isViewer ? 0.5 : 1,
                        border:`1.5px solid ${done ? '#4ade80' : '#8899bb'}`,
                        background: done ? '#1a3a1a' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, color:'#4ade80' }}>
                      {done && '✓'}
                    </div>
                    <span style={{ flex:1, fontSize:11,
                      color: na ? '#8899bb' : '#c0d0ef',
                      textDecoration: done || na ? 'line-through' : 'none' }}>
                      {step.name}
                    </span>
                    <span style={{ fontFamily:'monospace', fontSize:10, color:'#8899bb' }}>
                      {step.weight}%
                    </span>
                    <div onClick={() => !isViewer && toggleNA(step.id, na)}
                      style={{ fontSize:9, padding:'2px 6px', borderRadius:6,
                        cursor: isViewer ? 'not-allowed' : 'pointer',
                        background: na ? '#7030A022' : '#ffffff08',
                        color: na ? '#a060d0' : '#8899bb',
                        border: `1px solid ${na ? '#7030A0' : 'transparent'}` }}>
                      N/A
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sub Items - chỉ hiện cho nhóm A */}
            {(item as any).group_type === 'A' && (
              <div style={{ marginTop:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  marginBottom:6, paddingTop:8, borderTop:'1px solid #ffffff10' }}>
                  <span style={{ fontSize:10, fontWeight:600, color:'#c0d0ef' }}>📦 Vật tư phụ</span>
                  {!isViewer && (
                    <button onClick={() => setEditSubItem({ itemId: item.id })}
                      style={{ fontSize:9, padding:'2px 8px', borderRadius:6, cursor:'pointer',
                        background:'#1a2d5a', border:'1px solid #4472C4', color:'#60a5fa',
                        fontFamily:'inherit' }}>+ Thêm</button>
                  )}
                </div>
                {(subItems[item.id] ?? []).length === 0 ? (
                  <div style={{ fontSize:10, color:'#ffffff30', fontStyle:'italic' }}>Chưa có vật tư phụ</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {(subItems[item.id] ?? []).map((sub: any) => {
                      const g = ganttMap[item.id] as any
                      const needDate = g?.actual_end || g?.plan_end
                      const subLabel = `${sub.name}${sub.quantity ? ` (${sub.quantity}${sub.unit ? ' '+sub.unit : ''})` : ''}`
                      return (
                        <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'6px 9px', borderRadius:7,
                          background: sub.is_done ? '#1a3a1a' : '#ffffff06',
                          border:'1px solid #ffffff08' }}>
                          <div onClick={() => !isViewer && toggleSubItem(item.id, sub.id, sub.is_done)}
                            style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                              cursor: isViewer ? 'not-allowed' : 'pointer',
                              border:`1.5px solid ${sub.is_done ? '#4ade80' : '#8899bb'}`,
                              background: sub.is_done ? '#1a3a1a' : 'transparent',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, color:'#4ade80' }}>
                            {sub.is_done && '✓'}
                          </div>
                          <span style={{ flex:1, fontSize:11,
                            color: sub.is_done ? '#8899bb' : '#c0d0ef',
                            textDecoration: sub.is_done ? 'line-through' : 'none' }}>
                            {subLabel}
                          </span>
                          {needDate && (
                            <span style={{ fontSize:9, color:'#60a5fa', flexShrink:0 }}>
                              {new Date(needDate).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                            </span>
                          )}
                          {!isViewer && (
                            <>
                              <button onClick={() => setEditSubItem({ itemId: item.id, sub })}
                                style={{ fontSize:9, padding:'1px 5px', borderRadius:5, cursor:'pointer',
                                  background:'transparent', border:'1px solid #ffffff15', color:'#8899bb',
                                  fontFamily:'inherit' }}>✏️</button>
                              <button onClick={() => deleteSubItem(item.id, sub.id)}
                                style={{ fontSize:9, padding:'1px 5px', borderRadius:5, cursor:'pointer',
                                  background:'transparent', border:'1px solid #ff444415', color:'#ff8888',
                                  fontFamily:'inherit' }}>🗑️</button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Hộp thoại xung đột ngày kế hoạch
  function ConflictModal() {
    if (!dateDlg) return null
    const box = (children: React.ReactNode) => (
      <div style={{ position:'fixed', inset:0, background:'#000000cc', display:'flex',
        alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #fbbf24', borderRadius:14, padding:20,
          width:440, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto' }}>{children}</div>
      </div>
    )
    const bigBtn = (bg: string, bd: string, c: string): React.CSSProperties => ({
      padding:10, background:bg, border:`1px solid ${bd}`, borderRadius:9, color:c, fontFamily:'inherit',
      fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left', lineHeight:1.5 })

    if (dateDlg.kind === 'start') {
      const { item, value, earliest, bad, materialFix } = dateDlg
      const today = todayStr()
      return box(<>
        <div style={{ fontSize:14, fontWeight:700, color:'#fbbf24', marginBottom:10 }}>⚠️ Chưa đủ điều kiện để bắt đầu</div>
        <div style={{ fontSize:11, color:'#c8d8f0', lineHeight:1.6, marginBottom:12 }}>
          <b>{depLabel(item)}</b> dự định bắt đầu <b>{fmtVN(value)}</b>, nhưng:
          <ul style={{ margin:'6px 0 0 16px', padding:0 }}>
            {bad.map((r, i) => (
              <li key={i}>
                {depLabel(r.pre)} {r.pre.group_type === 'A' ? 'có hàng' : 'hoàn thành'} <b>{fmtVN(r.preDate)}</b>
                {r.dep.lag_days ? ` (+${r.dep.lag_days} ngày chờ)` : ''} → sớm nhất <b>{fmtVN(r.earliest)}</b>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button onClick={() => resolveStart('shift')} style={bigBtn('#1a2d5a', '#4472C4', '#93b4f0')}>
            📅 Dời ngày bắt đầu sang <b>{fmtVN(earliest)}</b>
          </button>
          {materialFix.length > 0 && (
            <button onClick={() => resolveStart('material')} style={bigBtn('#276221', '#4ade80', '#4ade80')}>
              📦 Giữ ngày {fmtVN(value)}, đặt hàng sớm hơn:
              {materialFix.map((f, i) => (
                <div key={i} style={{ fontWeight:400, fontSize:11, color:'#c8f0d0' }}>
                  • {depLabel(f.item)}: đặt <b>{fmtVN(f.plan_start)}</b> → có hàng {fmtVN(f.plan_end)}
                  {f.plan_start < today && <span style={{ color:'#FF9999' }}> (ngày đặt đã qua!)</span>}
                </div>
              ))}
            </button>
          )}
          <button onClick={() => setDateDlg(null)} style={bigBtn('transparent', '#ffffff20', '#8899bb')}>
            ↩️ Huỷ, không lưu ngày vừa nhập
          </button>
        </div>
      </>)
    }

    // kind === 'cascade'
    const { changes } = dateDlg
    return box(<>
      <div style={{ fontSize:14, fontWeight:700, color:'#fbbf24', marginBottom:10 }}>⚠️ Ảnh hưởng tới các mục phía sau</div>
      <div style={{ fontSize:11, color:'#c8d8f0', lineHeight:1.6, marginBottom:10 }}>
        Thay đổi vừa nhập làm {changes.length} mục đang chờ không còn đủ điều kiện. Đề xuất dời (giữ nguyên số ngày thi công):
      </div>
      <div style={{ background:'#ffffff08', borderRadius:8, padding:10, marginBottom:14, fontSize:11, color:'#c0d0ef', lineHeight:1.7 }}>
        {changes.map(c => (
          <div key={c.itemId}>
            {depLabel(byId[c.itemId])}: BD {fmtVN(c.oldStart)} → <b style={{ color:'#fbbf24' }}>{fmtVN(c.plan_start)}</b>
            <span style={{ color:'#8899bb' }}> (+{diffDays(c.oldStart, c.plan_start)} ngày)</span>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <button onClick={() => resolveCascade('apply')} style={bigBtn('#276221', '#4ade80', '#4ade80')}>
          ✅ Dời các mục trên theo đề xuất
        </button>
        <button onClick={() => resolveCascade('undo')} style={bigBtn('transparent', '#ffffff20', '#8899bb')}>
          ↩️ Hoàn tác thay đổi vừa nhập
        </button>
      </div>
    </>)
  }

  function SubItemModal() {
    const [name,     setName]     = useState(editSubItem?.sub?.name ?? '')
    const [unit,     setUnit]     = useState(editSubItem?.sub?.unit ?? '')
    const [quantity, setQty]      = useState(editSubItem?.sub?.quantity ?? '')
    const [note,     setNote]     = useState(editSubItem?.sub?.note ?? '')
    if (!editSubItem) return null
    return (
      <div style={{ position:'fixed', inset:0, background:'#000000bb',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #4472C4',
          borderRadius:14, padding:20, width:320, maxWidth:'90vw' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e8eaf0', marginBottom:14 }}>
            {editSubItem.sub ? '✏️ Sửa vật tư phụ' : '➕ Thêm vật tư phụ'}
          </div>
          {[
            ['Tên vật tư *', name, setName, 'text', 'VD: Bu lông M10'],
            ['Đơn vị tính', unit, setUnit, 'text', 'VD: cái, kg, m...'],
            ['Số lượng', quantity, setQty, 'number', '0'],
            ['Ghi chú', note, setNote, 'text', ''],
          ].map(([label, val, setter, type, ph]) => (
            <div key={label as string} style={{ marginBottom:10 }}>
              <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:3 }}>{label as string}</label>
              <input type={type as string} value={val as string}
                placeholder={ph as string}
                onChange={e => (setter as Function)(e.target.value)}
                style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                  borderRadius:7, padding:'7px 10px', color:'#e8eaf0',
                  fontFamily:'inherit', fontSize:12, outline:'none',
                  boxSizing:'border-box' as any, colorScheme:'dark' as any }}/>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => setEditSubItem(null)}
              style={{ flex:1, padding:9, background:'transparent', border:'1px solid #ffffff20',
                borderRadius:8, color:'#8899bb', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>
              Huỷ
            </button>
            <button onClick={() => saveSubItem(editSubItem.itemId, {
                ...editSubItem.sub, name, unit, quantity: quantity ? parseFloat(quantity as string) : null,
                note
              })}
              disabled={!name}
              style={{ flex:1, padding:9, background: name ? '#1a3a8a' : '#1a2d5a',
                border:'1px solid #4472C4', borderRadius:8, color:'#fff',
                fontFamily:'inherit', fontSize:12, fontWeight:600,
                cursor: name ? 'pointer' : 'not-allowed' }}>
              💾 Lưu
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>⚡</div><div>Đang tải tiến độ...</div>
    </div>
  )

  return (
    <>
    <ConflictModal />
    <SubItemModal />
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* HEADER */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'12px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <div style={{ background:'#8B008B', color:'#fff', fontWeight:700,
            fontSize:10, width:36, height:36, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
            onClick={() => window.location.href='/projects'}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', background:'#0d1b3e', borderBottom:'1px solid #ffffff10' }}>
        {TABS.map(tab => (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              gap:2, padding:'8px 4px', border:'none', background:'transparent',
              color: tab.path==='/progress' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/progress' ? '2px solid #F5A623' : '2px solid transparent',
              minWidth:60, whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        {/* Filter */}
        <div style={{ marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7,
            background:'#0d1b3e', border:'1px solid #ffffff15', borderRadius:7,
            padding:'7px 10px', marginBottom:8 }}>
            <span style={{ color:'#8899bb' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm hạng mục..."
              style={{ background:'none', border:'none', outline:'none',
                color:'#e8eaf0', fontFamily:'inherit', fontSize:12, flex:1 }}/>
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {[
              { id:'all', label:'Tất cả',        color:'#4a7ab5' },
              { id:'A',   label:'A. Vật tư',      color:'#E65100' },
              { id:'B',   label:'B. Thi công',     color:'#1565C0' },
              { id:'C',   label:'C. Đấu nối VH',   color:'#2E7D32' },
              ...zones.map(z => ({ id: z.id, label: z.label, color: z.color }))
            ].map(z => (
              <button key={z.id} onClick={() => setFilterZone(z.id)}
                style={{ padding:'4px 10px', borderRadius:12, cursor:'pointer',
                  fontFamily:'inherit', fontSize:10,
                  border: `1px solid ${filterZone===z.id ? z.color : '#ffffff20'}`,
                  background: filterZone===z.id ? z.color+'22' : 'transparent',
                  color: filterZone===z.id ? '#fff' : '#8899bb',
                  fontWeight: filterZone===z.id ? 600 : 400 }}>
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Nút Reset - chỉ Admin */}
        {isAdmin && (
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
            <button onClick={resetAll}
              style={{ padding:'5px 12px', background:'transparent',
                border:'1px solid #FF444440', borderRadius:8,
                color:'#FF8888', fontFamily:'inherit', fontSize:10,
                cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              🗑️ Xóa hết dữ liệu nhập
            </button>
          </div>
        )}

        {/* Items */}
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {showGroups ? (
            GROUPS
              .filter(group => filtered.some((it: any) => it.group_type === group.key))
              .map(group => {
                const groupItems = filtered.filter((it: any) => it.group_type === group.key)
                return (
                  <div key={group.key}>
                    <div style={{ padding:'7px 12px', background:`${group.color}22`,
                      border:`1px solid ${group.color}44`, borderRadius:8,
                      fontSize:11, fontWeight:700, color:group.color, marginBottom:5 }}>
                      {group.label}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {groupItems.map((item: any) => renderItem(item))}
                    </div>
                  </div>
                )
              })
          ) : (
            filtered.map((item: any) => renderItem(item))
          )}
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', color:'#8899bb', padding:40 }}>
              Không có hạng mục
            </div>
          )}
        </div>
      </main>
    </div>
    </>
  )
}
