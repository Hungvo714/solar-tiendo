'use client'
import { useState } from 'react'
import { useAppData } from '@/hooks/useAppData'
import AppShell from '@/components/AppShell'
import { itemPct, zonePct, totalPct, fp, statusOf } from '@/lib/calc'
import { supabase } from '@/lib/supabase'

export default function ReportPage() {
  const { project, zones, items, progressMap, ganttMap, loading } = useAppData()
  const [issues, setIssues]  = useState('')
  const [plan, setPlan]      = useState('')
  const [saving, setSaving]  = useState(false)
  const [saved, setSaved]    = useState(false)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>📋</div><div>Đang tải...</div>
    </div>
  )

  const tp    = totalPct(items, progressMap)
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})

  function getScheduleStatus(itemId: string) {
    const g = ganttMap[itemId]
    if (!g?.plan_end) return null
    const pct = itemPct(items.find(i => i.id === itemId)!, progressMap)
    const planEnd   = new Date(g.plan_end)
    const actualEnd = g.actual_end ? new Date(g.actual_end) : null
    const now       = new Date()

    if (pct >= 1) {
      if (actualEnd && actualEnd <= planEnd) return { label:'✅ Đúng tiến độ', color:'#4ade80', bg:'#1a3a1a' }
      if (actualEnd && actualEnd > planEnd) {
        const late = Math.round((actualEnd.getTime() - planEnd.getTime()) / 86400000)
        return { label:`⚠️ Trễ ${late} ngày`, color:'#fbbf24', bg:'#3a2a0a' }
      }
      return { label:'✅ Xong', color:'#4ade80', bg:'#1a3a1a' }
    }
    if (now > planEnd) {
      const late = Math.round((now.getTime() - planEnd.getTime()) / 86400000)
      return { label:`🔴 Trễ ${late} ngày`, color:'#FF8888', bg:'#3a0a0a' }
    }
    const remain = Math.round((planEnd.getTime() - now.getTime()) / 86400000)
    if (remain <= 7) return { label:`⏰ Còn ${remain} ngày`, color:'#fbbf24', bg:'#3a2a0a' }
    return { label:'🟢 Đúng KH', color:'#4ade80', bg:'#0a1a0a' }
  }

  async function saveReport() {
    if (!project) return
    setSaving(true)
    await supabase.from('weekly_reports').insert({
      project_id: project.id,
      report_date: new Date().toISOString().split('T')[0],
      issues, next_plan: plan,
      total_pct: Math.round(tp * 100),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const fmtDate = (d?: string|null) => d
    ? new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
    : '—'

  return (
    <AppShell project={project} items={items} progressMap={progressMap}>
      <div style={{ maxWidth:640, margin:'0 auto' }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff15', borderRadius:14, padding:18 }}>

          {/* Header */}
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
              <div key={z.id} style={{ background:'#0a0f1e', borderRadius:7,
                padding:'8px 10px', display:'flex', flexDirection:'column', gap:3,
                flex:1, minWidth:80, borderLeft:`3px solid ${z.color}` }}>
                <span style={{ fontSize:10, color:z.color }}>{z.label}</span>
                <strong style={{ fontFamily:'monospace', fontSize:13, color:'#e8eaf0' }}>
                  {fp(zonePct(z.id, items, progressMap))}
                </strong>
              </div>
            ))}
          </div>

          {/* Table với ngày KH/TT và trạng thái */}
          <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid #ffffff10', marginBottom:14 }}>
            {/* Header */}
            <div style={{ display:'grid',
              gridTemplateColumns:'1fr 55px 85px 85px 85px 95px',
              padding:'7px 10px', background:'#1a2d5a',
              fontSize:9, fontWeight:600, color:'#8899bb', gap:6 }}>
              <span>Hạng mục</span>
              <span style={{ textAlign:'center' }}>%</span>
              <span style={{ textAlign:'center' }}>BD kế hoạch</span>
              <span style={{ textAlign:'center' }}>HT kế hoạch</span>
              <span style={{ textAlign:'center' }}>HT thực tế</span>
              <span style={{ textAlign:'center' }}>Trạng thái</span>
            </div>

            {items.map(it => {
              const pct  = itemPct(it, progressMap)
              const z    = zones.find(zn => zn.id === it.zone_id)
              const g    = ganttMap[it.id]
              const sched = getScheduleStatus(it.id)

              return (
                <div key={it.id} style={{
                  display:'grid',
                  gridTemplateColumns:'1fr 55px 85px 85px 85px 95px',
                  padding:'6px 10px',
                  background: z ? z.light + '15' : 'transparent',
                  borderTop:'1px solid #ffffff08',
                  gap:6, alignItems:'center',
                }}>
                  <span style={{ fontSize:11, color:'#c8d8f0',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    <span style={{ color:z?.color, marginRight:4, fontSize:10 }}>{it.stt}.</span>
                    {it.name}
                  </span>
                  <span style={{ fontSize:10, fontFamily:'monospace', textAlign:'center',
                    fontWeight:600, color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>
                    {fp(pct)}
                  </span>
                  <span style={{ fontSize:10, color:'#8899bb', textAlign:'center' }}>
                    {fmtDate(g?.plan_start)}
                  </span>
                  <span style={{ fontSize:10, color:'#60a5fa', textAlign:'center' }}>
                    {fmtDate(g?.plan_end)}
                  </span>
                  <span style={{ fontSize:10, color:'#4ade80', textAlign:'center' }}>
                    {fmtDate(g?.actual_end)}
                  </span>
                  <span style={{ textAlign:'center' }}>
                    {sched ? (
                      <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8,
                        background:sched.bg, color:sched.color, whiteSpace:'nowrap' }}>
                        {sched.label}
                      </span>
                    ) : (
                      <span style={{ fontSize:10, color:'#ffffff30' }}>—</span>
                    )}
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
                placeholder={`Nhập ${(label as string).toLowerCase()}...`} rows={3}
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

          {/* Buttons */}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={saveReport} disabled={saving}
              style={{ flex:1, padding:11, background:'#1a2d5a', border:'1px solid #4472C4',
                borderRadius:9, color:'#e8eaf0', fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu báo cáo'}
            </button>
            <button onClick={() => alert('In trang bằng Ctrl+P → Save as PDF')}
              style={{ flex:1, padding:11, background:'#1a3a1a', border:'1px solid #4ade80',
                borderRadius:9, color:'#4ade80', fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              📄 Xuất PDF
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
