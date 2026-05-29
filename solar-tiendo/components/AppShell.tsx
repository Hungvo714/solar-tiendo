'use client'
import { usePathname, useRouter } from 'next/navigation'
import { fp, elapsedDays, totalPct } from '@/lib/calc'
import { Item, Progress, Project } from '@/lib/supabase'

const TABS = [
  { id: 'dashboard', path: '/dashboard', icon: 'ti-layout-dashboard', label: 'Tổng quan' },
  { id: 'progress',  path: '/progress',  icon: 'ti-checklist',         label: 'Tiến độ'  },
  { id: 'gantt',     path: '/gantt',     icon: 'ti-calendar-event',    label: 'Gantt'    },
  { id: 'report',    path: '/report',    icon: 'ti-file-description',  label: 'Báo cáo'  },
]

interface Props {
  project:     Project | null
  items:       Item[]
  progressMap: Record<string, Progress>
  children:    React.ReactNode
}

export default function AppShell({ project, items, progressMap, children }: Props) {
  const path   = usePathname()
  const router = useRouter()
  const tp     = totalPct(items, progressMap)
  const el     = project ? elapsedDays(project.start_date) : 0
  const total  = project?.total_days ?? 60
  const pct    = Math.round(tp * 100)
  const circ   = 2 * Math.PI * 22
  const dash   = circ * tp

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)' }}>
      {/* HEADER */}
      <header style={{
        background: 'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            background:'#F5A623', color:'#0d1b3e', fontWeight:700,
            fontSize:10, width:36, height:36, borderRadius:8,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}>HTE</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
              {project?.name ?? 'Solar Tiến Độ'}
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>
              {project?.contractor} · {project?.client}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="52" height="52" style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#ffffff18" strokeWidth="5"/>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#F5A623" strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              style={{ transition:'stroke-dasharray .6s' }}/>
            <text x="26" y="26" fill="#e8eaf0"
              fontFamily="JetBrains Mono,monospace" fontSize="11" fontWeight="600"
              textAnchor="middle" dominantBaseline="central"
              style={{ transform:'rotate(90deg)', transformBox:'fill-box' }}>
              {pct}%
            </text>
          </svg>
          <div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>Ngày {el}/{total}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>Còn {total - el} ngày</div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{
        display:'flex', background:'#0d1b3e',
        borderBottom:'1px solid var(--border)',
        overflowX:'auto',
      }}>
        {TABS.map(tab => {
          const active = path.startsWith(tab.path)
          return (
            <button key={tab.id} onClick={() => router.push(tab.path)}
              style={{
                flex:1, display:'flex', flexDirection:'column',
                alignItems:'center', gap:2, padding:'8px 4px',
                border:'none', background:'transparent',
                color: active ? '#F5A623' : 'var(--muted)',
                fontFamily:'inherit', fontSize:10, cursor:'pointer',
                borderBottom: active ? '2px solid #F5A623' : '2px solid transparent',
                transition:'all .2s', minWidth:64,
              }}>
              <i className={`ti ${tab.icon}`} style={{ fontSize:18 }}/>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* CONTENT */}
      <main style={{ flex:1, overflowY:'auto', padding:12 }}>
        {children}
      </main>
    </div>
  )
}
