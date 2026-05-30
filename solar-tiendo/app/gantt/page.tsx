'use client'
import { useState, useEffect } from 'react'
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
  const [isMobile,    setIsMobile]    = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
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

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  function barPos(g: GanttDate | undefined, sf: string, ef: string) {
    const s = (g as any)?.[sf], e = (g as any)?.[ef]
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

  // Cột tên: 140px mobile, 200px desktop
  const NAME_W = isMobile ? 130 : 200
  // Timeline tối thiểu 400px để cuộn được
  const TIMELINE_W = isMobile ? 600 : undefined

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13 }}>

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

      <main style={{ flex:1, padding:12, overflowY:'auto' }}>
        {/* Info */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
          color:'#8899bb', padding:'7px 10px', background:'#ffffff08',
          borderRadius:7, marginBottom:8, flexWrap:'wrap', gap:4 }}>
          <span>📅 {new Date(startDate).toLocaleDateString('vi-VN')} → {endDate}</span>
          <span style={{ color:'#F5A623' }}>⚡ Ngày {el}/{total}</span>
        </div>

        {/* Legend */}
        <div style={{ display:'flex', gap:12, fontSize:10, color:'#8899bb', marginBottom:8, flexWrap:'wrap' }}>
          <span><span style={{ color:'#4472C4' }}>██</span> Kế hoạch</span>
          <span><span style={{ color:'#70AD47' }}>██</span> Thực tế</span>
          <span><span style={{ color:'#FF4444' }}>██</span> Trễ</span>
          {isMobile && <span style={{ color:'#60a5fa' }}>← Vuốt ngang để xem timeline →</span>}
        </div>

        {/* Note */}
        <div style={{ fontSize:10, color:'#8899bb', padding:'6px 10px',
          background:'#185FA510', border:'1px solid #185FA530', borderRadius:7, marginBottom:10 }}>
          💡 Nhập ngày tại tab <strong style={{ color:'#60a5fa' }}>Tiến độ</strong> — Gantt tự động hiển thị
        </div>

        {/* Gantt — layout 2 phần: tên cố định + timeline cuộn */}
        <div style={{ display:'flex', border:'1px solid #ffffff10', borderRadius:8, overflow:'hidden' }}>

          {/* Cột tên — cố định, không cuộn */}
          <div style={{ width:NAME_W, flexShrink:0, borderRight:'2px solid #2E75B6' }}>
            {/* Header */}
            <div style={{ padding:'6px 8px', background:'#1a2d5a',
              fontSize:10, fontWeight:600, color:'#8899bb', height:32,
              display:'flex', alignItems:'center' }}>
              Hạng mục
            </div>
            {/* Rows */}
            {items.map(item => {
              const pct = itemPct(item, progressMap)
              const z   = zones.find(zn => zn.id === item.zone_id)
              const g   = ganttMap[item.id]
              return (
                <div key={item.id} style={{ padding:'5px 8px', borderTop:'1px solid #ffffff08',
                  background:'#0d1b3e', minHeight:40, display:'flex',
                  alignItems:'flex-start', gap:5 }}>
                  <div style={{ width:14, height:14, borderRadius:3, flexShrink:0, marginTop:2,
                    background: z ? z.light+'33' : '#1a2d5a',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {z && <i className={`ti ${z.icon}`} style={{ fontSize:9, color:z.color }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:'#c0d0ef', lineHeight:1.4,
                      wordBreak:'break-word' as any }}>
                      <span style={{ color:'#8899bb', fontSize:9 }}>{item.stt}. </span>
                      {item.name}
                    </div>
                    <div style={{ fontSize:9, marginTop:1,
                      color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb',
                      fontFamily:'monospace' }}>
                      {Math.round(pct*100)}%
                      {g?.plan_start && <span style={{ color:'#8899bb', marginLeft:4 }}>
                        {new Date(g.plan_start).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                        {g?.plan_end && '→'+new Date(g.plan_end).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                      </span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Timeline — cuộn ngang */}
          <div style={{ flex:1, overflowX:'auto', WebkitOverflowScrolling:'touch' as any }}>
            <div style={{ minWidth:TIMELINE_W, position:'relative' }}>
              {/* Ruler */}
              <div style={{ height:32, background:'#1a2d5a', position:'relative', overflow:'hidden' }}>
                {Array.from({length:Math.floor(total/5)+1}, (_,i) => {
                  const day = i*5+1
                  if (day > total) return null
                  return (
                    <div key={i} style={{
                      position:'absolute', fontSize:8, color:'#8899bb',
                      left:`${((i*5)/total)*100}%`, bottom:4,
                      transform:'translateX(-50%)', whiteSpace:'nowrap'
                    }}>N{day}</div>
                  )
                })}
                <div style={{ position:'absolute', top:0, bottom:0, width:2,
                  background:'#F5A623', left:`${todayPct}%`, opacity:0.9 }}/>
              </div>

              {/* Bar rows */}
              {items.map(item => {
                const pct  = itemPct(item, progressMap)
                const z    = zones.find(zn => zn.id === item.zone_id)
                const g    = ganttMap[item.id]
                const plan = barPos(g, 'plan_start', 'plan_end')
                const act  = barPos(g, 'actual_start', 'actual_end')
                const isLate = g?.plan_end && !g?.actual_end
                  && new Date(g.plan_end) < new Date() && pct < 1

                return (
                  <div key={item.id} style={{ borderTop:'1px solid #ffffff08',
                    background:'#0d1b3e', minHeight:40, position:'relative' }}>

                    {/* Plan bar */}
                    {plan && (
                      <div style={{
                        position:'absolute', top:'50%', transform:'translateY(-50%)',
                        height:14, borderRadius:3,
                        left:`${plan.left}%`, width:`${plan.width}%`,
                        background: isLate ? '#FF4444' : '#4472C4', opacity:0.85,
                      }}>
                        {pct > 0 && (
                          <div style={{
                            position:'absolute', inset:0, width:`${pct*100}%`,
                            background: z?.color ?? '#F5A623', borderRadius:3, opacity:0.9
                          }}/>
                        )}
                      </div>
                    )}

                    {/* Actual bar */}
                    {act && (
                      <div style={{
                        position:'absolute', top:'50%', transform:'translateY(-60%)',
                        height:6, borderRadius:2,
                        left:`${act.left}%`, width:`${act.width}%`,
                        background:'#70AD47', opacity:0.9,
                      }}/>
                    )}

                    {/* No date */}
                    {!plan && (
                      <div style={{
                        position:'absolute', top:'50%', left:8,
                        transform:'translateY(-50%)',
                        fontSize:9, color:'#ffffff15', whiteSpace:'nowrap'
                      }}>Nhập ngày tại Tiến độ</div>
                    )}

                    {/* Today line */}
                    <div style={{
                      position:'absolute', top:0, bottom:0, width:2,
                      background:'#F5A623', left:`${todayPct}%`, opacity:0.6
                    }}/>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
