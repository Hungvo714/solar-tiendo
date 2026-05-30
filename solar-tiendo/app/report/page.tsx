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
  const [exporting,   setExporting]   = useState(false)
  const [weekNum,     setWeekNum]     = useState('')
  const [reporter,    setReporter]    = useState('')

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    // Tự tính tuần số
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    setWeekNum(String(Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)))
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
      const late = Math.round((now.getTime() - planEnd.getTime()) / 86400000)
      return { label:`🔴 Trễ ${late}N`, color:'#FF8888' }
    }
    const remain = Math.round((planEnd.getTime() - now.getTime()) / 86400000)
    if (remain <= 7) return { label:`⏰ Còn ${remain}N`, color:'#fbbf24' }
    return { label:'🟢 Đúng KH', color:'#4ade80' }
  }

  const fmtD = (d?: string|null) => d
    ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
    : '—'

  async function saveReport() {
    if (!project) return
    setSaving(true)
    await supabase.from('weekly_reports').insert({
      project_id: project.id,
      week_number: parseInt(weekNum) || 0,
      report_date: new Date().toISOString().split('T')[0],
      issues, next_plan: plan,
      total_pct: Math.round(totalPct(items, progressMap) * 100),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function exportPDF() {
    setExporting(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      const tp  = totalPct(items, progressMap)
      const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
      const W = 210, margin = 14

      // ── Header ─────────────────────────────────────────────
      doc.setFillColor(13, 27, 62)
      doc.rect(0, 0, W, 30, 'F')

      // Logo HTE
      doc.setFillColor(245, 166, 35)
      doc.roundedRect(margin, 7, 16, 16, 2, 2, 'F')
      doc.setTextColor(13, 27, 62)
      doc.setFontSize(8); doc.setFont('helvetica','bold')
      doc.text('HTE', margin+8, 17, { align:'center' })

      // Title
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14); doc.setFont('helvetica','bold')
      doc.text('BAO CAO TIEN DO THI CONG TUAN', margin+20, 13)
      doc.setFontSize(8); doc.setFont('helvetica','normal')
      doc.setTextColor(180, 200, 230)
      doc.text(`${project?.name ?? ''} | ${today} | Tuan ${weekNum}`, margin+20, 20)
      if (reporter) doc.text(`Nguoi lap: ${reporter}`, margin+20, 26)

      let y = 36

      // ── Tổng tiến độ ───────────────────────────────────────
      doc.setFillColor(26, 45, 90)
      doc.roundedRect(margin, y, W-margin*2, 24, 2, 2, 'F')

      // TỔNG
      doc.setFontSize(8); doc.setFont('helvetica','normal')
      doc.setTextColor(180, 200, 230)
      doc.text('TONG TIEN DO', margin+4, y+7)
      doc.setFontSize(16); doc.setFont('helvetica','bold')
      doc.setTextColor(245, 166, 35)
      doc.text(fp(tp), margin+4, y+18)

      // 4 khu vực
      const zoneW = (W - margin*2 - 40) / 4
      zones.forEach((z, i) => {
        const x = margin + 40 + i * zoneW
        const zp = zonePct(z.id, items, progressMap)
        // Color box
        const c = hexToRgb(z.color)
        if (c) doc.setFillColor(c.r, c.g, c.b)
        doc.roundedRect(x, y+2, zoneW-3, 20, 1, 1, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(7); doc.setFont('helvetica','normal')
        doc.text(z.label, x+2, y+9)
        doc.setFontSize(11); doc.setFont('helvetica','bold')
        doc.text(fp(zp), x+2, y+18)
      })

      y += 30

      // ── Bảng tiến độ ───────────────────────────────────────
      doc.setFontSize(10); doc.setFont('helvetica','bold')
      doc.setTextColor(30, 50, 100)
      doc.text('TIEN DO TUNG HANG MUC', margin, y+5)
      y += 8

      const tableData = items.map(it => {
        const pct  = itemPct(it, progressMap)
        const z    = zones.find(zn => zn.id === it.zone_id)
        const g    = ganttMap[it.id]
        const sch  = getSchedStatus(it)
        return [
          `${it.stt}. ${it.name}`,
          z?.label ?? '',
          fp(pct),
          fmtD(g?.plan_start),
          fmtD(g?.plan_end),
          fmtD(g?.actual_end),
          sch?.label ?? '—',
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [['Hang muc', 'Khu vuc', '%', 'BD KH', 'HT KH', 'HT TT', 'Trang thai']],
        body: tableData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: [26, 45, 90], textColor: [180, 200, 230],
          fontSize: 7, fontStyle: 'bold', halign: 'center'
        },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: 22, halign:'center' },
          2: { cellWidth: 14, halign:'center', fontStyle:'bold' },
          3: { cellWidth: 18, halign:'center' },
          4: { cellWidth: 18, halign:'center' },
          5: { cellWidth: 18, halign:'center' },
          6: { cellWidth: 28, halign:'center' },
        },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        didParseCell: (data: any) => {
          if (data.column.index === 2 && data.section === 'body') {
            const val = parseFloat(data.cell.text[0])
            if (val >= 100) data.cell.styles.textColor = [39, 98, 33]
            else if (val > 0) data.cell.styles.textColor = [156, 101, 0]
            else data.cell.styles.textColor = [156, 8, 6]
          }
        },
      })

      y = (doc as any).lastAutoTable.finalY + 8

      // ── Vấn đề & Kế hoạch ─────────────────────────────────
      if (issues || plan) {
        if (y > 240) { doc.addPage(); y = 20 }

        if (issues) {
          doc.setFontSize(9); doc.setFont('helvetica','bold')
          doc.setTextColor(30, 50, 100)
          doc.text('VAN DE PHAT SINH:', margin, y)
          y += 5
          doc.setFont('helvetica','normal'); doc.setFontSize(8)
          doc.setTextColor(50, 50, 50)
          const lines = doc.splitTextToSize(issues, W - margin*2)
          doc.text(lines, margin, y)
          y += lines.length * 4 + 4
        }

        if (plan) {
          doc.setFontSize(9); doc.setFont('helvetica','bold')
          doc.setTextColor(30, 50, 100)
          doc.text('KE HOACH TUAN TOI:', margin, y)
          y += 5
          doc.setFont('helvetica','normal'); doc.setFontSize(8)
          doc.setTextColor(50, 50, 50)
          const lines = doc.splitTextToSize(plan, W - margin*2)
          doc.text(lines, margin, y)
          y += lines.length * 4 + 4
        }
      }

      // ── Ký tên ────────────────────────────────────────────
      if (y > 250) { doc.addPage(); y = 20 }
      y = Math.max(y + 10, 240)

      const sigW = (W - margin*2) / 3
      const sigLabels = ['Nguoi lap bao cao', 'Giam sat truong', 'Chu dau tu xac nhan']
      sigLabels.forEach((lbl, i) => {
        const x = margin + i * sigW
        doc.setFillColor(26, 45, 90)
        doc.rect(x, y, sigW-4, 8, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(7); doc.setFont('helvetica','bold')
        doc.text(lbl, x + (sigW-4)/2, y+5, { align:'center' })
        doc.setDrawColor(200, 210, 230)
        doc.rect(x, y+8, sigW-4, 22)
        doc.setTextColor(180, 180, 180)
        doc.setFont('helvetica','normal'); doc.setFontSize(7)
        doc.text('Ky ten & dong dau', x + (sigW-4)/2, y+20, { align:'center' })
      })

      // ── Footer ────────────────────────────────────────────
      doc.setFillColor(13, 27, 62)
      doc.rect(0, 285, W, 12, 'F')
      doc.setTextColor(120, 140, 180)
      doc.setFontSize(7); doc.setFont('helvetica','normal')
      doc.text('HTE Managed Services | Solar Tien Do', W/2, 292, { align:'center' })
      doc.text(`Trang 1 | ${today}`, W - margin, 292, { align:'right' })

      doc.save(`BaoCaoTuần_${project?.name ?? 'Solar'}_Tuan${weekNum}_${new Date().toLocaleDateString('vi-VN').replace(/\//g,'-')}.pdf`)
    } catch(e) {
      console.error(e)
      alert('Lỗi xuất PDF. Thử lại hoặc dùng Ctrl+P → Save as PDF.')
    } finally {
      setExporting(false)
    }
  }

  function hexToRgb(hex: string) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>📋</div><div>Đang tải...</div>
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
            onClick={() => window.location.href='/projects'}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project?.name}</div>
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
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          <div style={{ background:'#0d1b3e', border:'1px solid #ffffff15', borderRadius:14, padding:18 }}>

            {/* Header card */}
            <div style={{ display:'flex', alignItems:'center', gap:10,
              paddingBottom:14, borderBottom:'1px solid #ffffff10', marginBottom:14 }}>
              <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
                fontSize:11, width:42, height:42, borderRadius:9,
                display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>Báo cáo tiến độ thi công tuần</div>
                <div style={{ fontSize:10, color:'#8899bb', marginTop:2 }}>{project?.name} · {today}</div>
              </div>
            </div>

            {/* Tuần + Người lập */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>Tuần số</label>
                <input value={weekNum} onChange={e => setWeekNum(e.target.value)}
                  placeholder="VD: 22"
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

            {/* KPI */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
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
            <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #ffffff10', marginBottom:14, overflowX:'auto' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 55px 60px 65px 65px 65px 85px',
                padding:'7px 10px', background:'#1a2d5a',
                fontSize:9, fontWeight:600, color:'#8899bb', gap:4, minWidth:500 }}>
                <span>Hạng mục</span>
                <span style={{ textAlign:'center' }}>%</span>
                <span style={{ textAlign:'center' }}>BD KH</span>
                <span style={{ textAlign:'center' }}>HT KH</span>
                <span style={{ textAlign:'center' }}>HT TT</span>
                <span style={{ textAlign:'center' }}>Trạng thái</span>
                <span style={{ textAlign:'center' }}>Tiến độ</span>
              </div>
              {items.map(it => {
                const pct  = itemPct(it, progressMap)
                const z    = zones.find(zn => zn.id === it.zone_id)
                const g    = ganttMap[it.id]
                const sch  = getSchedStatus(it)
                return (
                  <div key={it.id} style={{ display:'grid',
                    gridTemplateColumns:'1fr 55px 60px 65px 65px 65px 85px',
                    padding:'6px 10px', background: z ? z.light+'15' : 'transparent',
                    borderTop:'1px solid #ffffff08', gap:4, alignItems:'center', minWidth:500 }}>
                    <span style={{ fontSize:10, color:'#c8d8f0',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <span style={{ color:z?.color, fontSize:9 }}>{it.stt}.</span> {it.name}
                    </span>
                    <span style={{ fontSize:10, fontFamily:'monospace', textAlign:'center', fontWeight:600,
                      color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>{fp(pct)}</span>
                    <span style={{ fontSize:9, color:'#8899bb', textAlign:'center' }}>{fmtD(g?.plan_start)}</span>
                    <span style={{ fontSize:9, color:'#60a5fa', textAlign:'center' }}>{fmtD(g?.plan_end)}</span>
                    <span style={{ fontSize:9, color:'#4ade80', textAlign:'center' }}>{fmtD(g?.actual_end)}</span>
                    <span style={{ textAlign:'center' }}>
                      {sch
                        ? <span style={{ fontSize:8, color:sch.color }}>{sch.label}</span>
                        : <span style={{ fontSize:9, color:'#ffffff25' }}>—</span>}
                    </span>
                    {/* Progress bar */}
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <div style={{ flex:1, height:4, background:'#ffffff15', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct*100}%`, background:z?.color ?? '#4472C4',
                          borderRadius:2, transition:'width .3s' }}/>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Notes */}
            {[['⚠️ Vấn đề phát sinh tuần này', issues, setIssues],
              ['📋 Kế hoạch & yêu cầu tuần tới', plan, setPlan]].map(([label, val, setter]) => (
              <div key={label as string} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:5 }}>{label as string}</div>
                <textarea value={val as string} onChange={e => (setter as Function)(e.target.value)}
                  rows={3} placeholder="Nhập nội dung..."
                  style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff15',
                    borderRadius:7, padding:9, color:'#e8eaf0', fontFamily:'inherit',
                    fontSize:11, resize:'vertical' as any, outline:'none', boxSizing:'border-box' as any }}/>
              </div>
            ))}

            {/* Sign */}
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {['Người lập báo cáo','Giám sát trưởng','Chủ đầu tư xác nhận'].map(r => (
                <div key={r} style={{ flex:1, minWidth:130, border:'1px dashed #ffffff20',
                  borderRadius:7, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#8899bb', marginBottom:18 }}>{r}</div>
                  <div style={{ borderTop:'1px solid #ffffff20', marginBottom:5 }}/>
                  <div style={{ fontSize:9, color:'#ffffff25' }}>Ký tên & đóng dấu</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveReport} disabled={saving}
                style={{ flex:1, padding:12, background:'#1a2d5a', border:'1px solid #4472C4',
                  borderRadius:9, color:'#e8eaf0', fontFamily:'inherit',
                  fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu báo cáo'}
              </button>
              <button onClick={exportPDF} disabled={exporting}
                style={{ flex:1, padding:12, background: exporting ? '#1a3a1a' : '#276221',
                  border:'1px solid #4ade80', borderRadius:9, color:'#4ade80',
                  fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {exporting ? '⏳ Đang tạo PDF...' : '📄 Xuất PDF'}
              </button>
            </div>

            <div style={{ fontSize:10, color:'#8899bb', textAlign:'center', marginTop:8 }}>
              PDF sẽ tự động tải về · A4 Portrait · Tiếng Việt
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
