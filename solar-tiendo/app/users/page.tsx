'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Membership = { project_id: string; project_name: string; role: string }
type U = {
  user_id: string; email: string; full_name: string|null; phone: string|null; company: string|null
  status: 'pending'|'approved'|'rejected'; is_super_admin: boolean
  created_at: string; last_sign_in_at: string|null; memberships: Membership[]
}
type P = { id: string; name: string }

const C = { bg:'#0a0f1e', card:'#0d1b3e', line:'#ffffff12', text:'#e8eaf0', mute:'#8899bb', acc:'#F5A623' }
const inp: React.CSSProperties = {
  width:'100%', background:C.bg, border:'1px solid #ffffff20', borderRadius:7,
  padding:'8px 10px', color:C.text, fontFamily:'inherit', fontSize:12, outline:'none', boxSizing:'border-box',
}
const btn = (bg: string, c: string, bd?: string): React.CSSProperties => ({
  padding:'7px 12px', background:bg, color:c, border: bd ? `1px solid ${bd}` : 'none',
  borderRadius:7, fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit',
})
const ROLE: Record<string, { l: string; c: string }> = {
  admin:  { l:'👑 Admin',  c:'#F5A623' },
  editor: { l:'✏️ Editor', c:'#60a5fa' },
  viewer: { l:'👁 Viewer', c:'#8899bb' },
}
const STATUS: Record<string, { l: string; c: string }> = {
  pending:  { l:'Chờ duyệt', c:'#F5A623' },
  approved: { l:'Hoạt động', c:'#4ade80' },
  rejected: { l:'Từ chối',   c:'#FF8888' },
}
const fmt = (d: string|null) => d ? new Date(d).toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' }) : 'Chưa đăng nhập'

async function api(payload: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/users', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json
}
function genPass() {
  const w = ['Solar','Nang','Luong','Cong','Trinh','Dien','Mai','Dat','An','Toan']
  return `${w[Math.floor(Math.random()*w.length)]}${Math.floor(Math.random()*9000)+1000}!`
}

