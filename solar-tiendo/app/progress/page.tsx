'use client'
import { useState } from 'react'
import { useAppData } from '@/hooks/useAppData'
import AppShell from '@/components/AppShell'
import { itemPct, fp, statusOf } from '@/lib/calc'

export default function ProgressPage() {
  const { project, zones, items, progressMap, ganttMap, loading, toggleStep, toggleNA, updateGantt } = useAppData()
  const [filterZone, setFilterZone] = useState('all')
  const [search, setSearch]         = useState('')
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--muted)' }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:32 }}>⚡</div><div style={{ marginTop:8 }}>Đang tải...</div></div>
    </div>
  )

  const filtered = items.filter(it =>
    (filterZone === 'all' || it.zone_id === filterZone) &&
    (!search || it.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <AppShell project={project} items={items} progressMap={progressMap}>
      {/* Filter bar */}
      <div style={{ marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7,
          background:'#0d1b3e', border:'1px solid var(--border)', borderRadius:7,
          padding:'7px 10px', marginBottom:8 }}>
          <span style={{ color:'var(--muted)' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm hạng mục..."
            style={{ background:'none', border:'none', outline:'none',
              color:'var(--text)', fontFamily:'inherit', fontSize:12, flex:1 }}/>
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {[{id:'all',label:'Tất cả',icon:'ti-apps',color:'#4a7ab5'},...zones].map(z => (
            <button key={z.id} onClick={() => setFilterZone(z.id)}
              style={{
                padding:'4px 10px', borderRadius:12,
                border:`1px solid ${filterZone===z.id ? (z as any).color||'#4a7ab5' : 'var(--border)'}`,
                background: filterZone===z.id ? ((z as any).color||'#1a2d5a')+'22' : 'transparent',
                color: filterZone===z.id ? '#fff' : 'var(--muted)',
                fontFamily:'inherit', fontSize:10, cursor:'pointer',
                display:'flex', alignItems:'center', gap:4, fontWeight: filterZone===z.id ? 600 : 400,
              }}>
              <i className={`ti ${(z as any).icon||'ti-apps'}`} style={{ fontSize:12 }}/>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Item cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {filtered.map(item => {
          const pct  = itemPct(item, progressMap)
          const z    = zones.find(zn => zn.id === item.zone_id)
          const st   = statusOf(pct)
          const open = !!expanded[item.id]
          const g    = ganttMap[item.id]
          const steps = item.steps ?? []

          return (
            <div key={item.id} style={{
              background:'#0d1b3e',
              border: `1px solid ${open ? z?.color ?? 'var(--border)' : 'var(--border)'}`,
              borderRadius:10, overflow:'hidden', transition:'border-color .2s'
            }}>
              {/* Header */}
              <div onClick={() => setExpanded(p => ({ ...p, [item.id]: !open }))}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 12px', cursor:'pointer', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                  <div style={{ width:28, height:28, borderRadius:7, flexShrink:0,
                    background:z ? z.light+'33' : '#1a2d5a',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {z && <i className={`ti ${z.icon}`} style={{ fontSize:16, color:z.color }}/>}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ display:'flex', gap:5, marginTop:2 }}>
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8,
                        background:z ? z.light+'44' : '#1a2d5a', color:z?.color }}>
                        {z?.label}
                      </span>
                      <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8,
                        background:'#ffffff10', color:'var(--muted)' }}>W:{item.weight}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, width:60 }}>
                    <div style={{ height:3, borderRadius:2, width:`${pct*100}%`, maxWidth:60,
                      background:z?.color, minWidth:2, transition:'width .4s', alignSelf:'flex-end' }}/>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:600 }}>
                      {fp(pct)}
                    </span>
                  </div>
                  <span className={`st-${st.c}`} style={{ fontSize:9, padding:'2px 6px',
                    borderRadius:8, background:'#ffffff10', whiteSpace:'nowrap' }}>{st.l}</span>
                  <span style={{ fontSize:9, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Body */}
              {open && (
                <div style={{ borderTop:`1px solid ${z?.color ?? 'var(--border)'}`, padding:12 }}>
                  {/* Gantt dates */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                    {[['plan_start','Ngày BD KH'],['plan_end','Ngày HT KH'],
                      ['actual_start','BD Thực tế'],['actual_end','HT Thực tế']].map(([field, label]) => (
                      <div key={field} style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:130 }}>
                        <label style={{ fontSize:10, color:'var(--muted)' }}>{label}</label>
                        <input type="date"
                          value={(g as any)?.[field] ?? ''}
                          onChange={e => updateGantt(item.id, field, e.target.value)}
                          style={{ background:'#0a0f1e', border:`1px solid ${z?.color ?? 'var(--border)'}`,
                            borderRadius:5, padding:'5px 8px', color:'var(--text)',
                            fontFamily:'inherit', fontSize:11, outline:'none', width:'100%' }}/>
                      </div>
                    ))}
                  </div>

                  {/* Steps */}
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {steps.sort((a,b) => a.step_index - b.step_index).map(step => {
                      const p    = progressMap[step.id]
                      const done = !!p?.is_done
                      const na   = !!p?.is_na
                      return (
                        <div key={step.id} style={{
                          display:'flex', alignItems:'center', gap:8, padding:'7px 9px',
                          borderRadius:7, background: done ? '#1a3a1a' : na ? '#ffffff05' : '#ffffff06',
                          cursor:'pointer',
                        }}>
                          {/* Checkbox done */}
                          <div onClick={() => toggleStep(step.id, done)}
                            style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                              border:`1.5px solid ${done ? '#4ade80' : 'var(--muted)'}`,
                              background: done ? '#1a3a1a' : 'transparent',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, color:'#4ade80', cursor:'pointer' }}>
                            {done && '✓'}
                          </div>
                          {/* Name */}
                          <span style={{ flex:1, fontSize:11, color: na ? 'var(--muted)' : '#c0d0ef',
                            textDecoration: done ? 'line-through' : na ? 'line-through' : 'none' }}>
                            {step.name}
                          </span>
                          {/* Weight */}
                          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'var(--muted)' }}>
                            {step.weight}%
                          </span>
                          {/* N/A toggle */}
                          <div onClick={() => toggleNA(step.id, na)}
                            style={{ fontSize:9, padding:'2px 6px', borderRadius:6, cursor:'pointer',
                              background: na ? '#7030A022' : '#ffffff08',
                              color: na ? '#a060d0' : 'var(--muted)',
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
          <div style={{ textAlign:'center', color:'var(--muted)', padding:40 }}>
            Không tìm thấy hạng mục nào
          </div>
        )}
      </div>
    </AppShell>
  )
}
