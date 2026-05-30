'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, zonePct, totalPct, fp, statusOf, elapsedDays } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

const TABS = [
  { path:'/dashboard', icon:'ti-layout-dashboard', label:'Tổng quan' },
  { path:'/progress',  icon:'ti-checklist',        label:'Tiến độ'   },
  { path:'/gantt',     icon:'ti-calendar-event',   label:'Gantt'     },
  { path:'/report',    icon:'ti-file-description', label:'Báo cáo'   },
]

export default function DashboardPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState('')

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const [{ data: proj }, z, it, pr] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(), getItemsWithSteps(), getProgress(pid),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      setProject(proj); setZones(z); setItems(it as Item[])
      const pm: Record<string, Progress> = {}
      for (const p of pr) pm[(p as Progress).step_id] = p as Progress
      setProgressMap(pm)
      setLoading(false)
    }
    load()
  }, [])

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:32 }}>☀️</div><div>Đang tải dữ liệu...</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const el    = project ? elapsedDays(project.start_date) : 0
  const total = project?.total_days ?? 60
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
  const circ  = 2*Math.PI*22, dash = circ*tp

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* HEADER */}
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
            <div style={{ fontSize:10, color:'#8899bb', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <svg width="52" height="52" style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#ffffff18" strokeWidth="5"/>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#F5A623" strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
            <text x="26" y="26" fill="#e8eaf0" fontFamily="monospace" fontSize="11" fontWeight="600"
              textAnchor="middle" dominantBaseline="central"
              style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
              {Math.round(tp*100)}%
            </text>
          </svg>
          <div>
            <div style={{ fontSize:10, color:'#8899bb' }}>Ngày {el}/{total}</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>Còn {total-el} ngày</div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', background:'#0d1b3e', borderBottom:'1px solid #ffffff10' }}>
        {TABS.map(tab => (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              gap:2, padding:'8px 4px', border:'none', background:'transparent',
              color: tab.path==='/dashboard' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/dashboard' ? '2px solid #F5A623' : '2px solid transparent',
              minWidth:60, whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* MAIN */}
      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
          color:'#8899bb', padding:'7px 10px', background:'#ffffff08',
          borderRadius:7, marginBottom:12, flexWrap:'wrap', gap:4 }}>
          <span>📅 Cập nhật: {today}</span>
          <span>⏱ Ngày {el}/{total} — còn {total-el} ngày</span>
        </div>

        {/* KPI Grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
          {zones.map(z => {
            const pct = zonePct(z.id, items, progressMap)
            const st  = statusOf(pct)
            const c2  = 2*Math.PI*20, d2 = c2*pct
            return (
              <div key={z.id} style={{ background:'#0d1b3e', border:`1px solid ${z.color}`,
                borderRadius:12, padding:12, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:z.color }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:z.light+'33',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className={`ti ${z.icon}`} style={{ fontSize:18, color:z.color }}/>
                  </div>
                  <svg width="46" height="46" style={{ transform:'rotate(-90deg)' }}>
                    <circle cx="23" cy="23" r="20" fill="none" stroke="#ffffff18" strokeWidth="4.5"/>
                    <circle cx="23" cy="23" r="20" fill="none" stroke={z.color} strokeWidth="4.5"
                      strokeDasharray={`${d2} ${c2}`} strokeLinecap="round"/>
                    <text x="23" y="23" fill="#e8eaf0" fontSize="9" fontWeight="600"
                      textAnchor="middle" dominantBaseline="central"
                      style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
                      {Math.round(pct*100)}%
                    </text>
                  </svg>
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:2 }}>{z.label}</div>
                <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:z.color }}>{fp(pct)}</div>
                <div style={{ fontSize:10, marginTop:2,
                  color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</div>
              </div>
            )
          })}
        </div>

        {/* Table */}
        <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8 }}>
          📋 Tiến độ từng hạng mục
        </div>
        <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #ffffff10' }}>
          <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 72px 86px 80px',
            padding:'7px 10px', background:'#1a2d5a',
            fontSize:10, fontWeight:600, color:'#8899bb', gap:6 }}>
            <span>STT</span><span>Hạng mục</span><span>Khu vực</span>
            <span>% Xong</span><span>Trạng thái</span>
          </div>
          {items.map(it => {
            const pct = itemPct(it, progressMap)
            const z   = zones.find(zn => zn.id === it.zone_id)
            const st  = statusOf(pct)
            return (
              <div key={it.id} style={{ display:'grid',
                gridTemplateColumns:'28px 1fr 72px 86px 80px',
                padding:'7px 10px', background: z ? z.light+'18' : 'transparent',
                borderTop:'1px solid #ffffff08', gap:6, alignItems:'center',
                cursor:'pointer' }}
                onClick={() => navigate('/progress')}>
                <span style={{ fontWeight:700, fontSize:11, color:'#8899bb' }}>{it.stt}</span>
                <span style={{ fontSize:11, color:'#c8d8f0',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:10 }}>
                  {z && <i className={`ti ${z.icon}`} style={{ color:z.color, fontSize:11 }}/>}
                  <span style={{ color:'#8899bb' }}>{z?.label}</span>
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ flex:1, height:3, background:'#ffffff15', borderRadius:2, overflow:'hidden', minWidth:24 }}>
                    <div style={{ height:'100%', width:`${pct*100}%`, background:z?.color, transition:'width .4s' }}/>
                  </div>
                  <span style={{ fontFamily:'monospace', fontSize:10 }}>{fp(pct)}</span>
                </span>
                <span style={{ fontSize:10,
                  color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</span>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
