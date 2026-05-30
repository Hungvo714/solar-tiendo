'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, elapsedDays } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

const TABS = [
  { path:'/dashboard', icon:'ti-layout-dashboard', label:'Tổng quan' },
  { path:'/progress',  icon:'ti-checklist',        label:'Tiến độ'   },
  { path:'/gantt',     icon:'ti-calendar-event',   label:'Gantt'     },
  { path:'/report',    icon:'ti-file-description', label:'Báo cáo'   },
]

export default function GanttPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState('')
  const [nameColW,    setNameColW]    = useState(220)
  const [dragging,    setDragging]    = useState(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(220)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const [{ data: proj }, z, it, pr, gd] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(), getItemsWithSteps(), getProgress(pid), getGanttDates(pid),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      setProject(proj); setZones(z); setItems(it as Item[])
      const pm: Record<string, Progress> = {}
      for (const p of pr) pm[(p as Progress).step_id] = p as Progress
      setProgressMap(pm)
      const gm: Record<string, GanttDate> = {}
      for (const g of gd) gm[(g as GanttDate).item_id] = g as GanttDate
      setGanttMap(gm)
      setLoading(false)
    }
    load()
  }, [])

  // Drag to resize column
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging) return
      const delta = e.clientX - dragStartX.current
      setNameColW(Math.max(120, Math.min(400, dragStartW.current + delta)))
    }
    function onUp() { setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartW.current = nameColW
    setDragging(true)
  }

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  function barStyle(g: GanttDate | undefined, startField: string, endField: string) {
    const s = (g as any)?.[startField]
    const e = (g as any)?.[endField]
    if (!s || !e) return null
    const ps   = new Date(startDate).getTime()
    const left = Math.max(0, Math.round((new Date(s).getTime() - ps) / 86400000))
    const end  = Math.min(total, Math.round((new Date(e).getTime() - ps) / 86400000))
    if (end <= left) return null
    return { left: (left / total) * 100, width: ((end - left) / total) * 100 }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>📅</div><div>Đang tải Gantt...</div>
    </div>
  )

  const total     = project?.total_days ?? 60
  const startDate = project?.start_date ?? new Date().toISOString().split('T')[0]
  const el        = elapsedDays(startDate)
  const todayPct  = Math.min(100, (el / total) * 100)
  const endDate   = new Date(new Date(startDate).getTime() + total * 86400000)
    .toLocaleDateString('vi-VN')

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13,
      userSelect: dragging ? 'none' : 'auto' }}>

      {/* HEADER */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'12px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
            fontSize:10, width:36, height:36, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
            onClick={() => window.location.href='/projects'}>HTE</div>
          <button onClick={() => window.location.href='/projects'}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px',
              background:'#ffffff10', border:'1px solid #ffffff20', borderRadius:7,
              color:'#e8eaf0', fontSize:11, cursor:'pointer', flexShrink:0 }}>
            ← Chọn dự án
          </button>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project?.name}</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.contractor}</div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', background:'#0d1b3e', borderBottom:'1px solid #ffffff10' }}>
        {TABS.map(tab => (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              gap:2, padding:'8px 4px', border:'none', background:'transparent',
              color: tab.path==='/gantt' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/gantt' ? '2px solid #F5A623' : '2px solid transparent',
              minWidth:60, whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', overflowX:'auto', padding:12 }}>
        {/* Info bar */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
          color:'#8899bb', padding:'7px 10px', background:'#ffffff08',
          borderRadius:7, marginBottom:8, flexWrap:'wrap', gap:4 }}>
          <span>📅 {new Date(startDate).toLocaleDateString('vi-VN')} → {endDate} ({total} ngày)</span>
          <span style={{ color:'#F5A623' }}>⚡ Hôm nay — Ngày {el}/{total}</span>
        </div>

        {/* Legend + hint */}
        <div style={{ display:'flex', gap:16, fontSize:10, color:'#8899bb',
          marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
          <span><span style={{ color:'#4472C4' }}>██</span> Kế hoạch</span>
          <span><span style={{ color:'#70AD47' }}>██</span> Thực tế</span>
          <span><span style={{ color:'#FF4444' }}>██</span> Trễ</span>
          <span><span style={{ color:'#F5A623' }}>│</span> Hôm nay</span>
          <span style={{ color:'#60a5fa', marginLeft:'auto' }}>
            ↔ Kéo thanh phân cách để mở rộng/thu hẹp cột tên
          </span>
        </div>

        {/* Note về nguồn ngày */}
        <div style={{ fontSize:10, color:'#8899bb', padding:'6px 10px',
          background:'#185FA510', border:'1px solid #185FA530', borderRadius:7, marginBottom:10 }}>
          💡 Ngày kế hoạch & thực tế được nhập tại tab <strong style={{ color:'#60a5fa' }}>Tiến độ</strong> — Gantt tự động hiển thị
        </div>

        {/* Gantt table */}
        <div style={{ minWidth:500 }}>
          {/* Header ruler */}
          <div style={{ display:'flex', marginBottom:4 }}>
            {/* Name column header */}
            <div style={{ width:nameColW, flexShrink:0, fontSize:10, fontWeight:600,
              color:'#8899bb', padding:'5px 8px', background:'#1a2d5a',
              borderRadius:'6px 0 0 6px', display:'flex', alignItems:'center',
              justifyContent:'space-between' }}>
              <span>Hạng mục</span>
              <span style={{ color:'#ffffff30', fontSize:9 }}>STT · %</span>
            </div>

            {/* Drag handle */}
            <div onMouseDown={startDrag}
              style={{ width:6, flexShrink:0, background:'#2E75B6', cursor:'col-resize',
                display:'flex', alignItems:'center', justifyContent:'center',
                userSelect:'none' as any }}>
              <div style={{ width:2, height:20, background:'#60a5fa', borderRadius:1 }}/>
            </div>

            {/* Timeline ruler */}
            <div style={{ flex:1, position:'relative', height:28,
              background:'#1a2d5a', borderRadius:'0 6px 6px 0', overflow:'hidden' }}>
              {Array.from({length:Math.floor(total/5)+1}, (_,i) => {
                const day = i * 5 + 1
                if (day > total) return null
                return (
                  <div key={i} style={{
                    position:'absolute', fontSize:8, color:'#8899bb',
                    left:`${((i*5)/total)*100}%`,
                    transform:'translateX(-50%)', bottom:4, whiteSpace:'nowrap'
                  }}>N{day}</div>
                )
              })}
              <div style={{ position:'absolute', top:0, bottom:0, width:2,
                background:'#F5A623', left:`${todayPct}%`, opacity:0.9 }}/>
            </div>
          </div>

          {/* Item rows */}
          {items.map(item => {
            const pct  = itemPct(item, progressMap)
            const z    = zones.find(zn => zn.id === item.zone_id)
            const g    = ganttMap[item.id]
            const plan = barStyle(g, 'plan_start', 'plan_end')
            const act  = barStyle(g, 'actual_start', 'actual_end')
            const isLate = g?.plan_end && !g?.actual_end
              && new Date(g.plan_end) < new Date() && pct < 1

            return (
              <div key={item.id} style={{ display:'flex', marginBottom:3, alignItems:'stretch' }}>
                {/* Name cell */}
                <div style={{ width:nameColW, flexShrink:0, display:'flex',
                  alignItems:'flex-start', gap:5, padding:'5px 8px',
                  background:'#0d1b3e', borderRadius:'6px 0 0 6px',
                  border:'1px solid #ffffff08', borderRight:'none', minHeight:32 }}>
                  <div style={{ width:16, height:16, borderRadius:3, flexShrink:0, marginTop:1,
                    background: z ? z.light+'33' : '#1a2d5a',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {z && <i className={`ti ${z.icon}`} style={{ fontSize:10, color:z.color }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, color:'#c0d0ef',
                      wordBreak:'break-word' as any, lineHeight:1.4 }}>
                      <span style={{ color:'#8899bb', fontSize:9, marginRight:3 }}>{item.stt}.</span>
                      {item.name}
                    </div>
                    <div style={{ fontSize:9, color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb',
                      marginTop:2, fontFamily:'monospace' }}>
                      {Math.round(pct*100)}%
                      {g?.plan_start && <span style={{ color:'#8899bb', marginLeft:4 }}>
                        {new Date(g.plan_start).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                        {g?.plan_end && ' → ' + new Date(g.plan_end).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                      </span>}
                    </div>
                  </div>
                </div>

                {/* Drag handle */}
                <div onMouseDown={startDrag}
                  style={{ width:6, flexShrink:0, background:'#1a2d5a',
                    cursor:'col-resize', borderTop:'1px solid #ffffff08',
                    borderBottom:'1px solid #ffffff08' }}/>

                {/* Bar track */}
                <div style={{ flex:1, background:'#0d1b3e', border:'1px solid #ffffff08',
                  borderLeft:'none', borderRadius:'0 6px 6px 0',
                  position:'relative', overflow:'visible', minHeight:32 }}>

                  {/* Plan bar */}
                  {plan && (
                    <div style={{
                      position:'absolute', top:'50%', transform:'translateY(-50%)',
                      height:12, borderRadius:3,
                      left:`${plan.left}%`, width:`${plan.width}%`,
                      background: isLate ? '#FF4444' : '#4472C4', opacity:0.85,
                    }}>
                      {/* Progress fill */}
                      {pct > 0 && (
                        <div style={{
                          position:'absolute', inset:0, width:`${pct*100}%`,
                          background: z?.color ?? '#F5A623',
                          borderRadius:3, opacity:0.9
                        }}/>
                      )}
                    </div>
                  )}

                  {/* Actual bar */}
                  {act && (
                    <div style={{
                      position:'absolute', top:'50%', transform:'translateY(-52%)',
                      height:6, borderRadius:2,
                      left:`${act.left}%`, width:`${act.width}%`,
                      background:'#70AD47', opacity:0.9,
                    }}/>
                  )}

                  {/* No date hint */}
                  {!plan && (
                    <div style={{
                      position:'absolute', top:'50%', left:8,
                      transform:'translateY(-50%)',
                      fontSize:9, color:'#ffffff18', whiteSpace:'nowrap'
                    }}>
                      Nhập ngày tại tab Tiến độ
                    </div>
                  )}

                  {/* Today line */}
                  <div style={{
                    position:'absolute', top:0, bottom:0, width:2,
                    background:'#F5A623', left:`${todayPct}%`,
                    opacity:0.7, zIndex:5
                  }}/>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
