'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, zonePct, totalPct, fp, statusOf } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

export default function ReportPage() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState('')
  const [issues,      setIssues]      = useState('')
  const [plan,        setPlan]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)

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

  async function saveReport() {
    if (!project) return
    setSaving(true)
    await supabase.from('weekly_reports').insert({
      project_id: project.id,
      report_date: new Date().toISOString().split('T')[0],
      issues, next_plan: plan,
      total_pct: Math.round(totalPct(items, progressMap) * 100),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function getScheduleStatus(item: Item) {
    const g = ganttMap[item.id]
    if (!g?.plan_end) return null
    const pct = itemPct(item, progressMap)
    const planEnd = new Date(g.plan_end)
    const actualEnd = g.actual_end ? new Date(g.actual_end) : null
    const now = new Date()
    if (pct >= 1) {
      if (actualEnd && actualEnd <= planEnd) return { label:'✅ Đúng tiến độ', color:'#4ade80', bg:'#1a3a1a' }
      if (actualEnd && actualEnd > planEnd) {
        const late = Math.round((actualEnd.getTime() - planEnd.getTime()) / 86400000)
        return { label:`⚠️ Trễ ${late} ngày`, color:'#fbbf24', bg:'#3a2a0a' }
      }
    }
    if (now > planEnd && pct < 1) {
      const late = Math.round((now.getTime() - planEnd.getTime()) / 86400000)
      return { label:`🔴 Trễ ${late} ngày`, color:'#FF8888', bg:'#3a0a0a' }
    }
    const remain = Math.round((planEnd.getTime() - now.getTime()) / 86400000)
    if (remain <= 7) return { label:`⏰ Còn ${remain} ngày`, color:'#fbbf24', bg:'#3a2a0a' }
    return { label:'🟢 Đúng KH', color:'#4ade80', bg:'#0a1a0a' }
  }

  const fmtDate = (d?: string|null) => d
    ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
    : '—'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>📋</div><div>Đang tải báo cáo...</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})

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
              color: tab.path==='/report' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/report' ? '2px solid #F5A623' : '2px solid transparent',
              minWidth:60, whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        <div style={{ maxWidth:640, margin:'0 auto' }}>
          <div style={{ background:'#0d1b3e', border:'1px solid #ffffff15', borderRadius:14, padding:18 }}>

            <div style={{ display:'flex', alignItems:'center', gap:10,
              paddingBottom:14, borderBottom:'1px solid #ffffff10', marginBottom:14 }}>
              <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
                fontSize:11, width:42, height:42, borderRadius:9,
                display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>Báo cáo tiến độ thi công tuần</div>
                <div style={{ fontSize:10, color:'#8899bb', marginTop:2 }}>{project?.name} · {today}</div>
              </div>
            </div>

            {/* KPI */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
              <div style={{ background:'#1a2d5a', borderRadius:9, padding:'10px 14px',
                display:'flex', flexDirection:'column', gap:2, flex:1, minWidth:100 }}>
                <span style={{ fontSize:9, color:'#8899bb' }}>Tổng tiến độ</span>
                <span style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:'#F5A623' }}>{fp(tp)}</span>
              </div>
              {zones.map(z => (
                <div key={z.id} style={{ background:'#0a0f1e', borderRadius:7, padding:'8px 10px',
                  display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:80,
                  borderLeft:`3px solid ${z.color}` }}>
                  <span style={{ fontSize:10, color:z.color }}>{z.label}</span>
                  <strong style={{ fontFamily:'monospace', fontSize:13, color:'#e8eaf0' }}>
                    {fp(zonePct(z.id, items, progressMap))}
                  </strong>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #ffffff10', marginBottom:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 55px 82px 82px 82px 90px',
                padding:'7px 10px', background:'#1a2d5a',
                fontSize:9, fontWeight:600, color:'#8899bb', gap:4 }}>
                <span>Hạng mục</span>
                <span style={{ textAlign:'center' }}>%</span>
                <span style={{ textAlign:'center' }}>BD KH</span>
                <span style={{ textAlign:'center' }}>HT KH</span>
                <span style={{ textAlign:'center' }}>HT TT</span>
                <span style={{ textAlign:'center' }}>Trạng thái</span>
              </div>
              {items.map(it => {
                const pct  = itemPct(it, progressMap)
                const z    = zones.find(zn => zn.id === it.zone_id)
                const g    = ganttMap[it.id]
                const sched = getScheduleStatus(it)
                return (
                  <div key={it.id} style={{ display:'grid',
                    gridTemplateColumns:'1fr 55px 82px 82px 82px 90px',
                    padding:'6px 10px', background: z ? z.light+'15' : 'transparent',
                    borderTop:'1px solid #ffffff08', gap:4, alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'#c8d8f0',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <span style={{ color:z?.color, fontSize:10, marginRight:3 }}>{it.stt}.</span>
                      {it.name}
                    </span>
                    <span style={{ fontSize:10, fontFamily:'monospace', textAlign:'center', fontWeight:600,
                      color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{fp(pct)}</span>
                    <span style={{ fontSize:9, color:'#8899bb', textAlign:'center' }}>{fmtDate(g?.plan_start)}</span>
                    <span style={{ fontSize:9, color:'#60a5fa', textAlign:'center' }}>{fmtDate(g?.plan_end)}</span>
                    <span style={{ fontSize:9, color:'#4ade80', textAlign:'center' }}>{fmtDate(g?.actual_end)}</span>
                    <span style={{ textAlign:'center' }}>
                      {sched
                        ? <span style={{ fontSize:9, padding:'2px 5px', borderRadius:8,
                            background:sched.bg, color:sched.color, whiteSpace:'nowrap' }}>
                            {sched.label}
                          </span>
                        : <span style={{ fontSize:9, color:'#ffffff30' }}>—</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Notes */}
            {[['Vấn đề phát sinh tuần này', issues, setIssues],
              ['Kế hoạch & yêu cầu hỗ trợ tuần tới', plan, setPlan]].map(([label, val, setter]) => (
              <div key={label as string} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:5 }}>{label as string}</div>
                <textarea value={val as string} onChange={e => (setter as Function)(e.target.value)}
                  rows={3} placeholder={`Nhập ${(label as string).toLowerCase()}...`}
                  style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff15',
                    borderRadius:7, padding:9, color:'#e8eaf0', fontFamily:'inherit',
                    fontSize:11, resize:'vertical' as any, outline:'none', boxSizing:'border-box' as any }}/>
              </div>
            ))}

            {/* Sign */}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              {['Người lập báo cáo','Giám sát trưởng','Chủ đầu tư xác nhận'].map(r => (
                <div key={r} style={{ flex:1, minWidth:130, border:'1px dashed #ffffff20',
                  borderRadius:7, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#8899bb', marginBottom:18 }}>{r}</div>
                  <div style={{ borderTop:'1px solid #ffffff20', marginBottom:5 }}/>
                  <div style={{ fontSize:9, color:'#ffffff25' }}>Ký tên & đóng dấu</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveReport} disabled={saving}
                style={{ flex:1, padding:11, background:'#1a2d5a', border:'1px solid #4472C4',
                  borderRadius:9, color:'#e8eaf0', fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu báo cáo'}
              </button>
              <button onClick={() => window.print()}
                style={{ flex:1, padding:11, background:'#1a3a1a', border:'1px solid #4ade80',
                  borderRadius:9, color:'#4ade80', fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                📄 Xuất PDF
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
