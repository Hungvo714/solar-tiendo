'use client'
import { usePathname } from 'next/navigation'
import { totalPct } from '@/lib/calc'
import { Item, Progress, Project } from '@/lib/supabase'

const TABS = [
  { path: '/dashboard', icon: 'ti-layout-dashboard', label: 'Tổng quan' },
  { path: '/progress',  icon: 'ti-checklist',         label: 'Tiến độ'  },
  { path: '/gantt',     icon: 'ti-calendar-event',    label: 'Gantt'    },
  { path: '/report',    icon: 'ti-file-description',  label: 'Báo cáo'  },
]

interface Props {
  project:     Project | null
  items:       Item[]
  progressMap: Record<string, Progress>
  children:    React.ReactNode
}

export default function AppShell({ project, items, progressMap, children }: Props) {
  const path = usePathname()
  const tp   = totalPct(items, progressMap)
  const pct  = Math.round(tp * 100)
  const circ = 2 * Math.PI * 22
  const dash = circ * tp

  function navigate(tabPath: string) {
    // Đọc trực tiếp từ window.location — không dùng state
    const pid = new URLSearchParams(window.location.search).get('project')
    const url = pid ? `${tabPath}?project=${pid}` : tabPath
    window.location.href = url
  }

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
            onClick={() => { window.location.href = '/projects' }}>HTE</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.name ?? 'Solar Tiến Độ'}
            </div>
            <div style={{ fontSize:10, color:'#8899bb', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <svg width="52" height="52" style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#ffffff18" strokeWidth="5"/>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#F5A623" strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              style={{ transition:'stroke-dasharray .6s' }}/>
            <text x="26" y="26" fill="#e8eaf0" fontFamily="monospace"
              fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="central"
              style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
              {pct}%
            </text>
          </svg>
          <div>
            <div style={{ fontSize:10, color:'#8899bb' }}>{project?.total_days ?? 60} ngày</div>
          </div>
        </div>
      </header>

      <nav style={{ display:'flex', background:'#0d1b3e',
        borderBottom:'1px solid #ffffff10', overflowX:'auto' }}>
        {TABS.map(tab => {
          const active = path.startsWith(tab.path)
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              style={{ flex:1, display:'flex', flexDirection:'column',
                alignItems:'center', gap:2, padding:'8px 4px',
                border:'none', background:'transparent',
                color: active ? '#F5A623' : '#8899bb',
                fontFamily:'inherit', fontSize:10, cursor:'pointer',
                borderBottom: active ? '2px solid #F5A623' : '2px solid transparent',
                transition:'all .2s', minWidth:60, whiteSpace:'nowrap' }}>
              <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        {children}
      </main>
    </div>
  )
}
