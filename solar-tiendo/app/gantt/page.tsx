'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, elapsedDays } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

const GROUPS = [
  { key:'A', label:'A. HẠNG MỤC VẬT TƯ',           color:'#E65100' },
  { key:'B', label:'B. HẠNG MỤC THI CÔNG',           color:'#1565C0' },
  { key:'C', label:'C. HẠNG MỤC ĐẤU NỐI VẬN HÀNH',  color:'#2E7D32' },
]

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

  const total      = project?.total_days ?? 60
  const startDate  = project?.start_date ?? new Date().toISOString().split('T')[0]
  const el         = elapsedDays(startDate)
  const todayPct   = Math.min(100, (el / total) * 100)
  const NAME_W     = isMobile ? 130 : 200
  const TIMELINE_W = isMobile ? 600 : undefined
  const ROW_H      = 36
  const GROUP_H    = 24

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

  return (
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

      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* Legend */}
        <div style={{ display:'flex', gap:12, padding:'8px 12px',
          background:'#0d1b3e', borderBottom:'1px solid #ffffff10',
          fontSize:9, flexWrap:'wrap' }}>
          {[
            { color:'#4472C4', label:'Kế hoạch' },
            { color:'#4ade80', label:'Thực tế' },
            { color:'#F5A623', label:'Hôm nay' },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:20, height:4, background:l.color, borderRadius:2 }}/>
              <span style={{ color:'#8899bb' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ marginLeft:'auto', fontSize:9, color:'#8899bb' }}>
            Kéo ngang để xem →
          </div>
        </div>

        {/* Gantt body */}
        <div style={{ flex:1, overflow:'hidden', display:'flex' }}>

          {/* Cột tên - cố định */}
          <div style={{ width:NAME_W, flexShrink:0, borderRight:'1px solid #ffffff15',
            overflowY:'hidden', background:'#0a0f1e' }}>
            {/* Header */}
            <div style={{ padding:'6px 8px', background:'#1a2d5a',
              fontSize:10, fontWeight:600, color:'#8899bb', height:32,
              display:'flex', alignItems:'center' }}>
              Hạng mục
            </div>
            {/* Rows theo nhóm */}
            {GROUPS.map(group => {
              const groupItems = items.filter((it:any) => it.group_type === group.key)
              if (groupItems.length === 0) return null
              return (
                <div key={group.key}>
                  <div style={{ padding:'4px 8px', background:`${group.color}33`,
                    borderTop:`2px solid ${group.color}`, fontSize:9, fontWeight:700,
                    color:group.color, height:GROUP_H, display:'flex', alignItems:'center' }}>
                    {group.label}
                  </div>
                  {groupItems.map(item => {
                    const pct = itemPct(item, progressMap)
                    const z   = zones.find(zn => zn.id === item.zone_id)
                    return (
                      <div key={item.id} style={{ height:ROW_H, padding:'4px 8px',
                        borderTop:'1px solid #ffffff08',
                        background: z ? z.light+'15' : 'transparent',
                        display:'flex', alignItems:'center', gap:5 }}>
                        {z && <i className={`ti ${z.icon}`} style={{ fontSize:11, color:z.color, flexShrink:0 }}/>}
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:10, color:'#c8d8f0',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            <span style={{ color:'#8899bb', fontSize:9 }}>{item.stt}.</span> {item.name}
                          </div>
                          <div style={{ fontSize:9, color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>
                            {Math.round(pct*100)}%
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Timeline - cuộn ngang */}
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto',
            WebkitOverflowScrolling:'touch' as any }}>
            <div style={{ minWidth: TIMELINE_W, position:'relative' }}>

              {/* Header tháng */}
              <div style={{ height:32, background:'#1a2d5a', position:'relative',
                borderBottom:'1px solid #ffffff15' }}>
                {Array.from({ length: Math.ceil(total/30) }).map((_, i) => {
                  const d = new Date(new Date(startDate).getTime() + i*30*86400000)
                  return (
                    <div key={i} style={{ position:'absolute', left:`${(i*30/total)*100}%`,
                      fontSize:9, color:'#8899bb', padding:'2px 4px', whiteSpace:'nowrap',
                      top:'50%', transform:'translateY(-50%)' }}>
                      {d.toLocaleDateString('vi-VN',{month:'short',year:'numeric'})}
                    </div>
                  )
                })}
                {/* Today line header */}
                <div style={{ position:'absolute', top:0, bottom:0, width:2,
                  background:'#F5A623', left:`${todayPct}%` }}/>
              </div>

              {/* Bar rows theo nhóm */}
              <div style={{ position:'relative' }}>
                {/* Today line */}
                <div style={{ position:'absolute', top:0, bottom:0, width:2,
                  background:'#F5A623', left:`${todayPct}%`, opacity:0.4, zIndex:10 }}/>

                {GROUPS.map(group => {
                  const groupItems = items.filter((it:any) => it.group_type === group.key)
                  if (groupItems.length === 0) return null
                  return (
                    <div key={group.key}>
                      {/* Group header */}
                      <div style={{ height:GROUP_H, background:`${group.color}22`,
                        borderTop:`2px solid ${group.color}` }}/>
                      {/* Item bars */}
                      {groupItems.map(item => {
                        const z    = zones.find(zn => zn.id === item.zone_id)
                        const g    = ganttMap[item.id]
                        const plan = barPos(g, 'plan_start', 'plan_end')
                        const act  = barPos(g, 'actual_start', 'actual_end')
                        return (
                          <div key={item.id} style={{ height:ROW_H, position:'relative',
                            borderTop:'1px solid #ffffff08',
                            background: z ? z.light+'10' : 'transparent' }}>
                            {/* Grid lines */}
                            {Array.from({ length: Math.ceil(total/7) }).map((_, i) => (
                              <div key={i} style={{ position:'absolute', top:0, bottom:0,
                                left:`${(i*7/total)*100}%`, width:1,
                                background:'#ffffff06' }}/>
                            ))}
                            {/* Plan bar */}
                            {plan && (
                              <div style={{ position:'absolute', top:8, height:10,
                                left:`${plan.left}%`, width:`${plan.width}%`,
                                background:'#4472C4', borderRadius:3, opacity:0.8,
                                display:'flex', alignItems:'center', paddingLeft:3,
                                fontSize:8, color:'#fff', overflow:'hidden', whiteSpace:'nowrap' }}>
                                {item.name}
                              </div>
                            )}
                            {/* Actual bar */}
                            {act && (
                              <div style={{ position:'absolute', top:20, height:8,
                                left:`${act.left}%`, width:`${act.width}%`,
                                background:'#4ade80', borderRadius:3, opacity:0.9 }}/>
                            )}
                            {/* No date */}
                            {!plan && !act && (
                              <div style={{ position:'absolute', top:'50%', left:4,
                                transform:'translateY(-50%)', fontSize:9, color:'#ffffff20',
                                whiteSpace:'nowrap' }}>Nhập ngày tại Tiến độ</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
