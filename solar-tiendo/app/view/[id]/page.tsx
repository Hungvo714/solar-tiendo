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
    // Lấy ID từ path /view/[id]
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
      <div style={{ fontSize:40 }}>☀️</div>
      <div>Đang tải...</div>
    </div>
  )

  if (notFound) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:40 }}>❌</div>
      <div style={{ fontSize:16, fontWeight:600, color:'#e8eaf0' }}>Không tìm thấy dự án</div>
      <div style={{ fontSize:12 }}>Link không hợp lệ hoặc dự án đã bị xoá</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const el    = project ? elapsedDays(project.start_date) : 0
  const total = project?.total_days ?? 60
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
  const circ  = 2*Math.PI*26, dash = circ*tp

  const fmtD = (d?: string|null) => d
    ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : '—'

  return (
    <div style={{ minHeight:'100vh', background:'#0a0f1e', color:'#e8eaf0',
      fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* HEADER */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'14px 20px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <div style={{ background:'#8B008B', color:'#fff', fontWeight:700,
            fontSize:11, width:40, height:40, borderRadius:9, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', letterSpacing:1 }}>
            HTE
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <svg width="56" height="56" style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx="28" cy="28" r="26" fill="none" stroke="#ffffff18" strokeWidth="5"/>
            <circle cx="28" cy="28" r="26" fill="none" stroke="#F5A623" strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
            <text x="28" y="28" fill="#e8eaf0" fontFamily="monospace" fontSize="11" fontWeight="700"
              textAnchor="middle" dominantBaseline="central"
              style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
              {Math.round(tp*100)}%
            </text>
          </svg>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#F5A623', fontFamily:'monospace' }}>
              {fp(tp)}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>Ngày {el}/{total}</div>
          </div>
        </div>
      </header>

      {/* Badge chỉ xem */}
      <div style={{ background:'#185FA510', borderBottom:'1px solid #185FA530',
        padding:'6px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
        fontSize:10, flexWrap:'wrap', gap:4 }}>
        <span style={{ color:'#60a5fa' }}>🔒 Chế độ xem — Chủ đầu tư</span>
        <span style={{ color:'#8899bb' }}>📅 Cập nhật: {today}</span>
      </div>

      <main style={{ maxWidth:800, margin:'0 auto', padding:16 }}>

        {/* KPI Grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
          {zones.map(z => {
            const pct = zonePct(z.id, items, progressMap)
            const st  = statusOf(pct)
            const c2  = 2*Math.PI*20, d2 = c2*pct
            return (
              <div key={z.id} style={{ background:'#0d1b3e', border:`1px solid ${z.color}`,
                borderRadius:12, padding:14, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:z.color }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:z.color }}>{z.label}</div>
                  <svg width="44" height="44" style={{ transform:'rotate(-90deg)' }}>
                    <circle cx="22" cy="22" r="20" fill="none" stroke="#ffffff18" strokeWidth="4"/>
                    <circle cx="22" cy="22" r="20" fill="none" stroke={z.color} strokeWidth="4"
                      strokeDasharray={`${d2} ${c2}`} strokeLinecap="round"/>
                    <text x="22" y="22" fill="#e8eaf0" fontSize="9" fontWeight="600"
                      textAnchor="middle" dominantBaseline="central"
                      style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
                      {Math.round(pct*100)}%
                    </text>
                  </svg>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:z.color }}>
                  {fp(pct)}
                </div>
                <div style={{ fontSize:10, marginTop:3,
                  color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</div>
              </div>
            )
          })}
        </div>

        {/* Bảng tiến độ */}
        <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8 }}>
          📋 Tiến độ từng hạng mục
        </div>
        <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #ffffff10' }}>
          <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 65px 55px 55px 55px 80px',
            padding:'7px 12px', background:'#1a2d5a',
            fontSize:9, fontWeight:600, color:'#8899bb', gap:6 }}>
            <span>STT</span><span>Hạng mục</span><span>Khu vực</span>
            <span style={{ textAlign:'center' }}>%</span>
            <span style={{ textAlign:'center' }}>BD KH</span>
            <span style={{ textAlign:'center' }}>HT KH</span>
            <span style={{ textAlign:'center' }}>Trạng thái</span>
          </div>
          {items.map((it, idx) => {
            const pct = itemPct(it, progressMap)
            const z   = zones.find(zn => zn.id === it.zone_id)
            const g   = ganttMap[it.id]
            const st  = statusOf(pct)
            return (
              <div key={it.id} style={{ display:'grid',
                gridTemplateColumns:'28px 1fr 65px 55px 55px 55px 80px',
                padding:'7px 12px', gap:6, alignItems:'center',
                background: idx%2===0 ? (z ? z.light+'18' : '#ffffff08') : 'transparent',
                borderTop:'1px solid #ffffff08' }}>
                <span style={{ fontWeight:700, fontSize:10, color:'#8899bb' }}>{it.stt}</span>
                <span style={{ fontSize:11, color:'#c8d8f0',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                <span style={{ fontSize:10, color:z?.color }}>{z?.label}</span>
                <span style={{ fontSize:10, fontFamily:'monospace', textAlign:'center', fontWeight:600,
                  color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{fp(pct)}</span>
                <span style={{ fontSize:10, color:'#8899bb', textAlign:'center' }}>{fmtD(g?.plan_start)}</span>
                <span style={{ fontSize:10, color:'#60a5fa', textAlign:'center' }}>{fmtD(g?.plan_end)}</span>
                <span style={{ fontSize:9, textAlign:'center',
                  color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{st.l}</span>
              </div>
            )
          })}
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:10, color:'#ffffff25' }}>
          HTE Managed Services · Solar Tiến Độ · Chỉ xem — không thể chỉnh sửa
        </div>
      </main>
    </div>
  )
}