export default function UsersPage() {
  const [ready, setReady]       = useState(false)
  const [me, setMe]             = useState('')
  const [users, setUsers]       = useState<U[]>([])
  const [projects, setProjects] = useState<P[]>([])
  const [q, setQ]               = useState('')
  const [filter, setFilter]     = useState<'all'|'pending'|'approved'|'rejected'>('all')
  const [open, setOpen]         = useState<string|null>(null)
  const [busy, setBusy]         = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [created, setCreated]   = useState<{email:string; pass:string}|null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setMe(user.id)
    const { data: sup } = await supabase.rpc('is_super_admin')
    if (!sup) { window.location.href = '/projects'; return }
    await reload()
    setReady(true)
  }

  async function reload() {
    const [u, p] = await Promise.all([supabase.rpc('list_all_users'), supabase.rpc('list_all_projects')])
    if (u.error) { alert('Lỗi tải danh sách: ' + u.error.message); return }
    setUsers((u.data ?? []) as U[])
    setProjects((p.data ?? []) as P[])
  }

  async function run(fn: () => Promise<any>, okMsg?: string) {
    setBusy(true)
    try { await fn(); await reload(); if (okMsg) alert(okMsg) }
    catch (e: any) { alert('Lỗi: ' + (e?.message ?? e)) }
    finally { setBusy(false) }
  }
  const rpc = async (name: string, args: any) => { const { error } = await supabase.rpc(name, args); if (error) throw error }

  const counts = useMemo(() => ({
    all: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  }), [users])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return users.filter(u =>
      (filter === 'all' || u.status === filter) &&
      (!k || [u.email, u.full_name, u.phone, u.company, ...u.memberships.map(m => m.project_name)]
        .some(v => (v ?? '').toLowerCase().includes(k))))
  }, [users, q, filter])

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.mute, display:'flex',
      alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>Đang tải...</div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'system-ui,sans-serif', fontSize:13 }}>
      {created && <CreatedModal info={created} onClose={() => setCreated(null)}/>}

      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)', padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${C.line}`,
        position:'sticky', top:0, zIndex:50 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>👥 Quản lý người dùng</div>
          <div style={{ fontSize:10, color:C.mute }}>Chỉ Admin chính nhìn thấy trang này</div>
        </div>
        <button onClick={() => window.location.href = '/projects'} style={btn('transparent', C.mute, '#ffffff20')}>
          ← Dự án
        </button>
      </header>

      <main style={{ maxWidth:820, margin:'0 auto', padding:20 }}>
        {/* Bộ lọc */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          {(['all','pending','approved','rejected'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={btn(filter === f ? '#F5A62325' : 'transparent', filter === f ? C.acc : C.mute,
                filter === f ? '#F5A62366' : '#ffffff20')}>
              {f === 'all' ? 'Tất cả' : STATUS[f].l} ({counts[f]})
            </button>
          ))}
          <div style={{ flex:1 }}/>
          <button onClick={() => setShowCreate(v => !v)} style={btn(C.acc, '#0d1b3e')}>+ Tạo tài khoản</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm theo tên, email, SĐT, công ty, dự án..."
          style={{ ...inp, marginBottom:14, padding:'10px 12px' }}/>

        {showCreate && (
          <CreateForm projects={projects} busy={busy}
            onCancel={() => setShowCreate(false)}
            onCreate={(f) => run(async () => {
              const pass = f.password || genPass()
              await api({ action:'create', ...f, password: pass, projectId: f.projectId || null })
              setShowCreate(false); setCreated({ email: f.email, pass })
            })}/>
        )}

        {shown.length === 0 && (
          <div style={{ textAlign:'center', color:C.mute, padding:40 }}>Không có người dùng phù hợp.</div>
        )}

        {shown.map(u => (
          <UserCard key={u.user_id} u={u} me={me} projects={projects} busy={busy}
            open={open === u.user_id} onToggle={() => setOpen(open === u.user_id ? null : u.user_id)}
            onSetRole={(pid, role) => run(() => rpc('set_membership', { target_user: u.user_id, target_project: pid, target_role: role }))}
            onReject={() => confirm(`Từ chối ${u.email}?`) && run(() => rpc('reject_user', { target_user: u.user_id }))}
            onSaveProfile={(f) => run(() => rpc('update_profile', {
              target_user: u.user_id, p_full_name: f.full_name, p_phone: f.phone, p_company: f.company }), '✅ Đã lưu thông tin')}
            onSetPassword={() => {
              const p = prompt(`Mật khẩu mới cho ${u.email}\n(để trống để tự tạo)`, '')
              if (p === null) return
              const pass = p.trim() || genPass()
              if (pass.length < 6) { alert('Mật khẩu phải có ít nhất 6 ký tự'); return }
              run(async () => { await api({ action:'set_password', userId: u.user_id, password: pass }); setCreated({ email: u.email, pass }) })
            }}
            onSendReset={() => run(async () => {
              const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${window.location.origin}/reset-password` })
              if (error) throw error
            }, `📧 Đã gửi email đặt lại mật khẩu tới ${u.email}`)}
            onDelete={() => {
              if (!confirm(`XOÁ VĨNH VIỄN tài khoản ${u.email}?\n\nHọ sẽ bị gỡ khỏi mọi dự án và không đăng nhập được nữa.`)) return
              run(() => api({ action:'delete', userId: u.user_id }), '🗑 Đã xoá tài khoản')
            }}
          />
        ))}
      </main>
    </div>
  )
}

/* ---------- Thẻ người dùng ---------- */
function UserCard({ u, me, projects, busy, open, onToggle, onSetRole, onReject, onSaveProfile, onSetPassword, onSendReset, onDelete }: {
  u: U; me: string; projects: P[]; busy: boolean; open: boolean; onToggle: () => void
  onSetRole: (pid: string, role: string) => void; onReject: () => void
  onSaveProfile: (f: { full_name: string; phone: string; company: string }) => void
  onSetPassword: () => void; onSendReset: () => void; onDelete: () => void
}) {
  const [f, setF] = useState({ full_name: u.full_name ?? '', phone: u.phone ?? '', company: u.company ?? '' })
  const [addPid, setAddPid]   = useState('')
  const [addRole, setAddRole] = useState('editor')
  useEffect(() => { setF({ full_name: u.full_name ?? '', phone: u.phone ?? '', company: u.company ?? '' }) }, [u])
  const isMe = u.user_id === me
  const st = STATUS[u.status] ?? STATUS.approved
  const freeProjects = projects.filter(p => !u.memberships.some(m => m.project_id === p.id))

  return (
    <div style={{ background:C.card, border:`1px solid ${u.status === 'pending' ? '#F5A62366' : C.line}`,
      borderRadius:12, marginBottom:10, overflow:'hidden' }}>
      <div onClick={onToggle} style={{ padding:'12px 14px', cursor:'pointer', display:'flex', gap:10, alignItems:'center' }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'#1a2d5a', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:C.acc }}>
          {u.is_super_admin ? '⭐' : (u.full_name || u.email).trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {u.full_name || '(chưa có tên)'}{isMe && <span style={{ color:C.mute, fontWeight:400 }}> · Bạn</span>}
          </div>
          <div style={{ fontSize:11, color:C.mute, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {u.email}{u.company ? ` · ${u.company}` : ''}
          </div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
            {u.memberships.length === 0
              ? <span style={{ fontSize:10, color:'#ffffff50' }}>Chưa thuộc dự án nào</span>
              : u.memberships.map(m => (
                <span key={m.project_id} style={{ fontSize:10, padding:'1px 6px', borderRadius:5,
                  background:'#ffffff0a', color:ROLE[m.role]?.c ?? C.mute }}>
                  {m.project_name} · {ROLE[m.role]?.l ?? m.role}
                </span>))}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:st.c }}>
            {u.is_super_admin ? '⭐ Admin chính' : st.l}
          </div>
          <div style={{ fontSize:10, color:C.mute, marginTop:2 }}>{open ? '▲' : '▼'}</div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop:`1px solid ${C.line}`, padding:14 }}>
          <div style={{ fontSize:10, color:C.mute, marginBottom:12 }}>
            Tạo: {fmt(u.created_at)} · Đăng nhập gần nhất: {fmt(u.last_sign_in_at)}
          </div>

          {/* Dự án & vai trò */}
          <div style={{ fontSize:11, fontWeight:700, color:'#c0d0ef', marginBottom:6 }}>Dự án & vai trò</div>
          {u.memberships.map(m => (
            <div key={m.project_id} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6 }}>
              <div style={{ flex:1, fontSize:12 }}>{m.project_name}</div>
              <select value={m.role} disabled={busy} onChange={e => onSetRole(m.project_id, e.target.value)}
                style={{ ...inp, width:130 }}>
                <option value="admin">👑 Admin</option>
                <option value="editor">✏️ Editor</option>
                <option value="viewer">👁 Viewer</option>
              </select>
              <button disabled={busy} onClick={() => confirm(`Gỡ khỏi dự án "${m.project_name}"?`) && onSetRole(m.project_id, 'none')}
                style={btn('#FF444415', '#FF8888')}>✕</button>
            </div>
          ))}
          {freeProjects.length > 0 && (
            <div style={{ display:'flex', gap:6, marginTop:4, marginBottom:14, flexWrap:'wrap' }}>
              <select value={addPid} onChange={e => setAddPid(e.target.value)} style={{ ...inp, flex:'2 1 180px', width:'auto' }}>
                <option value="">— Thêm vào dự án —</option>
                {freeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value)} style={{ ...inp, flex:'1 1 110px', width:'auto' }}>
                <option value="editor">✏️ Editor</option>
                <option value="viewer">👁 Viewer</option>
                <option value="admin">👑 Admin</option>
              </select>
              <button disabled={busy || !addPid} onClick={() => { onSetRole(addPid, addRole); setAddPid('') }}
                style={btn('#375623', '#fff')}>{u.status === 'pending' ? '✓ Duyệt & thêm' : '+ Thêm'}</button>
            </div>
          )}

          {/* Thông tin */}
          <div style={{ fontSize:11, fontWeight:700, color:'#c0d0ef', margin:'8px 0 6px' }}>Thông tin</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8, marginBottom:8 }}>
            <input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} placeholder="Họ tên" style={inp}/>
            <input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Số điện thoại" style={inp}/>
            <input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} placeholder="Công ty / Đơn vị" style={inp}/>
          </div>
          <button disabled={busy} onClick={() => onSaveProfile(f)} style={{ ...btn('#1a2d5a', C.text, '#4472C4'), marginBottom:14 }}>
            💾 Lưu thông tin
          </button>

          {/* Tài khoản */}
          <div style={{ fontSize:11, fontWeight:700, color:'#c0d0ef', marginBottom:6 }}>Tài khoản</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button disabled={busy} onClick={onSetPassword} style={btn('#1a2d5a', C.text, '#ffffff20')}>🔑 Đặt mật khẩu mới</button>
            <button disabled={busy} onClick={onSendReset} style={btn('#1a2d5a', C.text, '#ffffff20')}>📧 Gửi email đặt lại</button>
            {u.status === 'pending' && (
              <button disabled={busy} onClick={onReject} style={btn('#FF444415', '#FF8888')}>✕ Từ chối</button>
            )}
            {!isMe && !u.is_super_admin && (
              <button disabled={busy} onClick={onDelete} style={btn('#FF444425', '#FF6666', '#FF444466')}>🗑 Xoá tài khoản</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Form tạo tài khoản ---------- */
function CreateForm({ projects, busy, onCancel, onCreate }: {
  projects: P[]; busy: boolean; onCancel: () => void
  onCreate: (f: { email: string; password: string; fullName: string; phone: string; company: string; projectId: string; role: string }) => void
}) {
  const [f, setF] = useState({ email:'', password:'', fullName:'', phone:'', company:'', projectId:'', role:'editor' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div style={{ background:C.card, border:`1px solid ${C.acc}55`, borderRadius:12, padding:14, marginBottom:14 }}>
      <div style={{ fontSize:13, fontWeight:700, color:C.acc, marginBottom:10 }}>+ Tạo tài khoản mới</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:8, marginBottom:8 }}>
        <input value={f.fullName} onChange={set('fullName')} placeholder="Họ tên" style={inp}/>
        <input type="email" value={f.email} onChange={set('email')} placeholder="Email *" style={inp}/>
        <input value={f.password} onChange={set('password')} placeholder="Mật khẩu (trống → tự tạo)" style={inp}/>
        <input value={f.phone} onChange={set('phone')} placeholder="Số điện thoại" style={inp}/>
        <input value={f.company} onChange={set('company')} placeholder="Công ty / Đơn vị" style={inp}/>
        <select value={f.projectId} onChange={set('projectId')} style={inp}>
          <option value="">— Chưa gán dự án —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {f.projectId && (
          <select value={f.role} onChange={set('role')} style={inp}>
            <option value="editor">✏️ Editor — cập nhật tiến độ</option>
            <option value="viewer">👁 Viewer — chỉ xem</option>
            <option value="admin">👑 Admin dự án</option>
          </select>
        )}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button disabled={busy || !f.email} onClick={() => onCreate(f)} style={btn('#375623', '#fff')}>
          {busy ? '⏳ Đang tạo...' : '✓ Tạo tài khoản'}
        </button>
        <button onClick={onCancel} style={btn('transparent', C.mute, '#ffffff20')}>Huỷ</button>
      </div>
    </div>
  )
}

/* ---------- Hộp hiện mật khẩu vừa tạo ---------- */
function CreatedModal({ info, onClose }: { info: { email: string; pass: string }; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#000000aa', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:999 }}>
      <div style={{ background:C.card, border:'1px solid #4ade80', borderRadius:14, padding:24, maxWidth:360, width:'90%' }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#4ade80', marginBottom:14 }}>✅ Thành công</div>
        <div style={{ fontSize:10, color:C.mute, marginBottom:4 }}>Email</div>
        <div style={{ background:C.bg, borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:'monospace', marginBottom:10 }}>
          {info.email}
        </div>
        <div style={{ fontSize:10, color:C.mute, marginBottom:4 }}>Mật khẩu</div>
        <div style={{ background:C.bg, borderRadius:7, padding:'8px 12px', fontSize:16, color:C.acc,
          fontFamily:'monospace', fontWeight:700, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span>{info.pass}</span>
          <button onClick={() => { navigator.clipboard.writeText(`Email: ${info.email}\nMật khẩu: ${info.pass}\nĐăng nhập: ${window.location.origin}/login`); alert('✅ Đã copy') }}
            style={btn(C.acc, '#0d1b3e')}>Copy</button>
        </div>
        <div style={{ fontSize:10, color:C.mute, background:'#ffffff08', borderRadius:7, padding:'8px 12px', marginBottom:14 }}>
          💡 Gửi thông tin này cho người dùng (Zalo/email). Họ có thể đổi mật khẩu bằng "Quên mật khẩu".
        </div>
        <button onClick={onClose} style={{ ...btn('#276221', '#fff'), width:'100%', padding:10, fontSize:12 }}>Đóng</button>
      </div>
    </div>
  )
}
