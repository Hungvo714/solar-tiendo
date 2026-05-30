'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, fp, statusOf } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import {
  getItemsWithSteps, getZones, getProgress, getGanttDates,
  upsertProgress, upsertGantt
} from '@/lib/queries'

// Standalone page - KHÔNG dùng useAppData, KHÔNG dùng AppShell
// Tránh hoàn toàn vấn đề redirect
export default function ProgressPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState('')
  const [filterZone,  setFilterZone]  = useState('all')
  const [search,      setSearch]      = useState('')
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({})
  const [isViewer,    setIsViewer]    = useState(false)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: proj }, z, it, pr, gd, { data: memberData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(),
        getItemsWithSteps(),
        getProgress(pid),
        getGanttDates(pid),
        supabase.from('project_members').select('role').eq('project_id', pid).eq('user_id', user?.id ?? '').single(),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      const role = (memberData as any)?.role ?? 'viewer'
      setIsViewer(role === 'viewer')
      setProject(proj)
      setZones(z)
      setItems(it as Item[])
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

  async function toggleStep(stepId: string, isDone: boolean) {
    setProgressMap(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], step_id: stepId, project_id: projectId,
        is_done: !isDone, is_na: false } as Progress
    }))
    await upsertProgress(projectId, stepId, !isDone)
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

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  const TABS = [
    { path: '/dashboard', icon: 'ti-layout-dashboard', label: 'Tổng quan' },
    { path: '/progress',  icon: 'ti-checklist',         label: 'Tiến độ'  },
    { path: '/gantt',     icon: 'ti-calendar-event',    label: 'Gantt'    },
    { path: '/report',    icon: 'ti-file-description',  label: 'Báo cáo'  },
  ]

  const filtered = items.filter(it =>
    (filterZone === 'all' || it.zone_id === filterZone) &&
    (!search || it.name.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>⚡</div><div>Đang tải tiến độ...</div>
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
            fontSize:11, width:36, height:36, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
            letterSpacing:1, fontStyle:'italic' }}
            onClick={() => window.location.href='/projects'}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name ?? 'Solar Tiến Độ'}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', background:'#0d1b3e',
        borderBottom:'1px solid #ffffff10', overflowX:'auto' }}>
        {TABS.map(tab => (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{ flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', gap:2, padding:'8px 4px',
              border:'none', background:'transparent',
              color: tab.path === '/progress' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path === '/progress' ? '2px solid #F5A623' : '2px solid transparent',
              minWidth:60, whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        {/* Viewer badge */}
        {isViewer && (
          <div style={{ background:'#185FA510', border:'1px solid #185FA530',
            borderRadius:7, padding:'6px 12px', fontSize:10, color:'#60a5fa',
            marginBottom:8, textAlign:'center' }}>
            🔒 Bạn đang ở chế độ xem — không thể chỉnh sửa tiến độ
          </div>
        )}
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
            {[{id:'all',label:'Tất cả',color:'#4a7ab5'}, ...zones.map(z => ({id:z.id,label:z.label,color:z.color}))].map(z => (
              <button key={z.id} onClick={() => setFilterZone(z.id)}
                style={{ padding:'4px 10px', borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontSize:10,
                  border: `1px solid ${filterZone===z.id ? z.color : '#ffffff20'}`,
                  background: filterZone===z.id ? z.color+'22' : 'transparent',
                  color: filterZone===z.id ? '#fff' : '#8899bb',
                  fontWeight: filterZone===z.id ? 600 : 400 }}>
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items */}
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {filtered.map(item => {
            const pct  = itemPct(item, progressMap)
            const z    = zones.find(zn => zn.id === item.zone_id)
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
                        {item.name}
                      </div>
                      <div style={{ display:'flex', gap:5, marginTop:2 }}>
                        <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8,
                          background: z ? z.light+'44' : '#1a2d5a', color: z?.color }}>
                          {z?.label}
                        </span>
                        <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8,
                          background:'#ffffff10', color:'#8899bb' }}>W:{item.weight}</span>
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
                    {/* Gantt dates */}
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                      {[['plan_start','BD Kế hoạch'],['plan_end','HT Kế hoạch'],
                        ['actual_start','BD Thực tế'],['actual_end','HT Thực tế']].map(([field, label]) => (
                        <div key={field} style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:130 }}>
                          <label style={{ fontSize:10, color:'#8899bb' }}>{label}</label>
                          <input type="date"
                            value={(ganttMap[item.id] as any)?.[field] ?? ''}
                            onChange={e => { if (!isViewer) updateGantt(item.id, field, e.target.value) }}
                          readOnly={isViewer}
                          style={{ ...(isViewer ? { opacity:0.5, cursor:'not-allowed' } : {}) }}
                            style={{ background:'#0a0f1e', border:`1px solid ${z?.color ?? '#ffffff20'}`,
                              borderRadius:5, padding:'5px 8px', color:'#60a5fa',
                              fontFamily:'inherit', fontSize:11, outline:'none', width:'100%',
                              colorScheme:'dark' }}/>
                        </div>
                      ))}
                    </div>

                    {/* Steps */}
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      {steps.map((step: any) => {
                        const p    = progressMap[step.id]
                        const done = !!p?.is_done
                        const na   = !!p?.is_na
                        return (
                          <div key={step.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'7px 9px', borderRadius:7,
                            background: done ? '#1a3a1a' : na ? '#ffffff05' : '#ffffff06' }}>
                            <div onClick={() => !isViewer && toggleStep(step.id, done)}
                              style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                                cursor: isViewer ? 'not-allowed' : 'pointer', opacity: isViewer ? 0.5 : 1,
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
                              title={isViewer ? 'Chỉ xem' : 'N/A'}
                              style={{ fontSize:9, padding:'2px 6px', borderRadius:6, cursor:'pointer',
                                background: na ? '#7030A022' : '#ffffff08',
                                color: na ? '#a060d0' : '#8899bb',
                                border: `1px solid ${na ? '#7030A0' : 'transparent'}` }}>
                              N/A
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', color:'#8899bb', padding:40 }}>Không có hạng mục</div>
          )}
        </div>
      </main>
    </div>
  )
}
