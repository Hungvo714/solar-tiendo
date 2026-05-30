'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, zonePct, totalPct, fp, statusOf, elapsedDays } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

export default function PublicViewPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)

  useEffect(() => {
    const parts = window.location.pathname.split('/')
    const pid = parts[parts.length - 1]
    if (!pid || pid === 'view') { setNotFound(true); setLoading(false); return }
    async function load() {
      const [{ data: proj }, z, it, pr, gd] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getZones(), getItemsWithSteps(), getProgress(pid), getGanttDates(pid),
      ])
      if (!proj) { setNotFound(true); setLoading(false); return }
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

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:40 }}>☀️</div><div>Đang tải...</div>
    </div>
  )

  if (notFound) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:40 }}>❌</div>
      <div style={{ fontSize:16, fontWeight:600, color:'#e8eaf0' }}>Không tìm thấy dự án</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const el    = project ? elapsedDays(project.start_date) : 0
  const total = project?.total_days ?? 60
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
  const fmtD  = (d?: string|null) => d ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : '—'

  // Next week items
  const now = new Date()
  const daysToNextMon = (7 - now.getDay()) % 7 || 7
  const nextMon = new Date(now); nextMon.setDate(now.getDate() + daysToNextMon); nextMon.setHours(0,0,0,0)
  const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6); nextSun.setHours(23,59,59,999)
  const nextMonStr = nextMon.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
  const nextSunStr = nextSun.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})

  const doingItems = items.filter(it => { const p = itemPct(it, progressMap); return p > 0 && p < 1 })
  const nextItems  = items.filter(it => {
    const g = ganttMap[it.id]
    const s = g?.actual_start || g?.plan_start
    const e = g?.actual_end   || g?.plan_end
    if (!s) return false
    const sd = new Date(s), ed = e ? new Date(e) : sd
    return sd <= nextSun && ed >= nextMon && itemPct(it, progressMap) < 1
  })

  const circ = 2*Math.PI*26, dash = circ*tp

  return (
    <div style={{ minHeight:'100vh', background:'#0a0f1e', color:'#e8eaf0',
      fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* HEADER */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'12px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
          <div style={{ background:'#8B008B', color:'#fff', fontWeight:700,
            fontSize:10, width:38, height:38, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project?.name}</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.contractor}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:8 }}>
          <svg width="52" height="52" style={{ transform:'rotate(-90deg)' }}>
            <circle cx="26" cy="26" r="24" fill="none" stroke="#ffffff15" strokeWidth="5"/>
            <circle cx="26" cy="26" r="24" fill="none" stroke="#F5A623" strokeWidth="5"
              strokeDasharray={`${circ*tp} ${circ}`} strokeLinecap="round"/>
            <text x="26" y="26" fill="#e8eaf0" fontFamily="monospace" fontSize="11" fontWeight="700"
              textAnchor="middle" dominantBaseline="central"
              style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
              {Math.round(tp*100)}%
            </text>
          </svg>
        </div>
      </header>

      {/* Badge */}
      <div style={{ background:'#185FA510', borderBottom:'1px solid #185FA530',
        padding:'5px 16px', display:'flex', justifyContent:'space-between',
        fontSize:10, color:'#60a5fa' }}>
        <span>🔒 Chế độ xem — Chủ đầu tư</span>
        <span style={{ color:'#8899bb' }}>📅 {today}</span>
      </div>

      <main style={{ padding:12, maxWidth:800, margin:'0 auto' }}>

        {/* Tổng tiến độ */}
        <div style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
          border:'1px solid #F5A623', borderRadius:12, padding:'16px 20px',
          marginBottom:12, display:'flex', alignItems:'center',
          justifyContent:'space-between', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:'#8899bb', marginBottom:4 }}>TỔNG TIẾN ĐỘ DỰ ÁN</div>
            <div style={{ fontFamily:'monospace', fontSize:40, fontWeight:700,
              color:'#F5A623', lineHeight:1 }}>{fp(tp)}</div>
            <div style={{ fontSize:10, color:'#8899bb', marginTop:6 }}>
              Ngày {el}/{total} · Còn {total-el} ngày
            </div>
            <div style={{ marginTop:8, height:6, background:'#ffffff15',
              borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${tp*100}%`,
                background:'linear-gradient(90deg,#F5A623,#ff8c00)', borderRadius:3 }}/>
            </div>
          </div>
        </div>

        {/* KPI 4 khu vực */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
          {zones.map(z => {
            const pct = zonePct(z.id, items, progressMap)
            const st  = statusOf(pct)
            const c2  = 2*Math.PI*18, d2 = c2*pct
            return (
              <div key={z.id} style={{ background:'#0d1b3e', border:`1px solid ${z.color}`,
                borderRadius:10, padding:'10px 12px', position:'relative' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:z.color, borderRadius:'10px 10px 0 0' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:z.color }}>{z.label}</div>
                  <svg width="36" height="36" style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#ffffff18" strokeWidth="4"/>
                    <circle cx="18" cy="18" r="16" fill="none" stroke={z.color} strokeWidth="4"
                      strokeDasharray={`${d2} ${c2}`} strokeLinecap="round"/>
                    <text x="18" y="18" fill="#e8eaf0" fontSize="8" fontWeight="600"
                      textAnchor="middle" dominantBaseline="central"
                      style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
                      {Math.round(pct*100)}%
                    </text>
                  </svg>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:z.color }}>{fp(pct)}</div>
                <div style={{ fontSize:10, color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</div>
              </div>
            )
          })}
        </div>

        {/* Bảng tiến độ - cuộn ngang */}
        <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8 }}>
          📋 Tiến độ từng hạng mục
        </div>
        <div style={{ borderRadius:8, border:'1px solid #ffffff10',
          overflowX:'auto', WebkitOverflowScrolling:'touch' as any }}>
          <div style={{ minWidth:480 }}>
            {/* Header */}
            <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 60px 44px 52px 52px 75px',
              padding:'7px 10px', background:'#1a2d5a',
              fontSize:9, fontWeight:600, color:'#8899bb', gap:4 }}>
              <span>#</span>
              <span>Hạng mục</span>
              <span>Khu vực</span>
              <span style={{ textAlign:'center' }}>%</span>
              <span style={{ textAlign:'center' }}>BD KH</span>
              <span style={{ textAlign:'center' }}>HT KH</span>
              <span style={{ textAlign:'center' }}>Trạng thái</span>
            </div>
            {/* Rows */}
            {items.map((it, idx) => {
              const pct = itemPct(it, progressMap)
              const z   = zones.find(zn => zn.id === it.zone_id)
              const g   = ganttMap[it.id]
              const st  = statusOf(pct)
              return (
                <div key={it.id} style={{ display:'grid',
                  gridTemplateColumns:'32px 1fr 60px 44px 52px 52px 75px',
                  padding:'6px 10px', gap:4, alignItems:'center',
                  background: idx%2===0 ? (z ? z.light+'18':'#ffffff08') : 'transparent',
                  borderTop:'1px solid #ffffff08' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#8899bb' }}>{it.stt}</span>
                  <span style={{ fontSize:11, color:'#c8d8f0',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                  <span style={{ fontSize:9, color:z?.color,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{z?.label}</span>
                  <span style={{ fontSize:10, fontFamily:'monospace', textAlign:'center', fontWeight:700,
                    color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{fp(pct)}</span>
                  <span style={{ fontSize:9, color:'#8899bb', textAlign:'center' }}>{fmtD(g?.plan_start)}</span>
                  <span style={{ fontSize:9, color:'#60a5fa', textAlign:'center' }}>{fmtD(g?.plan_end)}</span>
                  <span style={{ fontSize:9, textAlign:'center',
                    color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</span>
                </div>
              )
            })}
            {/* Tổng */}
            <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 60px 44px 52px 52px 75px',
              padding:'8px 10px', gap:4, alignItems:'center',
              background:'#1a2d5a', borderTop:'2px solid #4472C4' }}>
              <span/>
              <span style={{ fontSize:11, fontWeight:700, color:'#e8eaf0' }}>TỔNG TIẾN ĐỘ</span>
              <span/><span/>
              <span style={{ fontSize:14, fontFamily:'monospace', fontWeight:700,
                textAlign:'center', color:'#F5A623', gridColumn:'4/5' }}>{fp(tp)}</span>
              <span/>
              <span style={{ fontSize:9, textAlign:'center',
                color: tp>=1?'#4ade80':tp>0?'#fbbf24':'#8899bb' }}>
                {tp>=1?'✅ Xong':tp>0?'🔄 Đang TH':'⬜ Chưa'}
              </span>
            </div>
          </div>
        </div>

        {/* Đang thực hiện */}
        {doingItems.length > 0 && (
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8,
              display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ background:'#fbbf24', width:8, height:8, borderRadius:'50%', display:'inline-block' }}/>
              🔄 Đang thực hiện ({doingItems.length})
            </div>
            <div style={{ borderRadius:8, border:'1px solid #ffffff10',
              overflowX:'auto', WebkitOverflowScrolling:'touch' as any }}>
              <div style={{ minWidth:380 }}>
                <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 60px 1fr 52px',
                  padding:'6px 10px', background:'#1a2d5a',
                  fontSize:9, fontWeight:600, color:'#8899bb', gap:4 }}>
                  <span>#</span><span>Hạng mục</span><span>Khu vực</span>
                  <span>Tiến độ</span><span style={{ textAlign:'center' }}>HT KH</span>
                </div>
                {doingItems.map((it, idx) => {
                  const pct = itemPct(it, progressMap)
                  const z   = zones.find(zn => zn.id === it.zone_id)
                  const g   = ganttMap[it.id]
                  return (
                    <div key={it.id} style={{ display:'grid',
                      gridTemplateColumns:'32px 1fr 60px 1fr 52px',
                      padding:'6px 10px', gap:4, alignItems:'center',
                      background: idx%2===0 ? '#fbbf2412' : 'transparent',
                      borderTop:'1px solid #ffffff08' }}>
                      <span style={{ fontSize:10, color:'#8899bb' }}>{it.stt}</span>
                      <span style={{ fontSize:11, color:'#c8d8f0',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                      <span style={{ fontSize:9, color:z?.color }}>{z?.label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <div style={{ flex:1, height:4, background:'#ffffff15', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct*100}%`, background:'#fbbf24', borderRadius:2 }}/>
                        </div>
                        <span style={{ fontSize:9, color:'#fbbf24', flexShrink:0, fontFamily:'monospace' }}>{fp(pct)}</span>
                      </div>
                      <span style={{ fontSize:9, color:'#60a5fa', textAlign:'center' }}>{fmtD(g?.plan_end)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tuần tới */}
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8,
            display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ background:'#60a5fa', width:8, height:8, borderRadius:'50%', display:'inline-block' }}/>
            📋 Công việc tuần tới ({nextMonStr} - {nextSunStr})
          </div>
          {nextItems.length > 0 ? (
            <div style={{ borderRadius:8, border:'1px solid #ffffff10',
              overflowX:'auto', WebkitOverflowScrolling:'touch' as any }}>
              <div style={{ minWidth:340 }}>
                <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 60px 52px 52px',
                  padding:'6px 10px', background:'#1a2d5a',
                  fontSize:9, fontWeight:600, color:'#8899bb', gap:4 }}>
                  <span>#</span><span>Hạng mục</span><span>Khu vực</span>
                  <span style={{ textAlign:'center' }}>BD KH</span>
                  <span style={{ textAlign:'center' }}>HT KH</span>
                </div>
                {nextItems.map((it, idx) => {
                  const z = zones.find(zn => zn.id === it.zone_id)
                  const g = ganttMap[it.id]
                  return (
                    <div key={it.id} style={{ display:'grid',
                      gridTemplateColumns:'32px 1fr 60px 52px 52px',
                      padding:'6px 10px', gap:4, alignItems:'center',
                      background: idx%2===0 ? '#60a5fa10' : 'transparent',
                      borderTop:'1px solid #ffffff08' }}>
                      <span style={{ fontSize:10, color:'#8899bb' }}>{it.stt}</span>
                      <span style={{ fontSize:11, color:'#c8d8f0',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                      <span style={{ fontSize:9, color:z?.color }}>{z?.label}</span>
                      <span style={{ fontSize:9, color:'#8899bb', textAlign:'center' }}>{fmtD(g?.plan_start)}</span>
                      <span style={{ fontSize:9, color:'#60a5fa', textAlign:'center' }}>{fmtD(g?.plan_end)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding:'10px 14px', borderRadius:8, fontSize:11,
              background:'#ffffff08', color:'#8899bb', border:'1px solid #ffffff10' }}>
              ✅ Không có công việc nào trong tuần tới
            </div>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:10, color:'#ffffff25' }}>
          HTE Managed Services · Solar Tiến Độ · Chỉ xem
        </div>
      </main>
    </div>
  )
}
