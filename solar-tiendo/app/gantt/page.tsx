'use client'
import { useAppData } from '@/hooks/useAppData'
import AppShell from '@/components/AppShell'
import { itemPct, fp, elapsedDays, ganttBar } from '@/lib/calc'

export default function GanttPage() {
  const { project, zones, items, progressMap, ganttMap, loading } = useAppData()
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--muted)' }}><div>Đang tải...</div></div>

  const total   = project?.total_days ?? 60
  const start   = project?.start_date ?? new Date().toISOString().split('T')[0]
  const el      = elapsedDays(start)
  const todayPct= Math.min(100, (el / total) * 100)
  const endDate = new Date(new Date(start).getTime() + total * 86400000).toLocaleDateString('vi-VN')

  return (
    <AppShell project={project} items={items} progressMap={progressMap}>
      {/* Info bar */}
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)',
        padding:'7px 10px', background:'#ffffff08', borderRadius:7, marginBottom:10 }}>
        <span>📅 {new Date(start).toLocaleDateString('vi-VN')} → {endDate}</span>
        <span style={{ color:'#F5A623' }}>⚡ = Hôm nay</span>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--muted)',
        marginBottom:8, flexWrap:'wrap' }}>
        <span><span style={{ color:'#4472C4' }}>▬</span> Kế hoạch</span>
        <span><span style={{ color:'#70AD47' }}>▬</span> Thực tế</span>
        <span><span style={{ color:'#FF4444' }}>▬</span> Trễ</span>
        <span><span style={{ color:'#F5A623' }}>│</span> Hôm nay</span>
      </div>

      {/* Ruler */}
      <div style={{ display:'flex', alignItems:'center', gap:8, height:24, marginBottom:2 }}>
        <div style={{ width:120, flexShrink:0, fontSize:10, color:'var(--muted)' }}>Hạng mục</div>
        <div style={{ flex:1, position:'relative', height:'100%', borderBottom:'1px solid #ffffff20' }}>
          {Array.from({length:12}, (_,i) => (
            <div key={i} style={{
              position:'absolute', fontSize:8, color:'var(--muted)',
              left:`${(i*5/total)*100}%`, transform:'translateX(-50%)', bottom:3
            }}>N{i*5+1}</div>
          ))}
          <div style={{ position:'absolute', top:0, bottom:0, width:1.5,
            background:'#F5A623', left:`${todayPct}%` }}/>
        </div>
      </div>

      {/* Gantt rows */}
      <div>
        {items.map(item => {
          const pct  = itemPct(item, progressMap)
          const z    = zones.find(zn => zn.id === item.zone_id)
          const g    = ganttMap[item.id]
          const plan = g?.plan_start && g?.plan_end ? ganttBar(g, start, total) : null
          const actual = g?.actual_start && g?.actual_end ? ganttBar({
            ...g, plan_start:g.actual_start, plan_end:g.actual_end
          }, start, total) : null
          const isLate = g?.plan_end && !g?.actual_end && new Date(g.plan_end) < new Date() && pct < 1

          return (
            <div key={item.id} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'5px 0', borderTop:'1px solid var(--border)'
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, width:120, flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:4, flexShrink:0,
                  background:z ? z.light+'33' : '#1a2d5a',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {z && <i className={`ti ${z.icon}`} style={{ fontSize:12, color:z.color }}/>}
                </div>
                <span style={{ fontSize:10, color:'#c0d0ef', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                  {item.name}
                </span>
                <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9,
                  color:'var(--muted)', flexShrink:0 }}>{Math.round(pct*100)}%</span>
              </div>

              {/* Bar track */}
              <div style={{ flex:1, height:14, background:'#ffffff08', borderRadius:4, position:'relative', overflow:'visible' }}>
                {/* Plan bar */}
                {plan && (
                  <div style={{
                    position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${plan.left}%`, width:`${plan.width}%`,
                    background: isLate ? '#FF4444' : '#4472C4', opacity:0.8
                  }}/>
                )}
                {/* Actual bar */}
                {actual && (
                  <div style={{
                    position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${actual.left}%`, width:`${actual.width}%`,
                    background:'#70AD47', opacity:0.9
                  }}/>
                )}
                {/* Progress overlay on plan bar */}
                {plan && pct > 0 && (
                  <div style={{
                    position:'absolute', top:2, height:10, borderRadius:3,
                    left:`${plan.left}%`, width:`${plan.width * pct}%`,
                    background:z?.color, opacity:0.7
                  }}/>
                )}
                {/* Today line */}
                <div style={{
                  position:'absolute', top:-2, bottom:-2, width:2,
                  background:'#F5A623', left:`${todayPct}%`, borderRadius:1
                }}/>
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
