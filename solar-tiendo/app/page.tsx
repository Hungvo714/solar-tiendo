'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, zonePct, totalPct, fp, statusOf } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

const TABS = [
  { path:'/dashboard', icon:'ti-layout-dashboard', label:'Tổng quan' },
  { path:'/progress',  icon:'ti-checklist',        label:'Tiến độ'   },
  { path:'/gantt',     icon:'ti-calendar-event',   label:'Gantt'     },
  { path:'/report',    icon:'ti-file-description', label:'Báo cáo'   },
]

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
  const [weekNum,     setWeekNum]     = useState('')
  const [reporter,    setReporter]    = useState('')
  const [printMode,   setPrintMode]   = useState(false)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    setWeekNum(String(Math.ceil(((now.getTime()-start.getTime())/86400000+start.getDay()+1)/7)))
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

  function navigate(path: string) { window.location.href = `${path}?project=${projectId}` }

  function getSchedStatus(item: Item) {
    const g = ganttMap[item.id]
    if (!g?.plan_end) return null
    const pct = itemPct(item, progressMap)
    const planEnd = new Date(g.plan_end)
    const now = new Date()
    if (pct >= 1) return { label:'✅ Xong', color:'#4ade80' }
    if (now > planEnd) {
      const late = Math.round((now.getTime()-planEnd.getTime())/86400000)
      return { label:`🔴 Trễ ${late}N`, color:'#ff8888' }
    }
    const remain = Math.round((planEnd.getTime()-now.getTime())/86400000)
    if (remain <= 7) return { label:`⏰ Còn ${remain}N`, color:'#fbbf24' }
    return { label:'🟢 Đúng KH', color:'#4ade80' }
  }


  function getNextWeekItems() {
    const now = new Date()
    const daysToNextMon = (7 - now.getDay()) % 7 || 7
    const nextMon = new Date(now)
    nextMon.setDate(now.getDate() + daysToNextMon)
    nextMon.setHours(0,0,0,0)
    const nextSun = new Date(nextMon)
    nextSun.setDate(nextMon.getDate() + 6)
    nextSun.setHours(23,59,59,999)
    const nextMonStr = nextMon.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
    const nextSunStr = nextSun.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
    const label = `Tuần ${parseInt(weekNum)+1} (${nextMonStr} - ${nextSunStr})`
    const list = items.filter(it => {
      const g = ganttMap[it.id]
      // Ưu tiên ngày thực tế, sau đó kế hoạch
      const startDate = g?.actual_start || g?.plan_start
      const endDate   = g?.actual_end   || g?.plan_end
      if (!startDate) return false
      const s = new Date(startDate)
      const e = endDate ? new Date(endDate) : s
      // Hiển thị nếu công việc đang diễn ra hoặc bắt đầu trong tuần tới
      // Điều kiện: start <= chủ nhật tuần tới VÀ end >= thứ 2 tuần tới
      return s <= nextSun && e >= nextMon
    })
    return { list, label }
  }

  const fmtD = (d?: string|null) => d
    ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : '—'

  async function saveReport() {
    if (!project) return
    setSaving(true)
    await supabase.from('weekly_reports').insert({
      project_id: project.id,
      week_number: parseInt(weekNum)||0,
      report_date: new Date().toISOString().split('T')[0],
      issues, next_plan: plan,
      total_pct: Math.round(totalPct(items, progressMap)*100),
    })
    setSaving(false); setSaved(true)
    setTimeout(()=>setSaved(false), 3000)
  }



  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>📋</div><div>Đang tải...</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})

  const printStyle = `
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
        @top-right {
          content: "${project?.name ?? ''}";
          font-size: 9pt;
          color: #666;
        }
      }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      /* Ẩn URL header/footer của browser */
      @page { margin-header: 0mm; margin-footer: 0mm; }
      head { display: none; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      nav, header { display: none !important; }
      main { padding: 0 !important; }
      .report-card { border: none !important; border-radius: 0 !important; padding: 0 !important; }
    }
  `

  // Set document title = tên dự án khi print
  function handlePrint() {
    const origTitle = document.title
    document.title = project?.name ?? 'Bao Cao Tien Do'
    setPrintMode(true)
    setTimeout(() => {
      window.print()
      document.title = origTitle
      setPrintMode(false)
    }, 300)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background: printMode ? '#fff' : '#0a0f1e',
      color: printMode ? '#000' : '#e8eaf0',
      fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      <style>{printStyle}</style>

      <header className="no-print" style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
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
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project?.name}</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.contractor}</div>
          </div>
        </div>
      </header>

      <nav className="no-print" style={{ display:'flex', background:'#0d1b3e', borderBottom:'1px solid #ffffff10' }}>
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

      <main style={{ flex:1, overflowY:'auto', padding: printMode ? 0 : 12 }}>
        <div style={{ maxWidth: printMode ? '100%' : 680, margin:'0 auto' }}>
          <div className="report-card" style={{ background: printMode ? '#fff' : '#0d1b3e',
            border: printMode ? 'none' : '1px solid #ffffff15',
            borderRadius:14, padding: printMode ? '0' : 18 }}>

            {/* === PRINT HEADER === */}
            <div style={{ background:'#0d1b3e', padding:'16px 20px', marginBottom:16,
              borderRadius: printMode ? 0 : 10,
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
                  fontSize:14, width:48, height:48, borderRadius:10,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>
                    BÁO CÁO TIẾN ĐỘ THI CÔNG TUẦN {weekNum}
                  </div>
                  <div style={{ fontSize:11, color:'#8899bb', marginTop:3 }}>
                    {project?.name} · {project?.contractor} · {today}
                  </div>
                  {reporter && <div style={{ fontSize:11, color:'#8899bb' }}>Người lập: {reporter}</div>}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:28, fontWeight:700, color:'#F5A623', fontFamily:'monospace' }}>{fp(tp)}</div>
                <div style={{ fontSize:10, color:'#8899bb' }}>Tổng tiến độ</div>
              </div>
            </div>

            {/* Tuần + Người lập — chỉ hiện khi không print */}
            <div className="no-print" style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
              gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>Tuần số</label>
                <input value={weekNum} onChange={e => setWeekNum(e.target.value)}
                  style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                    borderRadius:7, padding:'7px 10px', color:'#e8eaf0',
                    fontFamily:'inherit', fontSize:12, outline:'none' }}/>
              </div>
              <div>
                <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>Người lập báo cáo</label>
                <input value={reporter} onChange={e => setReporter(e.target.value)}
                  placeholder="Tên người lập..."
                  style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                    borderRadius:7, padding:'7px 10px', color:'#e8eaf0',
                    fontFamily:'inherit', fontSize:12, outline:'none' }}/>
              </div>
            </div>

            {/* KPI zones */}
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${zones.length},1fr)`,
              gap:6, marginBottom:14 }}>
              {zones.map(z => (
                <div key={z.id} style={{ background:z.color, borderRadius:8,
                  padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.8)', marginBottom:4 }}>{z.label}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#fff', fontFamily:'monospace' }}>
                    {fp(zonePct(z.id, items, progressMap))}
                  </div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ marginBottom:14, overflowX:'auto' }}>
              <div style={{ fontSize:12, fontWeight:700,
                color: printMode ? '#0d1b3e' : '#c0d0ef', marginBottom:8 }}>
                TIẾN ĐỘ TỪNG HẠNG MỤC
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead>
                  <tr style={{ background:'#0d1b3e' }}>
                    {['Hạng mục','Khu vực','%','BD KH','HT KH','HT TT','Trạng thái','Tiến độ'].map(h => (
                      <th key={h} style={{ padding:'7px 8px', color:'#8899bb',
                        fontWeight:600, textAlign:'center', whiteSpace:'nowrap',
                        border:'1px solid #ffffff10' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const pct = itemPct(it, progressMap)
                    const z   = zones.find(zn => zn.id === it.zone_id)
                    const g   = ganttMap[it.id]
                    const sch = getSchedStatus(it)
                    return (
                      <tr key={it.id} style={{
                        background: idx%2===0
                          ? (printMode ? '#f8f9ff' : '#ffffff08')
                          : (printMode ? '#fff' : 'transparent') }}>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          color: printMode ? '#1a1a2e' : '#c8d8f0', maxWidth:180 }}>
                          <span style={{ color:z?.color, marginRight:4, fontSize:9 }}>{it.stt}.</span>
                          {it.name}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', color:z?.color, whiteSpace:'nowrap' }}>
                          {z?.label}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', fontWeight:700, fontFamily:'monospace',
                          color: pct>=1?'#276221':pct>0?'#9C6500':'#9C0006' }}>
                          {fp(pct)}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', color: printMode?'#555':'#8899bb', whiteSpace:'nowrap' }}>
                          {fmtD(g?.plan_start)}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', color: printMode?'#1a5fa5':'#60a5fa', whiteSpace:'nowrap' }}>
                          {fmtD(g?.plan_end)}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', color: printMode?'#276221':'#4ade80', whiteSpace:'nowrap' }}>
                          {fmtD(g?.actual_end)}
                        </td>
                        <td style={{ padding:'6px 8px', border:'1px solid #ffffff10',
                          textAlign:'center', whiteSpace:'nowrap',
                          color: sch ? sch.color : '#8899bb', fontSize:9 }}>
                          {sch?.label ?? '—'}
                        </td>
                        <td style={{ padding:'6px 10px', border:'1px solid #ffffff10', minWidth:60 }}>
                          <div style={{ height:6, background: printMode?'#e0e0e0':'#ffffff15',
                            borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct*100}%`,
                              background:z?.color ?? '#4472C4', borderRadius:3 }}/>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Vấn đề phát sinh */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700,
                color: printMode ? '#0d1b3e' : '#c0d0ef', marginBottom:5 }}>
                ⚠️ Vấn đề phát sinh tuần này
              </div>
              {printMode ? (
                <div style={{ border:'1px solid #ddd', borderRadius:6, padding:'8px 10px',
                  minHeight:50, fontSize:11, color:'#333', whiteSpace:'pre-wrap' }}>
                  {issues || ' '}
                </div>
              ) : (
                <textarea value={issues} onChange={e => setIssues(e.target.value)}
                  rows={3} placeholder="Nhập vấn đề phát sinh..."
                  style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff15',
                    borderRadius:7, padding:9, color:'#e8eaf0', fontFamily:'inherit',
                    fontSize:11, resize:'vertical' as any, outline:'none',
                    boxSizing:'border-box' as any }}/>
              )}
            </div>

            {/* Kế hoạch tuần tới - TỰ ĐỘNG */}
            <div style={{ marginBottom:12 }}>
              {(() => {
                const { list: nxItems, label: nxLabel } = getNextWeekItems()
                return (
                  <>
                    <div style={{ fontSize:11, fontWeight:700,
                      color: printMode ? '#0d1b3e' : '#c0d0ef', marginBottom:5 }}>
                      📋 Kế hoạch tuần tới — {nxLabel}
                    </div>
                    {nxItems.length > 0 ? (
                      <div style={{ borderRadius:8, overflow:'hidden',
                        border: printMode ? '1px solid #ccc' : '1px solid #ffffff10',
                        marginBottom:8 }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 65px 65px',
                          padding:'6px 10px',
                          background: '#1a2d5a',
                          fontSize:9, fontWeight:600, color:'#8899bb', gap:6 }}>
                          <span>Hạng mục</span>
                          <span style={{ textAlign:'center' }}>Khu vực</span>
                          <span style={{ textAlign:'center' }}>BD KH</span>
                          <span style={{ textAlign:'center' }}>HT KH</span>
                        </div>
                        {nxItems.map((it, idx) => {
                          const z = zones.find(zn => zn.id === it.zone_id)
                          const g = ganttMap[it.id]
                          return (
                            <div key={it.id} style={{ display:'grid',
                              gridTemplateColumns:'1fr 70px 65px 65px',
                              padding:'6px 10px', gap:6, alignItems:'center',
                              background: idx%2===0 ? (z ? z.light+'25' : '#ffffff08') : (printMode ? '#fff' : 'transparent'),
                              borderTop: '1px solid #ffffff08' }}>
                              <span style={{ fontSize:10, color: printMode ? '#1a1a2e' : '#c8d8f0' }}>
                                <span style={{ color:z?.color, fontSize:9, marginRight:3 }}>{it.stt}.</span>
                                {it.name}
                              </span>
                              <span style={{ fontSize:9, textAlign:'center', color:z?.color }}>{z?.label}</span>
                              <span style={{ fontSize:9, textAlign:'center',
                                color: printMode ? '#555' : '#8899bb' }}>{fmtD(g?.plan_start)}</span>
                              <span style={{ fontSize:9, textAlign:'center',
                                color: printMode ? '#1a5fa5' : '#60a5fa' }}>{fmtD(g?.plan_end)}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ padding:'10px 14px', borderRadius:8, fontSize:11,
                        background:'#ffffff08', color:'#8899bb',
                        border:'1px solid #ffffff10', marginBottom:8 }}>
                        {Object.keys(ganttMap).length === 0
                          ? '💡 Nhập ngày kế hoạch tại tab Tiến độ để tự động hiển thị'
                          : '✅ Không có hạng mục nào bắt đầu trong tuần tới'}
                      </div>
                    )}
                    <textarea value={plan} onChange={e => setPlan(e.target.value)}
                      rows={2} placeholder="Ghi chú thêm cho tuần tới (tuỳ chọn)..."
                      style={{ width:'100%', background:'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:7, padding:9,
                        color:'#e8eaf0', fontFamily:'inherit', fontSize:11,
                        resize:'vertical' as any, outline:'none',
                        boxSizing:'border-box' as any,
                        display: printMode ? 'none' : 'block' }}/>
                    {printMode && plan && (
                      <div style={{ border:'1px solid #ddd', borderRadius:6,
                        padding:'6px 10px', fontSize:11, color:'#333', whiteSpace:'pre-wrap' }}>
                        {plan}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Sign */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
              {['Người lập báo cáo','Giám sát trưởng','Chủ đầu tư xác nhận'].map(r => (
                <div key={r} style={{
                  border: printMode ? '1px solid #ccc' : '1px dashed #ffffff20',
                  borderRadius:7, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:9, fontWeight:600,
                    color: printMode ? '#0d1b3e' : '#8899bb', marginBottom:32 }}>{r}</div>
                  <div style={{ borderTop: printMode ? '1px solid #999' : '1px solid #ffffff20', marginBottom:5 }}/>
                  <div style={{ fontSize:9, color: printMode ? '#999' : '#ffffff25' }}>Ký tên & đóng dấu</div>
                </div>
              ))}
            </div>

            {/* Footer print */}
            {printMode && (
              <div style={{ borderTop:'1px solid #ccc', paddingTop:8, marginTop:8,
                display:'flex', justifyContent:'space-between', alignItems:'center',
                fontSize:9, color:'#666' }}>
                <span style={{ fontWeight:600, color:'#333' }}>
                  {project?.name} · {project?.client} · {project?.contractor}
                </span>
                <span>Ngày {today} · Trang <span className="page-num">1</span></span>
              </div>
            )}

            {/* Action buttons */}
            <div className="no-print" style={{ display:'flex', gap:8 }}>
              <button onClick={saveReport} disabled={saving}
                style={{ flex:1, padding:12, background:'#1a2d5a', border:'1px solid #4472C4',
                  borderRadius:9, color:'#e8eaf0', fontFamily:'inherit',
                  fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu báo cáo'}
              </button>
              <button onClick={handlePrint}
                style={{ flex:1, padding:12, background:'#276221', border:'1px solid #4ade80',
                  borderRadius:9, color:'#4ade80', fontFamily:'inherit',
                  fontSize:12, fontWeight:600, cursor:'pointer' }}>
                🖨️ In / Xuất PDF
              </button>
            </div>

            <div className="no-print" style={{ fontSize:10, color:'#8899bb', textAlign:'center', marginTop:8 }}>
              Nhấn "In / Xuất PDF" → chọn "Save as PDF" → PDF tiếng Việt đầy đủ ✅
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
