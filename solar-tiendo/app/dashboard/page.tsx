'use client'
import { useState } from 'react'
import { useAppData } from '@/hooks/useAppData'
import AppShell from '@/components/AppShell'
import { itemPct, zonePct, totalPct, fp, statusOf, elapsedDays } from '@/lib/calc'

export default function Dashboard() {
  const { project, zones, items, progressMap, ganttMap, loading } = useAppData()
  const tp = totalPct(items, progressMap)
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
  const el = project ? elapsedDays(project.start_date) : 0
  const total = project?.total_days ?? 60

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--muted)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>☀️</div>
        <div>Đang tải dữ liệu...</div>
      </div>
    </div>
  )

  return (
    <AppShell project={project} items={items} progressMap={progressMap}>
      {/* Info bar */}
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)',
        padding:'7px 10px', background:'#ffffff08', borderRadius:7, marginBottom:12, flexWrap:'wrap', gap:4 }}>
        <span>📅 Cập nhật: {today}</span>
        <span>⏱ Ngày {el}/{total} — còn {total - el} ngày</span>
      </div>

      {/* KPI Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
        {zones.map(z => {
          const pct = zonePct(z.id, items, progressMap)
          const st  = statusOf(pct)
          const circ = 2 * Math.PI * 20
          return (
            <div key={z.id} style={{
              background:'#0d1b3e', border:`1px solid ${z.color}`,
              borderRadius:12, padding:12, position:'relative', overflow:'hidden'
            }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:z.color }}/>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{
                  width:34, height:34, borderRadius:9, background:z.light+'33',
                  display:'flex', alignItems:'center', justifyContent:'center'
                }}>
                  <i className={`ti ${z.icon}`} style={{ fontSize:18, color:z.color }}/>
                </div>
                <svg width="46" height="46" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="23" cy="23" r="20" fill="none" stroke="#ffffff18" strokeWidth="4.5"/>
                  <circle cx="23" cy="23" r="20" fill="none" stroke={z.color} strokeWidth="4.5"
                    strokeDasharray={`${circ*pct} ${circ}`} strokeLinecap="round"/>
                  <text x="23" y="23" fill="#e8eaf0" fontSize="9" fontWeight="600"
                    textAnchor="middle" dominantBaseline="central"
                    style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
                    {Math.round(pct*100)}%
                  </text>
                </svg>
              </div>
              <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:2 }}>{z.label}</div>
              <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:15, fontWeight:700, color:z.color }}>
                {fp(pct)}
              </div>
              <div className={`st-${st.c}`} style={{ fontSize:10, marginTop:2 }}>{st.l}</div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div style={{ fontSize:12, fontWeight:700, color:'#c0d0ef', marginBottom:8 }}>📋 Tiến độ từng hạng mục</div>
      <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 72px 86px 80px',
          padding:'7px 10px', background:'var(--bg3)',
          fontSize:10, fontWeight:600, color:'var(--muted)', gap:6 }}>
          <span>STT</span><span>Hạng mục</span><span>Khu vực</span>
          <span>% Xong</span><span>Trạng thái</span>
        </div>
        {items.map(it => {
          const pct  = itemPct(it, progressMap)
          const z    = zones.find(z => z.id === it.zone_id)
          const st   = statusOf(pct)
          return (
            <div key={it.id} style={{
              display:'grid', gridTemplateColumns:'28px 1fr 72px 86px 80px',
              padding:'7px 10px', background:z ? z.light + '18' : 'transparent',
              borderTop:'1px solid var(--border)', gap:6, alignItems:'center',
            }}>
              <span style={{ fontWeight:700, fontSize:11, color:'var(--muted)' }}>{it.stt}</span>
              <span style={{ fontSize:11, color:'#c8d8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {it.name}
              </span>
              <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'var(--muted)' }}>
                {z && <i className={`ti ${z.icon}`} style={{ color:z.color, fontSize:12 }}/>}
                {z?.label}
              </span>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ flex:1, height:3, background:'#ffffff15', borderRadius:2, overflow:'hidden', minWidth:24 }}>
                  <div style={{ height:'100%', width:`${pct*100}%`, background:z?.color, borderRadius:2, transition:'width .4s' }}/>
                </div>
                <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, flexShrink:0 }}>{fp(pct)}</span>
              </span>
              <span className={`st-${st.c}`} style={{ fontSize:10 }}>{st.l}</span>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
