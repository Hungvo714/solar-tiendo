'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, fp, elapsedDays } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates, upsertGantt } from '@/lib/queries'

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
  const [editing,     setEditing]     = useState<string|null>(null)

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

  async function updateGantt(itemId: string, field: string, value: string) {
    setGanttMap(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], item_id: itemId, project_id: projectId, [field]: value || null } as GanttDate
    }))
    await upsertGantt(projectId, itemId, field, value)
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
  const endDate   = new Date(new Date(startDate).getTime() + total * 86400000).toLocaleDateString('vi-VN')

  function barStyle(g: GanttDate | undefined, field: 'plan'|'actual') {
    const s = field === 'plan' ? g?.plan_start : g?.actual_start
    const e = field === 'plan' ? g?.plan_end   : g?.actual_end
    if (!s || !e) return null
    const ps   = new Date(startDate).getTime()
    const left = Math.max(0, Math.round((new Date(s).getTime() - ps) / 86400000))
    const end  = Math.min(total, Math.round((new Date(e).getTime() - ps) / 86400000))
    if (end <= left) return null
    return { left: (left/total)*100, width: ((end-left)/total)*100 }
  }

  const INP = {
    background:'#0a0f1e', border:'1px solid #4472C4', borderRadius:5,
    padding:'4px 8px', color:'#60a5fa', fontFamily:'inherit',
    fontSize:11, outline:'none', width:'100%', colorScheme:'dark' as any
  }

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
          <button onClick={() => window.location.href='/projects'}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px',
              background:'#ffffff10', border:'1px solid #ffffff20', borderRadius:7,
              color:'#e8eaf0', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' as any }}>
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
              minWidth:60, whiteSpace:'nowrap' as any }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        {/* Info */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
          color:'#8899bb', padding:'7px 10px', background:'#ffffff08',
          borderRadius:7, marginBottom:10, flexWrap:'wrap', gap:4 }}>
          <span>📅 {new Date(startDate).toLocaleDateString('vi-VN')} → {endDate}</span>
          <span style={{ color:'#F5A623' }}>⚡ Hôm nay = Ngày {el}/{total}</span>
        </div>

        {/* Legend */}
        <div style={{ display:'flex', gap:16, fontSize:10, color:'#8899bb', marginBottom:10, flexWrap:'wrap' }}>
          <span><span style={{ color:'#4472C4' }}>██</span> Kế hoạch</span>
          <span><span style={{ color:'#70AD47' }}>██</span> Thực tế</span>
          <span><span style={{ color:'#FF4444' }}>██</span> Trễ tiến độ</span>
          <span><span style={{ color:'#F5A623' }}>│</span> Hôm nay</span>
          <span style={{ color:'#60a5fa' }}>💡 Click hàng để nhập ngày</span>
        </div>

        {/* Table header */}
        <div style={{ display:'flex', gap:0, marginBottom:2, position:'sticky', top:0,
          background:'#0a0f1e', zIndex:10, paddingBottom:4 }}>
          <div style={{ width:200, flexShrink:0, fontSize:10, fontWeight:600,
            color:'#8899bb', padding:'4px 8px', background:'#1a2d5a', borderRadius:'6px 0 0 6px' }}>
            Hạng mục
          </div>
          <div style={{ flex:1, position:'relative', height:24,
            background:'#1a2d5a', borderRadius:'0 6px 6px 0', overflow:'hidden' }}>
            {Array.from({length:13}, (_,i) => (
              <div key={i} style={{
                position:'absolute', fontSize:8, color:'#8899bb',
                left:`${(i*5/total)*100}%`, bottom:3, transform:'translateX(-50%)'
              }}>N{i*5+1}</div>
            ))}
            <div style={{ position:'absolute', top:0, bottom:0, width:2,
              background:'#F5A623', left:`${todayPct}%`, opacity:0.8 }}/>
          </div>
        </div>

        {/* Rows */}
        {items.map(item => {
          const pct  = itemPct(item, progressMap)
          const z    = zones.find(zn => zn.id === item.zone_id)
          const g    = ganttMap[item.id]
          const plan = barStyle(g, 'plan')
          const act  = barStyle(g, 'actual')
          const isLate = g?.plan_end && !g?.actual_end && new Date(g.plan_end) < new Date() && pct < 1
          const isOpen = editing === item.id

          return (
            <div key={item.id} style={{ marginBottom:2 }}>
              {/* Main row */}
              <div style={{ display:'flex', gap:0, alignItems:'center',
                background: isOpen ? '#0d1b3e' : 'transparent',
                borderRadius: isOpen ? '6px 6px 0 0' : 6,
                border: isOpen ? `1px solid ${z?.color ?? '#ffffff20'}` : '1px solid transparent',
                borderBottom: isOpen ? 'none' : '1px solid transparent',
                cursor:'pointer' }}
                onClick={() => setEditing(isOpen ? null : item.id)}>

                {/* Name column */}
                <div style={{ width:200, flexShrink:0, display:'flex', alignItems:'center',
                  gap:6, padding:'6px 8px', minWidth:0 }}>
                  <div style={{ width:18, height:18, borderRadius:4, flexShrink:0,
                    background: z ? z.light+'33' : '#1a2d5a',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {z && <i className={`ti ${z.icon}`} style={{ fontSize:11, color:z.color }}/>}
                  </div>
                  <span style={{ fontSize:11, color:'#c0d0ef', overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                    <span style={{ color:'#8899bb', marginRight:3 }}>{item.stt}.</span>
                    {item.name}
                  </span>
                  <span style={{ fontFamily:'monospace', fontSize:9, color:'#8899bb', flexShrink:0 }}>
                    {Math.round(pct*100)}%
                  </span>
                </div>

                {/* Bar track */}
                <div style={{ flex:1, height:20, background:'#ffffff08',
                  borderRadius:4, position:'relative', overflow:'visible' }}>
                  {/* Plan bar */}
                  {plan && (
                    <div style={{
                      position:'absolute', top:3, height:14, borderRadius:3,
                      left:`${plan.left}%`, width:`${plan.width}%`,
                      background: isLate ? '#FF4444' : '#4472C4',
                      opacity:0.85,
                    }}>
                      {/* Progress overlay */}
                      {pct > 0 && (
                        <div style={{
                          position:'absolute', top:0, left:0, height:'100%',
                          width:`${pct*100}%`, background: z?.color ?? '#F5A623',
                          borderRadius:3, opacity:0.9
                        }}/>
                      )}
                    </div>
                  )}
                  {/* Actual bar */}
                  {act && (
                    <div style={{
                      position:'absolute', top:3, height:14, borderRadius:3,
                      left:`${act.left}%`, width:`${act.width}%`,
                      background:'#70AD47', opacity:0.9,
                    }}/>
                  )}
                  {/* Today line */}
                  <div style={{
                    position:'absolute', top:-3, bottom:-3, width:2,
                    background:'#F5A623', left:`${todayPct}%`, borderRadius:1, opacity:0.9
                  }}/>
                  {/* No date hint */}
                  {!plan && (
                    <div style={{ position:'absolute', top:'50%', left:'50%',
                      transform:'translate(-50%,-50%)', fontSize:9, color:'#ffffff25',
                      whiteSpace:'nowrap' as any }}>
                      click để nhập ngày
                    </div>
                  )}
                </div>
              </div>

              {/* Date input panel */}
              {isOpen && (
                <div style={{ background:'#0d1b3e', border:`1px solid ${z?.color ?? '#ffffff20'}`,
                  borderTop:'none', borderRadius:'0 0 6px 6px', padding:'10px 12px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                    {[
                      ['plan_start', '📅 BD Kế hoạch'],
                      ['plan_end',   '🏁 HT Kế hoạch'],
                      ['actual_start','⚡ BD Thực tế'],
                      ['actual_end',  '✅ HT Thực tế'],
                    ].map(([field, label]) => (
                      <div key={field}>
                        <label style={{ fontSize:9, color:'#8899bb', display:'block', marginBottom:4 }}>
                          {label}
                        </label>
                        <input type="date"
                          value={(g as any)?.[field] ?? ''}
                          onChange={e => updateGantt(item.id, field, e.target.value)}
                          style={INP}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}
