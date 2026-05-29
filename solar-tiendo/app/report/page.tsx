'use client'
import { useState } from 'react'
import { useAppData } from '@/hooks/useAppData'
import AppShell from '@/components/AppShell'
import { itemPct, zonePct, totalPct, fp, statusOf } from '@/lib/calc'
import { supabase } from '@/lib/supabase'

export default function ReportPage() {
  const { project, zones, items, progressMap, ganttMap, loading } = useAppData()
  const [issues, setIssues]   = useState('')
  const [plan, setPlan]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--muted)' }}><div>Đang tải...</div></div>

  const tp    = totalPct(items, progressMap)
  const today = new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})

  async function saveReport() {
    if (!project) return
    setSaving(true)
    await supabase.from('weekly_reports').insert({
      project_id:  project.id,
      report_date: new Date().toISOString().split('T')[0],
      issues, next_plan: plan,
      total_pct:   Math.round(tp * 100),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function exportPDF() {
    alert('Tính năng xuất PDF đang phát triển. Bạn có thể dùng Ctrl+P → Save as PDF để in trang này.')
  }

  return (
    <AppShell project={project} items={items} progressMap={progressMap}>
      <div style={{ maxWidth:560, margin:'0 auto' }}>
        {/* Header card */}
        <div style={{ background:'#0d1b3e', border:'1px solid var(--border)',
          borderRadius:14, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10,
            paddingBottom:14, borderBottom:'1px solid var(--border)', marginBottom:14 }}>
            <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700,
              fontSize:11, width:40, height:40, borderRadius:9,
              display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>Báo cáo tiến độ thi công tuần</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                {project?.name} · {today}
              </div>
            </div>
          </div>

          {/* KPI */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
            <div style={{ background:'var(--bg3)', borderRadius:9, padding:'10px 12px',
              display:'flex', flexDirection:'column', gap:2, flex:1, minWidth:100 }}>
              <span style={{ fontSize:9, color:'var(--muted)' }}>Tổng tiến độ</span>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:18,
                fontWeight:700, color:'#F5A623' }}>{fp(tp)}</span>
            </div>
            {zones.map(z => (
              <div key={z.id} style={{
                background:'var(--bg)', borderRadius:7, padding:'7px 9px',
                display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:80,
                borderLeft:`3px solid ${z.color}` }}>
                <span style={{ fontSize:10, color:z.color, display:'flex', alignItems:'center', gap:3 }}>
                  <i className={`ti ${z.icon}`} style={{ fontSize:12 }}/> {z.label}
                </span>
                <strong style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, color:'var(--text)' }}>
                  {fp(zonePct(z.id, items, progressMap))}
                </strong>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ borderRadius:7, overflow:'hidden', border:'1px solid var(--border)', marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 60px 80px',
              padding:'7px 10px', background:'var(--bg3)',
              fontSize:10, fontWeight:600, color:'var(--muted)', gap:6 }}>
              <span>Hạng mục</span><span>Khu vực</span><span>%</span><span>Trạng thái</span>
            </div>
            {items.map(it => {
              const pct = itemPct(it, progressMap)
              const z   = zones.find(zn => zn.id === it.zone_id)
              const st  = statusOf(pct)
              return (
                <div key={it.id} style={{
                  display:'grid', gridTemplateColumns:'1fr 70px 60px 80px',
                  padding:'7px 10px', borderTop:'1px solid var(--border)',
                  fontSize:11, gap:6, alignItems:'center'
                }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:3, color:z?.color, fontSize:10 }}>
                    {z && <i className={`ti ${z.icon}`} style={{ fontSize:12 }}/>}
                    {z?.label}
                  </span>
                  <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10 }}>{fp(pct)}</span>
                  <span className={`st-${st.c}`} style={{ fontSize:10 }}>{st.l}</span>
                </div>
              )
            })}
          </div>

          {/* Notes */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:6 }}>
              Vấn đề phát sinh tuần này
            </div>
            <textarea value={issues} onChange={e => setIssues(e.target.value)}
              placeholder="Nhập vấn đề phát sinh, biện pháp xử lý..." rows={3}
              style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:7, padding:9, color:'var(--text)', fontFamily:'inherit',
                fontSize:11, resize:'vertical', outline:'none' }}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#c0d0ef', marginBottom:6 }}>
              Kế hoạch tuần tới
            </div>
            <textarea value={plan} onChange={e => setPlan(e.target.value)}
              placeholder="Nhập kế hoạch & yêu cầu hỗ trợ..." rows={3}
              style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:7, padding:9, color:'var(--text)', fontFamily:'inherit',
                fontSize:11, resize:'vertical', outline:'none' }}/>
          </div>

          {/* Sign */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            {['Người lập báo cáo','Giám sát trưởng','Chủ đầu tư xác nhận'].map(r => (
              <div key={r} style={{ flex:1, minWidth:140, border:'1px dashed var(--border)',
                borderRadius:7, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:18 }}>{r}</div>
                <div style={{ borderTop:'1px solid var(--border)', marginBottom:5 }}/>
                <div style={{ fontSize:9, color:'#ffffff25' }}>Ký tên & đóng dấu</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={saveReport} disabled={saving}
              style={{ flex:1, padding:11, background:'var(--bg3)',
                border:'1px solid #4472C4', borderRadius:9, color:'var(--text)',
                fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu báo cáo'}
            </button>
            <button onClick={exportPDF}
              style={{ flex:1, padding:11, background:'#1a3a1a',
                border:'1px solid #4ade80', borderRadius:9, color:'#4ade80',
                fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              📄 Xuất PDF
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
