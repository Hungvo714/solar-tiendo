'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, fp, statusOf } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates, upsertProgress, upsertGantt } from '@/lib/queries'

const TABS = [
  { path:'/dashboard',    icon:'ti-layout-dashboard', label:'Tổng quan'  },
  { path:'/progress',     icon:'ti-checklist',        label:'Tiến độ'    },
  { path:'/gantt',        icon:'ti-calendar-event',   label:'Gantt'      },
  { path:'/report',       icon:'ti-file-description', label:'Báo cáo'    },
  { path:'/labor',        icon:'ti-users',            label:'Nhân lực'   },
  { path:'/productivity', icon:'ti-chart-line',       label:'Hiệu suất'  },
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
  const [dependencies, setDependencies] = useState<{item_stt:number, depends_on_stt:number}[]>([])
  const [subItems,     setSubItems]     = useState<Record<string, any[]>>({})
  const [editSubItem,  setEditSubItem]  = useState<{itemId:string, sub?:any}|null>(null)
  const [conflict,     setConflict]     = useState<{
    tcItemId: string, tcField: string, tcValue: string,
    vtItem: any, newVtEnd: string, newVtStart: string
  }|null>(null)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: proj }, z, it, pr, gd, { data: memberData }, { data: deps }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(), getItemsWithSteps(), getProgress(pid), getGanttDates(pid),
        supabase.from('project_members').select('role').eq('project_id', pid).eq('user_id', user?.id ?? '').single(),
        supabase.from('item_dependencies').select('item_stt, depends_on_stt'),
      ])
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
      setDependencies((deps ?? []) as {item_stt:number, depends_on_stt:number}[])
      // Load sub_items cho nhóm A
      const itemIds = (it as any[]).filter((i:any) => i.group_type === 'A').map((i:any) => i.id)
      if (itemIds.length > 0) {
        const { data: subs } = await supabase.from('sub_items').select('*').in('item_id', itemIds).order('sort_order')
        const subMap: Record<string, any[]> = {}
        for (const s of subs ?? []) {
          if (!subMap[s.item_id]) subMap[s.item_id] = []
          subMap[s.item_id].push(s)
        }
        setSubItems(subMap)
      }
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
    await supabase.from('sub_items').update({
      is_done: !isDone, done_at: !isDone ? now : null
    }).eq('id', subId)
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
      const { error } = await supabase.from('sub_items').update(payload).eq('id', sub.id)
      if (error) { alert('Lỗi lưu: ' + error.message); return }
    } else {
      const { error } = await supabase.from('sub_items').insert({ ...payload, item_id: itemId, sort_order: 99 })
      if (error) { alert('Lỗi thêm: ' + error.message); return }
    }
    const { data } = await supabase.from('sub_items').select('*').eq('item_id', itemId).order('sort_order')
    setSubItems(prev => ({ ...prev, [itemId]: data ?? [] }))
    setEditSubItem(null)
  }

  async function deleteSubItem(itemId: string, subId: string) {
    if (!confirm('Xoá vật tư phụ này?')) return
    await supabase.from('sub_items').delete().eq('id', subId)
    setSubItems(prev => ({ ...prev, [itemId]: (prev[itemId] ?? []).filter(s => s.id !== subId) }))
  }

  function getMinStartDate(itemStt: number): string | undefined {
    const deps = dependencies.filter(d => d.item_stt === itemStt)
    if (deps.length === 0) return undefined
    let maxDate: Date | null = null
    for (const dep of deps) {
      const depItem = items.find(it => it.stt === dep.depends_on_stt)
      if (!depItem) continue
      const g = ganttMap[depItem.id]
      const endDate = g?.actual_end || g?.plan_end
      if (!endDate) continue
      const d = new Date(endDate)
      d.setDate(d.getDate() + 1)
      if (!maxDate || d > maxDate) maxDate = d
    }
    return maxDate ? maxDate.toISOString().split('T')[0] : undefined
  }

  function getMaxEndDate(itemStt: number): string | undefined {
    const dependents = dependencies.filter(d => d.depends_on_stt === itemStt)
    if (dependents.length === 0) return undefined
    let minDate: Date | null = null
    for (const dep of dependents) {
      const depItem = items.find(it => it.stt === dep.item_stt)
      if (!depItem) continue
      const g = ganttMap[depItem.id]
      const startDate = g?.actual_start || g?.plan_start
      if (!startDate) continue
      const d = new Date(startDate)
      if (!minDate || d < minDate) minDate = d
    }
    return minDate ? minDate.toISOString().split('T')[0] : undefined
  }

  async function updateStepPct(stepId: string, pct: number, item?: any) {
    const isDone = pct >= 100
    setProgressMap(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], step_id: stepId, project_id: projectId,
        is_done: isDone, is_na: false, progress_pct: pct } as any
    }))
    await supabase.from('progress').upsert({
      step_id: stepId, project_id: projectId,
      is_done: isDone, is_na: false, progress_pct: pct
    }, { onConflict: 'step_id,project_id' })
    if (isDone && item) await handleAutoComplete(stepId, item)
  }

  async function handleAutoComplete(stepId: string, item: any) {
    const steps = item.steps ?? []
    const allDone = steps.every((s: any) =>
      s.id === stepId ? true : !!progressMap[s.id]?.is_done || !!progressMap[s.id]?.is_na
    )
    if (!allDone) return
    const today = new Date().toISOString().split('T')[0]
    if (item.group_type !== 'A') {
      const vtDeps = dependencies.filter(d => d.item_stt === item.stt)
      for (const dep of vtDeps) {
        const vtItem = items.find((it: any) => it.stt === dep.depends_on_stt && it.group_type === 'A')
        if (!vtItem) continue
        const vtPct = itemPct(vtItem, progressMap)
        if (vtPct < 1) {
          const vtSteps = (vtItem as any).steps ?? []
          for (const vs of vtSteps) {
            if (!progressMap[vs.id]?.is_done) {
              setProgressMap(prev => ({
                ...prev,
                [vs.id]: { ...prev[vs.id], step_id: vs.id, project_id: projectId,
                  is_done: true, is_na: false, progress_pct: 100 } as any
              }))
              await supabase.from('progress').upsert({
                step_id: vs.id, project_id: projectId,
                is_done: true, is_na: false, progress_pct: 100
              }, { onConflict: 'step_id,project_id' })
            }
          }
          const vtGantt = ganttMap[vtItem.id] as any
          if (!vtGantt?.actual_end) await updateGantt(vtItem.id, 'actual_end', today)
        }
      }
    }
  }

  async function toggleStep(stepId: string, isDone: boolean, item?: any) {
    const newDone = !isDone
    setProgressMap(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], step_id: stepId, project_id: projectId,
        is_done: newDone, is_na: false } as Progress
    }))
    await upsertProgress(projectId, stepId, newDone)

    const today = new Date().toISOString().split('T')[0]

    // Nếu tick hoàn thành bước cuối của hạng mục thi công (B/C)
    if (newDone && item && item.group_type !== 'A') {
      const steps = (item.steps ?? [])
      const allDone = steps.every((s: any) =>
        s.id === stepId ? true : !!progressMap[s.id]?.is_done || !!progressMap[s.id]?.is_na
      )
      if (allDone) {
        const vtDeps = dependencies.filter(d => d.item_stt === item.stt)
        for (const dep of vtDeps) {
          const vtItem = items.find((it: any) => it.stt === dep.depends_on_stt && it.group_type === 'A')
          if (!vtItem) continue
          const vtPct = itemPct(vtItem, progressMap)
          if (vtPct < 1) {
            const vtSteps = (vtItem as any).steps ?? []
            for (const vs of vtSteps) {
              if (!progressMap[vs.id]?.is_done) {
                setProgressMap(prev => ({
                  ...prev,
                  [vs.id]: { ...prev[vs.id], step_id: vs.id, project_id: projectId,
                    is_done: true, is_na: false } as Progress
                }))
                await upsertProgress(projectId, vs.id, true)
              }
            }
            const vtGantt = ganttMap[vtItem.id] as any
            if (!vtGantt?.actual_end) {
              await updateGantt(vtItem.id, 'actual_end', today)
            }
          }
        }
      }
    }

    // Nếu BỎ tick bước thi công → bỏ tick vật tư nếu HT thực tế = hôm nay (vừa tự động tick)
    if (!newDone && item && item.group_type !== 'A') {
      const vtDeps = dependencies.filter(d => d.item_stt === item.stt)
      for (const dep of vtDeps) {
        const vtItem = items.find((it: any) => it.stt === dep.depends_on_stt && it.group_type === 'A')
        if (!vtItem) continue
        const vtGantt = ganttMap[vtItem.id] as any
        // Chỉ bỏ tick nếu HT thực tế = hôm nay (tức là vừa được tự động tick)
        if (vtGantt?.actual_end === today) {
          const vtSteps = (vtItem as any).steps ?? []
          for (const vs of vtSteps) {
            if (progressMap[vs.id]?.is_done) {
              setProgressMap(prev => ({
                ...prev,
                [vs.id]: { ...prev[vs.id], step_id: vs.id, project_id: projectId,
                  is_done: false } as Progress
              }))
              await upsertProgress(projectId, vs.id, false)
            }
          }
          // Xóa HT thực tế vật tư
          await updateGantt(vtItem.id, 'actual_end', '')
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

  async function updateGanttSmart(item: any, field: string, value: string) {
    // Chỉ check conflict khi nhập ngày BD thi công (nhóm B/C)
    const isTCStart = (field === 'plan_start' || field === 'actual_start')
      && item.group_type !== 'A'


    if (isTCStart && value) {
      const vtDeps = dependencies.filter(d => d.item_stt === item.stt)
      for (const dep of vtDeps) {
        // Xử lý cả mục thi công phụ thuộc (không chỉ vật tư)
        const depItem = items.find(it => it.stt === dep.depends_on_stt)
        if (!depItem) continue
        const vtItem = (depItem as any).group_type === 'A' ? depItem : null
        if (!vtItem) {
          // Mục thi công phụ thuộc → cập nhật HT nếu HT hiện tại >= BD mục dưới
          const isActual = field === 'actual_start'
          const tcGantt = ganttMap[depItem.id] as any
          const tcEnd = isActual ? tcGantt?.actual_end : tcGantt?.plan_end
          const tcEndField = isActual ? 'actual_end' : 'plan_end'
          if (tcEnd && tcEnd >= value) {
            // HT mục trên >= BD mục dưới → cập nhật HT mục trên = BD mục dưới - 1
            const newEnd = new Date(new Date(value).getTime() - 86400000).toISOString().split('T')[0]
            await updateGantt(depItem.id, tcEndField, newEnd)
          }
          continue
        }
        const vtGantt = ganttMap[vtItem.id] as any
        const vtEnd = vtGantt?.actual_end || vtGantt?.plan_end
        const orderDays = (vtItem as any).order_days ?? 7
        const newVtEnd = new Date(new Date(value).getTime() - 86400000)
          .toISOString().split('T')[0]
        const newVtStart = new Date(new Date(newVtEnd).getTime() - orderDays * 86400000)
          .toISOString().split('T')[0]

        if (!vtEnd) {
          // Vật tư chưa có ngày → tự động tính luôn
          const isActual = field === 'actual_start'
          await updateGantt(vtItem.id, isActual ? 'actual_end'   : 'plan_end',   newVtEnd)
          await updateGantt(vtItem.id, isActual ? 'actual_start' : 'plan_start', newVtStart)
        } else {
          // Vật tư đã có ngày → chỉ cập nhật nếu ngày mới SỚM HƠN (lấy ngày cần hàng sớm nhất)
          const isActual = field === 'actual_start'
          const endField   = isActual ? 'actual_end'   : 'plan_end'
          const startField = isActual ? 'actual_start' : 'plan_start'

          if (newVtEnd < vtEnd) {
            // Ngày mới sớm hơn → cập nhật để đảm bảo vật tư đến kịp
            await updateGantt(vtItem.id, endField,   newVtEnd)
            await updateGantt(vtItem.id, startField, newVtStart)
          } else if (value <= vtEnd) {
            // BD thi công <= HT vật tư hiện tại → conflict thật sự
            setConflict({
              tcItemId: item.id, tcField: field, tcValue: value,
              vtItem, newVtEnd, newVtStart
            })
            return
          }
          // Ngày mới trễ hơn và không conflict → giữ nguyên ngày VT cũ
        }
      }
    }
    // Khi nhập HT thi công → cập nhật HT của các mục phụ thuộc nếu cần sớm hơn
    const isTCEnd = (field === 'plan_end' || field === 'actual_end')
      && item.group_type !== 'A'

    if (isTCEnd && value) {
      const isActual = field === 'actual_end'
      const endField   = isActual ? 'actual_end'   : 'plan_end'
      const startField = isActual ? 'actual_start' : 'plan_start'
      // Tìm các mục phụ thuộc vào item này (mục trên)
      const depOnMe = dependencies.filter(d => d.depends_on_stt === item.stt)
      for (const dep of depOnMe) {
        const depItem = items.find(it => it.stt === dep.item_stt)
        if (!depItem) continue
        const depGantt = ganttMap[(depItem as any).id] as any
        const depStart = depGantt?.[startField]
        // Nếu mục dưới đã có BD và BD <= HT mới của mục trên → cần cập nhật HT mục trên
        // Ngược lại không làm gì - chỉ cập nhật constraint (input min) tự động
      }
    }

    // Lưu ngày thi công/vật tư
    updateGantt(item.id, field, value)
  }

  async function resolveConflict(choice: 'update_vt' | 'cancel_tc') {
    if (!conflict) return
    if (choice === 'update_vt') {
      // Cập nhật ngày vật tư + lưu ngày thi công
      const isActual = conflict.tcField === 'actual_start'
      const endField   = isActual ? 'actual_end'   : 'plan_end'
      const startField = isActual ? 'actual_start' : 'plan_start'
      await updateGantt(conflict.vtItem.id, endField,   conflict.newVtEnd)
      await updateGantt(conflict.vtItem.id, startField, conflict.newVtStart)
      await updateGantt(conflict.tcItemId,  conflict.tcField, conflict.tcValue)
    }
    // choice === 'cancel_tc': không làm gì, bỏ ngày vừa nhập
    setConflict(null)
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
    const steps = (item.steps ?? []).sort((a: any, b: any) => a.step_index - b.step_index)
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
                <span style={{ color:'#8899bb', marginRight:4 }}>{item.stt}.</span>
                {item.name}
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
            {/* Volume/Unit - nhóm B/C */}
            {(item as any).group_type !== 'A' && !isViewer && (
              <div style={{ display:'flex', alignItems:'center', gap:8,
                marginBottom:8, padding:'6px 10px', borderRadius:7,
                background:'#1a2d5a30', border:'1px solid #4472C430' }}>
                <span style={{ fontSize:10, color:'#8899bb' }}>📦 Khối lượng:</span>
                <input type="number" min="0"
                  defaultValue={(item as any).volume ?? ''}
                  placeholder="0"
                  onBlur={async e => {
                    const vol = parseFloat(e.target.value) || null
                    await supabase.from('items').update({ volume: vol }).eq('id', item.id)
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, volume: vol } as any : it
                    ))
                  }}
                  style={{ width:70, background:'#0a0f1e', border:'1px solid #ffffff20',
                    borderRadius:5, padding:'3px 6px', color:'#60a5fa',
                    fontFamily:'monospace', fontSize:12, outline:'none', textAlign:'center' }}/>
                <input type="text"
                  defaultValue={(item as any).unit ?? ''}
                  placeholder="đơn vị"
                  onBlur={async e => {
                    const unit = e.target.value || null
                    await supabase.from('items').update({ unit } as any).eq('id', item.id)
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, unit } as any : it
                    ))
                  }}
                  style={{ width:60, background:'#0a0f1e', border:'1px solid #ffffff20',
                    borderRadius:5, padding:'3px 6px', color:'#60a5fa',
                    fontFamily:'monospace', fontSize:12, outline:'none' }}/>
              </div>
            )}
            {/* Order days - chỉ nhóm A */}
            {(item as any).group_type === 'A' && !isViewer && (
              <div style={{ display:'flex', alignItems:'center', gap:8,
                marginBottom:8, padding:'6px 10px', borderRadius:7,
                background:'#fbbf2410', border:'1px solid #fbbf2430' }}>
                <span style={{ fontSize:10, color:'#fbbf24' }}>⏱️ Thời gian đặt hàng:</span>
                <input type="number" min="1" max="90"
                  value={(item as any).order_days ?? 7}
                  onChange={e => {
                    const days = parseInt(e.target.value) || 1
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, order_days: days } as any : it
                    ))
                  }}
                  onBlur={async e => {
                    const days = parseInt(e.target.value) || 7
                    const { error } = await supabase.from('items').update({ order_days: days }).eq('id', item.id)
                    if (error) { alert('Lỗi lưu: ' + error.message); return }
                    // Cập nhật state
                    setItems(prev => prev.map(it =>
                      it.id === item.id ? { ...it, order_days: days } as any : it
                    ))
                    // Tự động tính lại BD KH nếu đã có HT KH
                    const g = ganttMap[item.id] as any
                    const htKH = g?.plan_end
                    if (htKH) {
                      const newBD = new Date(new Date(htKH).getTime() - days * 86400000)
                        .toISOString().split('T')[0]
                      await updateGantt(item.id, 'plan_start', newBD)
                    }
                  }}
                  style={{ width:50, background:'#0a0f1e', border:'1px solid #fbbf2440',
                    borderRadius:5, padding:'3px 6px', color:'#fbbf24',
                    fontFamily:'monospace', fontSize:12, outline:'none', textAlign:'center' }}/>
                <span style={{ fontSize:10, color:'#8899bb' }}>ngày</span>
              </div>
            )}
            {/* Gantt dates */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
              {[['plan_start','BD Kế hoạch'],['plan_end','HT Kế hoạch'],
                ['actual_start','BD Thực tế'],['actual_end','HT Thực tế']].map(([field, label]) => {
                const isStart = field==='plan_start' || field==='actual_start'
                const isEnd   = field==='plan_end'   || field==='actual_end'
                const min = isStart ? getMinStartDate(item.stt) : undefined
                const max = isEnd   ? getMaxEndDate(item.stt) : undefined
                const val = (ganttMap[item.id] as any)?.[field] ?? ''
                return (
                  <div key={field} style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:130 }}>
                    <label style={{ fontSize:10, color:'#8899bb' }}>{label}</label>
                    <input type="date" value={val}
                      min={isViewer ? undefined : (
                        field === 'plan_start' ? min :
                        field === 'actual_start' ? min :
                        field === 'plan_end' ? ((ganttMap[item.id] as any)?.plan_start || undefined) :
                        field === 'actual_end' ? ((ganttMap[item.id] as any)?.actual_start || undefined) :
                        undefined
                      )}
                      max={isViewer ? undefined : (isEnd ? (max || undefined) : undefined)}
                      readOnly={isViewer}
                      onChange={e => {
                        if (isViewer) return
                        const v = e.target.value
                        const g = ganttMap[item.id] as any
                        // Kiểm tra ngày BD không được sau ngày HT
                        if (field === 'plan_start' && g?.plan_end && v > g.plan_end) {
                          alert('⚠️ Ngày BD kế hoạch không được sau ngày HT kế hoạch!')
                          return
                        }
                        if (field === 'actual_start' && g?.actual_end && v > g.actual_end) {
                          alert('⚠️ Ngày BD thực tế không được sau ngày HT thực tế!')
                          return
                        }
                        // Kiểm tra ngày HT không được trước ngày BD
                        if (field === 'plan_end' && g?.plan_start && v < g.plan_start) {
                          alert('⚠️ Ngày HT kế hoạch không được trước ngày BD kế hoạch!')
                          return
                        }
                        if (field === 'actual_end' && g?.actual_start && v < g.actual_start) {
                          alert('⚠️ Ngày HT thực tế không được trước ngày BD thực tế!')
                          return
                        }
                        // Kiểm tra điều kiện hạng mục
                        if (isStart && min && v && v < min) {
                          alert('⚠️ Ngày bắt đầu phải từ ' + new Date(min).toLocaleDateString('vi-VN') + ' trở đi')
                          return
                        }
                        if (isEnd && max && v && v > max) {
                          alert('⚠️ Ngày kết thúc không được sau ' + new Date(max).toLocaleDateString('vi-VN'))
                          return
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
                    {!isViewer && !na && (
                      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <input type="number" min="0" max="100"
                          value={(progressMap[step.id] as any)?.progress_pct ?? (done ? 100 : 0)}
                          onChange={async e => {
                            const pct = Math.min(100, Math.max(0, parseInt(e.target.value)||0))
                            await updateStepPct(step.id, pct, item)
                          }}
                          style={{ width:40, background:'#0a0f1e',
                            border:'1px solid #ffffff20', borderRadius:5,
                            padding:'1px 4px', color:'#e8eaf0',
                            fontFamily:'monospace', fontSize:11,
                            outline:'none', textAlign:'center' }}/>
                        <span style={{ fontSize:10, color:'#8899bb' }}>%</span>
                      </div>
                    )}
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

  // Modal thêm/sửa vật tư phụ
  function ConflictModal() {
    if (!conflict) return null
    const vtName = conflict.vtItem?.name ?? ''
    const fmtD = (d: string) => new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
    return (
      <div style={{ position:'fixed', inset:0, background:'#000000cc',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #fbbf24',
          borderRadius:14, padding:24, width:360, maxWidth:'90vw' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#fbbf24', marginBottom:12 }}>
            ⚠️ Conflict ngày
          </div>
          <div style={{ fontSize:11, color:'#c8d8f0', marginBottom:16, lineHeight:1.6 }}>
            Ngày thi công bắt đầu sớm hơn ngày hoàn thành vật tư
            <strong style={{ color:'#fbbf24' }}> "{vtName}"</strong>.
            <br/>Bạn muốn làm gì?
          </div>
          <div style={{ background:'#ffffff08', borderRadius:8, padding:10, marginBottom:16, fontSize:10, color:'#8899bb' }}>
            Nếu cập nhật vật tư:<br/>
            • BD đặt hàng: <span style={{ color:'#60a5fa' }}>{fmtD(conflict.newVtStart)}</span><br/>
            • HT đặt hàng: <span style={{ color:'#60a5fa' }}>{fmtD(conflict.newVtEnd)}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={() => resolveConflict('update_vt')}
              style={{ padding:10, background:'#276221', border:'1px solid #4ade80',
                borderRadius:9, color:'#4ade80', fontFamily:'inherit',
                fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ✅ Cập nhật ngày vật tư & lưu ngày thi công
            </button>
            <button onClick={() => resolveConflict('cancel_tc')}
              style={{ padding:10, background:'transparent', border:'1px solid #ffffff20',
                borderRadius:9, color:'#8899bb', fontFamily:'inherit',
                fontSize:12, cursor:'pointer' }}>
              ↩️ Giữ ngày vật tư, bỏ ngày thi công vừa nhập
            </button>
          </div>
        </div>
      </div>
    )
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
