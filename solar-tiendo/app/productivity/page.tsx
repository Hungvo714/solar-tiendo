'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Item, Project } from '@/lib/supabase'
import { getItemsWithSteps } from '@/lib/queries'

const TABS = [
  { path:'/dashboard',    icon:'ti-layout-dashboard', label:'Tổng quan'  },
  { path:'/progress',     icon:'ti-checklist',        label:'Tiến độ'    },
  { path:'/gantt',        icon:'ti-calendar-event',   label:'Gantt'      },
  { path:'/report',       icon:'ti-file-description', label:'Báo cáo'    },
  { path:'/labor',        icon:'ti-users',            label:'Nhân lực'   },
  { path:'/productivity', icon:'ti-chart-line',       label:'Hiệu suất'  },
]

type Productivity = {
  id?: string
  item_id: string
  cn_per_day: number
}

export default function ProductivityPage() {
  const [project,      setProject]      = useState<Project | null>(null)
  const [items,        setItems]        = useState<Item[]>([])
  const [prodMap,      setProdMap]      = useState<Record<string, Productivity>>({})
  const [defaultMap,   setDefaultMap]   = useState<Record<string, number>>({})
  const [loading,      setLoading]      = useState(true)
  const [projectId,    setProjectId]    = useState('')
  const [isViewer,     setIsViewer]     = useState(false)
  const [saving,       setSaving]       = useState<string|null>(null)
  const [search,       setSearch]       = useState('')

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project') || ''
    if (!pid) { window.location.href = '/projects'; return }
    setProjectId(pid)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: proj }, it, { data: memberData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', pid).single(),
        getItemsWithSteps(),
        supabase.from('project_members').select('role').eq('project_id', pid).eq('user_id', user?.id ?? '').single(),
      ])
      if (!proj) { window.location.href = '/projects'; return }
      setProject(proj)
      setItems(it as Item[])
      setIsViewer((memberData as any)?.role === 'viewer')

      // Load định mức mặc định (labor_productivity - không có project_id)
      const { data: defaults } = await supabase.from('labor_productivity')
        .select('*').is('project_id', null)
      const dm: Record<string, number> = {}
      for (const d of defaults ?? []) dm[d.item_id] = d.cn_per_day
      setDefaultMap(dm)

      // Load định mức theo dự án (labor_productivity - có project_id)
      const { data: projProd } = await supabase.from('labor_productivity')
        .select('*').eq('project_id', pid)
      const pm: Record<string, Productivity> = {}
      for (const p of projProd ?? []) pm[p.item_id] = p
      setProdMap(pm)

      setLoading(false)
    }
    load()
  }, [])

  function navigate(path: string) {
    window.location.href = `${path}?project=${projectId}`
  }

  async function saveProd(itemId: string, cnPerDay: number) {
    setSaving(itemId)
    const existing = prodMap[itemId]
    if (existing?.id) {
      await supabase.from('labor_productivity')
        .update({ cn_per_day: cnPerDay }).eq('id', existing.id)
    } else {
      await supabase.from('labor_productivity')
        .insert({ item_id: itemId, project_id: projectId, cn_per_day: cnPerDay })
    }
    const { data: projProd } = await supabase.from('labor_productivity')
      .select('*').eq('project_id', projectId)
    const pm: Record<string, Productivity> = {}
    for (const p of projProd ?? []) pm[p.item_id] = p
    setProdMap(pm)
    setSaving(null)
  }

  async function resetToDefault(itemId: string) {
    const existing = prodMap[itemId]
    if (existing?.id) {
      await supabase.from('labor_productivity').delete().eq('id', existing.id)
      const newMap = { ...prodMap }
      delete newMap[itemId]
      setProdMap(newMap)
    }
  }

  async function saveDefault(itemId: string, cnPerDay: number) {
    setSaving(itemId + '_default')
    const existing = Object.entries(defaultMap).find(([id]) => id === itemId)
    const { data: def } = await supabase.from('labor_productivity')
      .select('*').eq('item_id', itemId).is('project_id', null).single()
    if (def) {
      await supabase.from('labor_productivity')
        .update({ cn_per_day: cnPerDay }).eq('id', def.id)
    } else {
      await supabase.from('labor_productivity')
        .insert({ item_id: itemId, cn_per_day: cnPerDay })
    }
    setDefaultMap(prev => ({ ...prev, [itemId]: cnPerDay }))
    setSaving(null)
  }

  const tcItems = items.filter((it: any) =>
    it.group_type !== 'A' &&
    (it.name.toLowerCase().includes(search.toLowerCase()) || search === '')
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0f1e', color:'#8899bb', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:28 }}>⚙️</div><div>Đang tải hiệu suất...</div>
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
              color: tab.path==='/productivity' ? '#F5A623' : '#8899bb',
              fontFamily:'inherit', fontSize:10, cursor:'pointer',
              borderBottom: tab.path==='/productivity' ? '2px solid #F5A623' : '2px solid transparent',
              whiteSpace:'nowrap' }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>

        {/* Info */}
        <div style={{ padding:'10px 14px', borderRadius:8, background:'#1a2d5a33',
          border:'1px solid #4472C430', marginBottom:12, fontSize:11, color:'#8899bb',
          lineHeight:1.6 }}>
          <strong style={{ color:'#60a5fa' }}>Định mức:</strong> 1 CN làm được bao nhiêu đơn vị/ngày cho từng hạng mục.
          Cột <strong style={{ color:'#fbbf24' }}>Mặc định</strong> áp dụng cho tất cả dự án.
          Cột <strong style={{ color:'#4ade80' }}>Dự án này</strong> ghi đè mặc định nếu có.
        </div>

        {/* Search */}
        <div style={{ display:'flex', alignItems:'center', gap:7,
          background:'#0d1b3e', border:'1px solid #ffffff15', borderRadius:7,
          padding:'7px 10px', marginBottom:12 }}>
          <span style={{ color:'#8899bb' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm hạng mục thi công..."
            style={{ background:'none', border:'none', outline:'none',
              color:'#e8eaf0', fontFamily:'inherit', fontSize:12, flex:1 }}/>
        </div>

        {/* Table */}
        <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff10' }}>
          <div style={{ display:'grid',
            gridTemplateColumns:'32px 1fr 80px 100px 120px 120px 70px',
            padding:'8px 10px', background:'#1a2d5a',
            fontSize:9, fontWeight:600, color:'#8899bb', gap:8, alignItems:'center' }}>
            <span>#</span>
            <span>Hạng mục thi công</span>
            <span style={{ textAlign:'center' }}>Khối lượng</span>
            <span style={{ textAlign:'center' }}>Đơn vị</span>
            <span style={{ textAlign:'center' }}>Mặc định (đv/CN/ngày)</span>
            <span style={{ textAlign:'center' }}>Dự án này (đv/CN/ngày)</span>
            <span style={{ textAlign:'center' }}>Đang dùng</span>
          </div>

          {tcItems.map((it: any, idx) => {
            const defaultVal = defaultMap[it.id] ?? 1
            const projVal = prodMap[it.id]?.cn_per_day
            const activeVal = projVal ?? defaultVal
            const isSavingDefault = saving === it.id + '_default'
            const isSavingProj = saving === it.id

            return (
              <div key={it.id} style={{ display:'grid',
                gridTemplateColumns:'32px 1fr 80px 100px 120px 120px 70px',
                padding:'8px 10px', gap:8, alignItems:'center',
                background: idx%2===0 ? '#ffffff05' : 'transparent',
                borderTop:'1px solid #ffffff08' }}>

                <span style={{ fontSize:10, color:'#8899bb', fontWeight:700 }}>{it.stt}</span>

                <div>
                  <div style={{ fontSize:11, color:'#c8d8f0' }}>{it.name}</div>
                </div>

                {/* Khối lượng */}
                <div style={{ textAlign:'center', fontSize:11, color:'#8899bb' }}>
                  {it.volume ?? '—'}
                </div>

                {/* Đơn vị */}
                <div style={{ textAlign:'center', fontSize:11, color:'#8899bb' }}>
                  {it.unit ?? '—'}
                </div>

                {/* Định mức mặc định */}
                <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                  <input type="number" min="0.1" step="0.1"
                    defaultValue={defaultVal}
                    disabled={isViewer}
                    onBlur={async e => {
                      const v = parseFloat(e.target.value) || 1
                      await saveDefault(it.id, v)
                    }}
                    style={{ width:60, background:'#0a0f1e',
                      border:'1px solid #fbbf2440', borderRadius:5,
                      padding:'3px 5px', color:'#fbbf24',
                      fontFamily:'monospace', fontSize:11,
                      outline:'none', textAlign:'center' }}/>
                  {isSavingDefault && <span style={{ fontSize:9, color:'#8899bb' }}>💾</span>}
                </div>

                {/* Định mức dự án */}
                <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                  <input type="number" min="0.1" step="0.1"
                    value={projVal ?? ''}
                    placeholder={String(defaultVal)}
                    disabled={isViewer}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0
                      if (v > 0) {
                        setProdMap(prev => ({
                          ...prev,
                          [it.id]: { ...prev[it.id], item_id: it.id, cn_per_day: v }
                        }))
                      }
                    }}
                    onBlur={async e => {
                      const v = parseFloat(e.target.value)
                      if (v > 0) await saveProd(it.id, v)
                    }}
                    style={{ width:60, background:'#0a0f1e',
                      border:`1px solid ${projVal ? '#4ade8040' : '#ffffff15'}`,
                      borderRadius:5, padding:'3px 5px',
                      color: projVal ? '#4ade80' : '#8899bb',
                      fontFamily:'monospace', fontSize:11,
                      outline:'none', textAlign:'center' }}/>
                  {projVal && !isViewer && (
                    <button onClick={() => resetToDefault(it.id)}
                      style={{ fontSize:9, padding:'1px 4px', borderRadius:4, cursor:'pointer',
                        background:'transparent', border:'1px solid #ffffff15',
                        color:'#8899bb', fontFamily:'inherit' }}>✕</button>
                  )}
                  {isSavingProj && <span style={{ fontSize:9, color:'#8899bb' }}>💾</span>}
                </div>

                {/* Đang dùng */}
                <div style={{ textAlign:'center', fontSize:11, fontWeight:600,
                  color: projVal ? '#4ade80' : '#fbbf24', fontFamily:'monospace' }}>
                  {activeVal}
                  <div style={{ fontSize:8, color:'#8899bb', fontWeight:400 }}>
                    {projVal ? 'dự án' : 'mặc định'}
                  </div>
                </div>
              </div>
            )
          })}

          {tcItems.length === 0 && (
            <div style={{ padding:'20px', textAlign:'center', color:'#8899bb', fontSize:12 }}>
              Không tìm thấy hạng mục
            </div>
          )}
        </div>

        {/* Hướng dẫn */}
        <div style={{ marginTop:16, padding:'10px 14px', borderRadius:8,
          background:'#ffffff05', border:'1px solid #ffffff10',
          fontSize:10, color:'#8899bb', lineHeight:1.8 }}>
          <div style={{ fontWeight:600, color:'#c0d0ef', marginBottom:4 }}>Ví dụ định mức:</div>
          <div>• Lắp Rail: 1 CN lắp được 15m/ngày</div>
          <div>• Lắp tấm pin: 1 CN lắp được 8 tấm/ngày</div>
          <div>• Kéo cáp DC: 1 CN kéo được 50m/ngày</div>
          <div style={{ marginTop:6, color:'#60a5fa' }}>
            Nhấn nút ✕ để xoá định mức riêng và dùng lại mặc định
          </div>
        </div>

      </main>
    </div>
  )
}
