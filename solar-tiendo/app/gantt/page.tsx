'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, fp, elapsedDays, ganttBar } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates, upsertGantt } from '@/lib/queries'

export default function GanttPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState('')

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

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  const TABS = [
    { path:'/dashboard', icon:'ti-layout-dashboard', label:'Tổng quan' },
    { path:'/progress',  icon:'ti-checklist',        label:'Tiến độ'   },
    { path:'/gantt',     icon:'ti-calendar-event',   label:'Gantt'     },
    { path:'/report',    icon:'ti-file-description', label:'Báo cáo'   },
  ]

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
  const endDate   = new Date(new Date(startDate).getTime() + total * 86400000).toLocaleDateString('vi-VN')

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'12px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
            fontSize:10, width:36, height:36, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
            onClick={() => window.location.href = '/projects'}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.contractor} · {project?.client}</div>
          </div>
        </div>
      </header>

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

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
          color:'#8899bb', padding:'7px 10px', background:'#ffffff08',
          borderRadius:7, marginBottom:10, flexWrap:'wrap', gap:4 }}>
          <span>📅 {new Date(startDate).toLocaleDateString('vi-VN')} → {endDate}</span>
          <span style={{ color:'#F5A623' }}>⚡ = Hôm nay (Ngày {el}/{total})</span>
        </div>

        <div style={{ display:'flex', gap:12, fontSize:10, color:'#8899bb', marginBottom:8, flexWrap:'wrap' }}>
          <span><span style={{ color:'#4472C4' }}>▬</span> Kế hoạch</span>
          <span><span style={{ color:'#70AD47' }}>▬</span> Thực tế</span>
          <span><span style={{ color:'#FF4444' }}>▬</span> Trễ</span>
          <span><span style={{ color:'#F5A623' }}>│</span> Hôm nay</span>
        </div>

        {/* Ruler */}
        <div style={{ display:'flex', alignItems:'center', gap:8, height:24, marginBottom:4 }}>
          <div style={{ width:130, flexShrink:0, fontSize:10, color:'#8899bb' }}>Hạng mục</div>
          <div style={{ flex:1, position:'relative', height:'100%', borderBottom:'1px solid #ffffff20' }}>
            {Array.from({length:12}, (_,i) => (
              <div key={i} style={{ position:'absolute', fontSize:8, color:'#8899bb',
                left:`${(i*5/total)*100}%`, transform:'translateX(-50%)', bottom:3 }}>
                N{i*5+1}
              </div>
            ))}
            <div style={{ position:'absolute', top:0, bottom:0, width:1.5,
              background:'#F5A623', left:`${todayPct}%` }}/>
          </div>
        </div>

        {/* Rows */}
        {items.map(item => {
          const pct = itemPct(item, progressMap)
          const z   = zones.find(zn => zn.id === item.zone_id)
          const g   = ganttMap[item.id]
          const plan = ganttBar(g, startDate, total)
          const actualG = g?.actual_start && g?.actual_end
            ? { plan_start: g.actual_start, plan_end: g.actual_end, id:'', project_id:'', item_id:'' } as GanttDate
            : null
          const actual = actualG ? ganttBar(actualG, startDate, total) : null
          const isLate = g?.plan_end && !g?.actual_end && new Date(g.plan_end) < new Date() && pct < 1

          return (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8,
              padding:'5px 0', borderTop:'1px solid #ffffff08' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, width:130, flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:4, flexShrink:0,
                  background: z ? z.light+'33' : '#1a2d5a',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {z && <i className={`ti ${z.icon}`} style={{ fontSize:12, color:z.color }}/>}
                </div>
                <span style={{ fontSize:10, color:'#c0d0ef', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{item.name}</span>
                <span style={{ fontFamily:'monospace', fontSize:9, color:'#8899bb', flexShrink:0 }}>
                  {Math.round(pct*100)}%
                </span>
              </div>
              <div style={{ flex:1, height:14, background:'#ffffff08', borderRadius:4,
                position:'relative', overflow:'visible' }}>
                {plan && (
                  <div style={{ position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${plan.left}%`, width:`${plan.width}%`,
                    background: isLate ? '#FF4444' : '#4472C4', opacity:0.8 }}/>
                )}
                {actual && (
                  <div style={{ position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${actual.left}%`, width:`${actual.width}%`,
                    background:'#70AD47', opacity:0.9 }}/>
                )}
                {plan && pct > 0 && (
                  <div style={{ position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${plan.left}%`, width:`${plan.width * pct}%`,
                    background: z?.color, opacity:0.7 }}/>
                )}
                <div style={{ position:'absolute', top:-2, bottom:-2, width:2,
                  background:'#F5A623', left:`${todayPct}%`, borderRadius:1 }}/>
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
