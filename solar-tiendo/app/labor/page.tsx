'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { itemPct, getProjectDates } from '@/lib/calc'
import type { Item, Progress, Zone, GanttDate, Project } from '@/lib/supabase'
import { getItemsWithSteps, getZones, getProgress, getGanttDates } from '@/lib/queries'

const TABS = [
  { path:'/dashboard',    icon:'ti-layout-dashboard', label:'Tổng quan'  },
  { path:'/progress',     icon:'ti-checklist',        label:'Tiến độ'    },
  { path:'/gantt',        icon:'ti-calendar-event',   label:'Gantt'      },
  { path:'/report',       icon:'ti-file-description', label:'Báo cáo'    },
  { path:'/labor',        icon:'ti-users',            label:'Nhân lực'   },
  { path:'/productivity', icon:'ti-chart-line',       label:'Hiệu suất'  },
]

type LaborDay = {
  id?: string
  date: string
  cn_plan: number
  cn_actual: number | null
  td_plan: number
  td_actual: number | null
  cht: number
  hse: number
  cnp_plan: number
  cnp_actual: number | null
}

type Allocation = {
  item_id: string
  date: string
  cn_plan: number
  cn_actual: number | null
}

export default function LaborPage() {
  const [project,      setProject]      = useState<Project | null>(null)
  const [items,        setItems]        = useState<Item[]>([])
  const [progressMap,  setProgressMap]  = useState<Record<string, Progress>>({})
  const [ganttMap,     setGanttMap]     = useState<Record<string, GanttDate>>({})
  const [laborDays,    setLaborDays]    = useState<LaborDay[]>([])
  const [allocations,  setAllocations]  = useState<Allocation[]>([])
  const [productivity, setProductivity] = useState<Record<string, number>>({})
  const [loading,      setLoading]      = useState(true)
  const [projectId,    setProjectId]    = useState('')
  const [isViewer,     setIsViewer]     = useState(false)
  const [activeTab,    setActiveTab]    = useState<'input'|'chart'|'alloc'>('input')
  const [editDate,     setEditDate]     = useState<string|null>(null)

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: proj }, it, pr, gd, { data: memberData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getItemsWithSteps(), getProgress(pid), getGanttDates(pid),
        supabase.from('project_members').select('role').eq('project_id', pid).eq('user_id', user?.id ?? '').single(),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      setProject(proj)
      setItems(it as Item[])
      const pm: Record<string, Progress> = {}
      for (const p of pr) pm[(p as Progress).step_id] = p as Progress
      setProgressMap(pm)
      const gm: Record<string, GanttDate> = {}
      for (const g of gd) gm[(g as GanttDate).item_id] = g as GanttDate
      setGanttMap(gm)
      setIsViewer((memberData as any)?.role === 'viewer')

      // Load labor days
      const { data: ld } = await supabase.from('project_labor_days')
        .select('*').eq('project_id', pid).order('date')
      setLaborDays((ld ?? []) as LaborDay[])

      // Load allocations
      const { data: al } = await supabase.from('labor_allocation')
        .select('*').eq('project_id', pid).order('date')
      setAllocations((al ?? []) as Allocation[])

      // Load productivity
      const { data: prod } = await supabase.from('labor_productivity').select('*')
      const prodMap: Record<string, number> = {}
      for (const p of prod ?? []) prodMap[p.item_id] = p.cn_per_day
      setProductivity(prodMap)

      setLoading(false)
    }
    load()
  }, [])

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  const { startDate, endDate, totalDays } = getProjectDates(items as any[], ganttMap)
  const today = new Date().toISOString().split('T')[0]

  // Tạo danh sách ngày từ BD đến HT dự án
  function getDateRange(): string[] {
    if (!startDate) return []
    const dates: string[] = []
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 90 * 86400000)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0])
    }
    return dates
  }

  const dateRange = getDateRange()

  // Lấy labor day cho 1 ngày
  function getLaborDay(date: string): LaborDay {
    return laborDays.find(l => l.date === date) ?? {
      date, cn_plan: 0, cn_actual: null,
      td_plan: 0, td_actual: null,
      cht: 1, hse: 1, cnp_plan: 0, cnp_actual: null
    }
  }

  // Tổng CN (plan hoặc actual) cho 1 ngày
  function totalCN(date: string, type: 'plan'|'actual'): number {
    const ld = getLaborDay(date)
    if (type === 'actual') {
      return (ld.cn_actual ?? ld.cn_plan) + (ld.td_actual ?? ld.td_plan)
    }
    return ld.cn_plan + ld.td_plan
  }

  // Hạng mục đang thi công trong ngày
  function getActiveItems(date: string): any[] {
    return items.filter((it: any) => {
      if (it.group_type === 'A') return false
      if (itemPct(it, progressMap) >= 1) return false
      const g = ganttMap[it.id] as any
      const start = g?.actual_start || g?.plan_start
      const end   = g?.actual_end   || g?.plan_end
      if (!start) return false
      return date >= start && (!end || date <= end)
    })
  }

  // Tự động phân bổ CN theo khối lượng còn lại
  function autoAllocate(date: string, cnTotal: number): Record<string, number> {
    const activeItems = getActiveItems(date)
    if (activeItems.length === 0) return {}

    // Tính khối lượng còn lại của từng hạng mục
    const remaining: Record<string, number> = {}
    let totalRemaining = 0
    for (const it of activeItems) {
      const pct = itemPct(it, progressMap)
      const vol = (it as any).volume ?? 1
      const rem = vol * (1 - pct)
      remaining[it.id] = rem
      totalRemaining += rem
    }

    // Phân bổ theo tỷ lệ
    const alloc: Record<string, number> = {}
    if (totalRemaining === 0) {
      const each = Math.floor(cnTotal / activeItems.length)
      for (const it of activeItems) alloc[it.id] = each
    } else {
      for (const it of activeItems) {
        alloc[it.id] = Math.round((remaining[it.id] / totalRemaining) * cnTotal)
      }
    }
    return alloc
  }

  async function saveLaborDay(date: string, data: Partial<LaborDay>) {
    const existing = laborDays.find(l => l.date === date)
    const payload = { ...getLaborDay(date), ...data, project_id: projectId }
    if (existing?.id) {
      await supabase.from('project_labor_days').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('project_labor_days').insert(payload)
    }
    const { data: ld } = await supabase.from('project_labor_days')
      .select('*').eq('project_id', projectId).order('date')
    setLaborDays((ld ?? []) as LaborDay[])
  }

  async function autoAllocateAndSave(date: string) {
    const ld = getLaborDay(date)
    const cnTotal = totalCN(date, 'plan')
    const alloc = autoAllocate(date, cnTotal)

    for (const [itemId, cn] of Object.entries(alloc)) {
      await supabase.from('labor_allocation').upsert({
        project_id: projectId, item_id: itemId, date,
        cn_plan: cn
      }, { onConflict: 'project_id,item_id,date' })
    }
    const { data: al } = await supabase.from('labor_allocation')
      .select('*').eq('project_id', projectId).order('date')
    setAllocations((al ?? []) as Allocation[])
  }

  // Tính ngày hoàn thành dự kiến theo nhân lực
  function calcCompletionDate(item: any): string | null {
    const pct = itemPct(item, progressMap)
    if (pct >= 1) return null
    const vol = (item as any).volume ?? 0
    if (!vol) return null
    const prod = productivity[item.id] ?? 1
    const remaining = vol * (1 - pct)

    // Lấy CN trung bình từ hôm nay trở đi
    const futureDays = dateRange.filter(d => d >= today)
    if (futureDays.length === 0) return null
    const avgCN = futureDays.reduce((s, d) => {
      const alloc = allocations.find(a => a.item_id === item.id && a.date === d)
      return s + (alloc?.cn_plan ?? 0)
    }, 0) / futureDays.length

    if (avgCN === 0) return null
    const daysNeeded = Math.ceil(remaining / (avgCN * prod))
    const d = new Date()
    d.setDate(d.getDate() + daysNeeded)
    return d.toISOString().split('T')[0]
  }

  const fmtD = (d: string) => new Date(d).toLocaleDateString('vi-VN', {
    weekday:'short', day:'2-digit', month:'2-digit'
  })
  const fmtShort = (d: string) => new Date(d).toLocaleDateString('vi-VN', {
    day:'2-digit', month:'2-digit'
  })
  const isPast = (d: string) => d < today

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>👷</div><div>Đang tải nhân lực...</div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh',
      background:'#0a0f1e', color:'#e8eaf0', fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* HEADER */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'12px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <div style={{ background:'#8B008B', color:'#fff', fontWeight:700,
            fontSize:10, width:36, height:36, borderRadius:8, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
            onClick={() => window.location.href='/projects'}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name}
            </div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.contractor}</div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', background:'#0d1b3e', borderBottom:'1px solid #ffffff10',
        overflowX:'auto' }}>
        {TABS.map(tab => (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{ flex:'0 0 auto', display:'flex', flexDirection:'column', alignItems:'center',
              gap:2, padding:'8px 12px', border:'none', background:'transparent',
              color: tab.path==='/labor' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/labor' ? '2px solid #F5A623' : '2px solid transparent',
              whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* SUB NAV */}
      <div style={{ display:'flex', gap:6, padding:'10px 12px',
        background:'#0d1b3e', borderBottom:'1px solid #ffffff08' }}>
        {[
          { key:'input', label:'📋 Nhập liệu' },
          { key:'chart', label:'📊 Biểu đồ' },
          { key:'alloc', label:'🔧 Phân bổ' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            style={{ padding:'5px 12px', borderRadius:8, cursor:'pointer',
              fontFamily:'inherit', fontSize:11,
              border: `1px solid ${activeTab===t.key ? '#F5A623' : '#ffffff20'}`,
              background: activeTab===t.key ? '#F5A62322' : 'transparent',
              color: activeTab===t.key ? '#F5A623' : '#8899bb',
              fontWeight: activeTab===t.key ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>

        {/* === TAB NHẬP LIỆU === */}
        {activeTab === 'input' && (
          <div>
            <div style={{ fontSize:11, color:'#8899bb', marginBottom:10 }}>
              Nhập số lượng nhân lực theo từng ngày · KH = Kế hoạch · TT = Thực tế
            </div>

            {/* Bảng nhân lực */}
            <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff10' }}>
              {/* Header */}
              <div style={{ display:'grid',
                gridTemplateColumns:'90px 60px 60px 60px 60px 50px 50px 60px 60px 50px',
                padding:'8px 10px', background:'#1a2d5a',
                fontSize:9, fontWeight:600, color:'#8899bb', gap:4, alignItems:'center' }}>
                <span>Ngày</span>
                <span style={{ textAlign:'center' }}>CN KH</span>
                <span style={{ textAlign:'center' }}>CN TT</span>
                <span style={{ textAlign:'center' }}>TĐ KH</span>
                <span style={{ textAlign:'center' }}>TĐ TT</span>
                <span style={{ textAlign:'center' }}>CHT</span>
                <span style={{ textAlign:'center' }}>HSE</span>
                <span style={{ textAlign:'center' }}>CNP KH</span>
                <span style={{ textAlign:'center' }}>CNP TT</span>
                <span style={{ textAlign:'center' }}>Tổng</span>
              </div>

              {dateRange.length === 0 ? (
                <div style={{ padding:'20px', textAlign:'center', color:'#8899bb', fontSize:12 }}>
                  💡 Nhập ngày kế hoạch tại tab Tiến độ để hiển thị lịch nhân lực
                </div>
              ) : dateRange.map((date, idx) => {
                const ld = getLaborDay(date)
                const isToday = date === today
                const past = isPast(date)
                const total = (ld.cn_actual ?? ld.cn_plan) + (ld.td_actual ?? ld.td_plan) + ld.cht + ld.hse + (ld.cnp_actual ?? ld.cnp_plan)

                return (
                  <div key={date} style={{ display:'grid',
                    gridTemplateColumns:'90px 60px 60px 60px 60px 50px 50px 60px 60px 50px',
                    padding:'6px 10px', gap:4, alignItems:'center',
                    background: isToday ? '#F5A62310' : idx%2===0 ? '#ffffff05' : 'transparent',
                    borderTop:'1px solid #ffffff08',
                    borderLeft: isToday ? '3px solid #F5A623' : '3px solid transparent' }}>

                    {/* Ngày */}
                    <div>
                      <div style={{ fontSize:10, color: isToday ? '#F5A623' : past ? '#8899bb' : '#c8d8f0',
                        fontWeight: isToday ? 700 : 400 }}>
                        {fmtShort(date)}
                      </div>
                      <div style={{ fontSize:8, color:'#8899bb' }}>
                        {new Date(date).toLocaleDateString('vi-VN',{weekday:'short'})}
                      </div>
                    </div>

                    {/* CN KH */}
                    <input type="number" min="0"
                      value={ld.cn_plan}
                      disabled={isViewer}
                      onChange={async e => {
                        const v = parseInt(e.target.value)||0
                        await saveLaborDay(date, { cn_plan: v })
                      }}
                      style={{ width:'100%', background: isViewer?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#60a5fa', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* CN TT */}
                    <input type="number" min="0"
                      value={ld.cn_actual ?? ''}
                      placeholder="—"
                      disabled={isViewer || !past}
                      onChange={async e => {
                        const v = e.target.value ? parseInt(e.target.value) : null
                        await saveLaborDay(date, { cn_actual: v })
                      }}
                      style={{ width:'100%', background: (!past||isViewer)?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#4ade80', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* TĐ KH */}
                    <input type="number" min="0"
                      value={ld.td_plan}
                      disabled={isViewer}
                      onChange={async e => {
                        const v = parseInt(e.target.value)||0
                        await saveLaborDay(date, { td_plan: v })
                      }}
                      style={{ width:'100%', background: isViewer?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#60a5fa', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* TĐ TT */}
                    <input type="number" min="0"
                      value={ld.td_actual ?? ''}
                      placeholder="—"
                      disabled={isViewer || !past}
                      onChange={async e => {
                        const v = e.target.value ? parseInt(e.target.value) : null
                        await saveLaborDay(date, { td_actual: v })
                      }}
                      style={{ width:'100%', background: (!past||isViewer)?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#4ade80', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* CHT */}
                    <div style={{ textAlign:'center', fontSize:11, color:'#fbbf24' }}>
                      {ld.cht}
                    </div>

                    {/* HSE */}
                    <div style={{ textAlign:'center', fontSize:11, color:'#fbbf24' }}>
                      {ld.hse}
                    </div>

                    {/* CNP KH */}
                    <input type="number" min="0"
                      value={ld.cnp_plan}
                      disabled={isViewer}
                      onChange={async e => {
                        const v = parseInt(e.target.value)||0
                        await saveLaborDay(date, { cnp_plan: v })
                      }}
                      style={{ width:'100%', background: isViewer?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#60a5fa', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* CNP TT */}
                    <input type="number" min="0"
                      value={ld.cnp_actual ?? ''}
                      placeholder="—"
                      disabled={isViewer || !past}
                      onChange={async e => {
                        const v = e.target.value ? parseInt(e.target.value) : null
                        await saveLaborDay(date, { cnp_actual: v })
                      }}
                      style={{ width:'100%', background: (!past||isViewer)?'transparent':'#0a0f1e',
                        border:'1px solid #ffffff15', borderRadius:5, padding:'2px 4px',
                        color:'#4ade80', fontFamily:'monospace', fontSize:11,
                        outline:'none', textAlign:'center' }}/>

                    {/* Tổng */}
                    <div style={{ textAlign:'center', fontSize:11, fontWeight:600,
                      color: total > 0 ? '#e8eaf0' : '#8899bb' }}>
                      {total || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* === TAB BIỂU ĐỒ === */}
        {activeTab === 'chart' && (
          <div>
            <div style={{ fontSize:11, color:'#8899bb', marginBottom:12 }}>
              Biểu đồ nhân lực theo ngày — Xanh: KH · Xanh lá: TT
            </div>

            {/* Summary KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:16 }}>
              {[
                { label:'CN KH trung bình/ngày', value: dateRange.length > 0
                  ? Math.round(dateRange.reduce((s,d) => s + getLaborDay(d).cn_plan, 0) / dateRange.length)
                  : 0, color:'#60a5fa' },
                { label:'CN TT trung bình/ngày', value: dateRange.filter(d => isPast(d)).length > 0
                  ? Math.round(dateRange.filter(d => isPast(d)).reduce((s,d) => s + (getLaborDay(d).cn_actual ?? getLaborDay(d).cn_plan), 0) / dateRange.filter(d => isPast(d)).length)
                  : 0, color:'#4ade80' },
                { label:'Tổng công KH', value: dateRange.reduce((s,d) => s + getLaborDay(d).cn_plan, 0), color:'#60a5fa' },
                { label:'Tổng công TT', value: dateRange.filter(d => isPast(d)).reduce((s,d) => s + (getLaborDay(d).cn_actual ?? 0), 0), color:'#4ade80' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background:'#0d1b3e', borderRadius:8,
                  padding:'10px 12px', border:'1px solid #ffffff10' }}>
                  <div style={{ fontSize:9, color:'#8899bb', marginBottom:4 }}>{kpi.label}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:kpi.color, fontFamily:'monospace' }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Bar chart đơn giản */}
            <div style={{ background:'#0d1b3e', borderRadius:10, padding:12,
              border:'1px solid #ffffff10', overflowX:'auto' }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3,
                height:120, minWidth: Math.max(dateRange.length * 24, 300) }}>
                {dateRange.map(date => {
                  const ld = getLaborDay(date)
                  const maxCN = Math.max(...dateRange.map(d => getLaborDay(d).cn_plan + getLaborDay(d).td_plan), 1)
                  const planH = ((ld.cn_plan + ld.td_plan) / maxCN) * 100
                  const actualH = ld.cn_actual !== null ? ((ld.cn_actual + (ld.td_actual??0)) / maxCN) * 100 : null
                  const isToday = date === today

                  return (
                    <div key={date} style={{ display:'flex', flexDirection:'column',
                      alignItems:'center', gap:2, flex:1, minWidth:20 }}>
                      <div style={{ display:'flex', alignItems:'flex-end', gap:1, height:100 }}>
                        <div style={{ width:8, height:`${planH}%`, minHeight:2,
                          background: isToday ? '#F5A623' : '#60a5fa',
                          borderRadius:'2px 2px 0 0', opacity:0.8 }}/>
                        {actualH !== null && (
                          <div style={{ width:8, height:`${actualH}%`, minHeight:2,
                            background:'#4ade80', borderRadius:'2px 2px 0 0', opacity:0.9 }}/>
                        )}
                      </div>
                      {isToday && (
                        <div style={{ width:2, height:4, background:'#F5A623', borderRadius:1 }}/>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ display:'flex', gap:12, marginTop:8, fontSize:9, color:'#8899bb' }}>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:10, height:6, background:'#60a5fa', borderRadius:1, display:'inline-block' }}/>
                  Kế hoạch
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:10, height:6, background:'#4ade80', borderRadius:1, display:'inline-block' }}/>
                  Thực tế
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:10, height:6, background:'#F5A623', borderRadius:1, display:'inline-block' }}/>
                  Hôm nay
                </span>
              </div>
            </div>

            {/* Dự báo hoàn thành theo nhân lực */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#c0d0ef', marginBottom:8 }}>
                📅 Dự báo hoàn thành theo nhân lực
              </div>
              <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff10' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px',
                  padding:'7px 10px', background:'#1a2d5a',
                  fontSize:9, fontWeight:600, color:'#8899bb', gap:4 }}>
                  <span>Hạng mục</span>
                  <span style={{ textAlign:'center' }}>Khối lượng</span>
                  <span style={{ textAlign:'center' }}>Còn lại</span>
                  <span style={{ textAlign:'center' }}>CN/ngày</span>
                  <span style={{ textAlign:'center' }}>Dự báo HT</span>
                </div>
                {items.filter((it: any) => it.group_type !== 'A' && (it as any).volume > 0 && itemPct(it, progressMap) < 1).map((it: any, idx) => {
                  const pct = itemPct(it, progressMap)
                  const vol = it.volume ?? 0
                  const remaining = vol * (1 - pct)
                  const avgCN = dateRange.filter(d => d >= today).reduce((s, d) => {
                    const alloc = allocations.find(a => a.item_id === it.id && a.date === d)
                    return s + (alloc?.cn_plan ?? 0)
                  }, 0) / Math.max(dateRange.filter(d => d >= today).length, 1)
                  const completion = calcCompletionDate(it)
                  const g = ganttMap[it.id] as any
                  const planEnd = g?.plan_end
                  const isLate = completion && planEnd && completion > planEnd

                  return (
                    <div key={it.id} style={{ display:'grid',
                      gridTemplateColumns:'1fr 80px 80px 80px 100px',
                      padding:'6px 10px', gap:4, alignItems:'center',
                      background: idx%2===0 ? '#ffffff05' : 'transparent',
                      borderTop:'1px solid #ffffff08' }}>
                      <span style={{ fontSize:10, color:'#c8d8f0' }}>
                        <span style={{ color:'#8899bb', fontSize:9 }}>{it.stt}.</span> {it.name}
                      </span>
                      <span style={{ textAlign:'center', fontSize:10, color:'#8899bb' }}>
                        {vol} {it.unit ?? ''}
                      </span>
                      <span style={{ textAlign:'center', fontSize:10, color:'#fbbf24' }}>
                        {remaining.toFixed(1)} {it.unit ?? ''}
                      </span>
                      <span style={{ textAlign:'center', fontSize:10, color:'#60a5fa' }}>
                        {avgCN.toFixed(1)}
                      </span>
                      <span style={{ textAlign:'center', fontSize:10,
                        color: isLate ? '#ff8888' : '#4ade80', fontWeight: isLate ? 700 : 400 }}>
                        {completion ? new Date(completion).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : '—'}
                        {isLate && ' ⚠️'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* === TAB PHÂN BỔ === */}
        {activeTab === 'alloc' && (
          <div>
            <div style={{ fontSize:11, color:'#8899bb', marginBottom:10 }}>
              Phân bổ CN cho từng hạng mục theo ngày · Nhấn "Phân bổ tự động" hoặc sửa thủ công
            </div>

            {dateRange.filter(d => d >= today).slice(0, 14).map((date, dateIdx) => {
              const cnTotal = totalCN(date, 'plan')
              const activeItems = getActiveItems(date)
              if (activeItems.length === 0) return null

              const dayAllocs = allocations.filter(a => a.date === date)
              const allocTotal = dayAllocs.reduce((s, a) => s + a.cn_plan, 0)
              const remaining = cnTotal - allocTotal

              return (
                <div key={date} style={{ marginBottom:12, borderRadius:10,
                  border:'1px solid #ffffff10', overflow:'hidden' }}>
                  {/* Day header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'8px 12px', background:'#1a2d5a' }}>
                    <div>
                      <span style={{ fontSize:11, fontWeight:600, color:'#c0d0ef' }}>{fmtD(date)}</span>
                      <span style={{ fontSize:10, color:'#8899bb', marginLeft:8 }}>
                        Tổng CN: {cnTotal} · Đã phân bổ: {allocTotal}
                        {remaining !== 0 && (
                          <span style={{ color: remaining > 0 ? '#fbbf24' : '#ff8888', marginLeft:4 }}>
                            ({remaining > 0 ? '+' : ''}{remaining} còn lại)
                          </span>
                        )}
                      </span>
                    </div>
                    {!isViewer && (
                      <button onClick={() => autoAllocateAndSave(date)}
                        style={{ fontSize:9, padding:'3px 10px', borderRadius:6, cursor:'pointer',
                          background:'#1a3a8a', border:'1px solid #4472C4',
                          color:'#60a5fa', fontFamily:'inherit' }}>
                        ⚡ Tự động
                      </button>
                    )}
                  </div>

                  {/* Items */}
                  {activeItems.map((it: any) => {
                    const alloc = dayAllocs.find(a => a.item_id === it.id)
                    const cn = alloc?.cn_plan ?? 0
                    const pct = itemPct(it, progressMap)
                    const prod = productivity[it.id] ?? 1
                    const vol = it.volume ?? 0
                    const output = cn * prod
                    const daysLeft = vol > 0 && cn > 0
                      ? Math.ceil(vol * (1 - pct) / (cn * prod))
                      : null

                    return (
                      <div key={it.id} style={{ display:'grid',
                        gridTemplateColumns:'1fr 80px 80px 80px',
                        padding:'6px 12px', gap:8, alignItems:'center',
                        borderTop:'1px solid #ffffff08',
                        background: cn === 0 ? '#ff000008' : '#ffffff03' }}>
                        <div>
                          <div style={{ fontSize:10, color:'#c8d8f0' }}>
                            <span style={{ color:'#8899bb', fontSize:9 }}>{it.stt}.</span> {it.name}
                          </div>
                          {vol > 0 && (
                            <div style={{ fontSize:9, color:'#8899bb', marginTop:1 }}>
                              {(vol * (1-pct)).toFixed(1)}/{vol} {it.unit} còn lại
                              {daysLeft && ` · ~${daysLeft} ngày`}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:9, color:'#8899bb', marginBottom:2 }}>CN phân bổ</div>
                          <input type="number" min="0"
                            value={cn}
                            disabled={isViewer}
                            onChange={async e => {
                              const newCN = parseInt(e.target.value)||0
                              await supabase.from('labor_allocation').upsert({
                                project_id: projectId, item_id: it.id, date,
                                cn_plan: newCN
                              }, { onConflict: 'project_id,item_id,date' })
                              const { data: al } = await supabase.from('labor_allocation')
                                .select('*').eq('project_id', projectId).order('date')
                              setAllocations((al ?? []) as Allocation[])
                            }}
                            style={{ width:50, background:'#0a0f1e',
                              border:'1px solid #4472C4', borderRadius:5, padding:'2px 4px',
                              color:'#60a5fa', fontFamily:'monospace', fontSize:12,
                              outline:'none', textAlign:'center' }}/>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:9, color:'#8899bb', marginBottom:2 }}>Năng suất</div>
                          <div style={{ fontSize:11, color:'#fbbf24', fontFamily:'monospace' }}>
                            {output.toFixed(1)} {it.unit ?? 'đv'}/ngày
                          </div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:9, color:'#8899bb', marginBottom:2 }}>Tiến độ</div>
                          <div style={{ fontSize:11, color: pct>=1?'#4ade80':pct>0?'#fbbf24':'#8899bb' }}>
                            {Math.round(pct*100)}%
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {dateRange.filter(d => d >= today).length === 0 && (
              <div style={{ textAlign:'center', color:'#8899bb', padding:40, fontSize:12 }}>
                💡 Chưa có ngày thi công nào trong tương lai
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
