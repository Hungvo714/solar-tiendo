'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Project = {
  id: string; name: string; client: string; contractor: string
  start_date: string; total_days: number; role?: string
}
type Member = { user_id: string; role: string }

export default function ProjectsPage() {
  const [projects,  setProjects]  = useState<Project[]>([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [deleting,  setDeleting]  = useState<string|null>(null)
  const [copied,    setCopied]    = useState<string|null>(null)
  const [showMembers, setShowMembers] = useState<string|null>(null)
  const [members,   setMembers]   = useState<Member[]>([])
  const [newEmail,  setNewEmail]  = useState('')
  const [newPass,   setNewPass]   = useState('')
  const [newRole,   setNewRole]   = useState('editor')
  const [addingMember, setAddingMember] = useState(false)
  const [myUserId,  setMyUserId]  = useState<string|null>(null)
  const [form, setForm] = useState({
    name:'', client:'', contractor:'TTCE-HTE', start_date:'', total_days:'60'
  })

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setMyUserId(user.id)

      const { data, error } = await supabase
        .from('project_members')
        .select('role, projects(*)')
        .eq('user_id', user.id)

      if (error) { console.error(error); setLoading(false); return }

      const list = ((data ?? []) as any[]).map(r => ({
        ...r.projects, role: r.role
      })).filter(Boolean)
      setProjects(list)
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function createProject() {
    if (!form.name) return
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: proj, error } = await supabase.from('projects').insert({
        name: form.name, client: form.client, contractor: form.contractor,
        start_date: form.start_date || new Date().toISOString().split('T')[0],
        total_days: parseInt(form.total_days) || 60,
      }).select().single()
      if (error || !proj) { alert('Lỗi: ' + error?.message); return }
      await supabase.from('project_members').insert({
        project_id: proj.id, user_id: user.id, role: 'admin'
      })
      setShowForm(false)
      setForm({ name:'', client:'', contractor:'TTCE-HTE', start_date:'', total_days:'60' })
      loadProjects()
    } finally {
      setCreating(false)
    }
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`Xoá dự án "${name}"?\nToàn bộ data sẽ bị xoá vĩnh viễn.`)) return
    setDeleting(id)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) alert('Lỗi: ' + error.message)
    setDeleting(null)
    loadProjects()
  }

  async function loadMembers(pid: string) {
    const { data } = await supabase.from('project_members').select('*').eq('project_id', pid)
    setMembers((data ?? []) as Member[])
    setShowMembers(pid)
  }

  async function addMember(pid: string) {
    if (!newEmail || !newPass) { alert('Nhập đầy đủ email và mật khẩu'); return }
    setAddingMember(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPass })
      if (error || !data.user) { alert('Lỗi: ' + error?.message); return }
      await supabase.from('project_members').upsert({
        project_id: pid, user_id: data.user.id, role: newRole
      }, { onConflict: 'project_id,user_id' })
      setNewEmail(''); setNewPass(''); setNewRole('editor')
      alert(`✅ Đã tạo tài khoản!\nEmail: ${newEmail}\nMật khẩu: ${newPass}\nRole: ${newRole}`)
      loadMembers(pid)
    } finally {
      setAddingMember(false)
    }
  }

  async function changeRole(pid: string, uid: string, role: string) {
    await supabase.from('project_members').update({ role }).eq('project_id', pid).eq('user_id', uid)
    loadMembers(pid)
  }

  async function removeMember(pid: string, uid: string) {
    if (!confirm('Xoá thành viên này?')) return
    await supabase.from('project_members').delete().eq('project_id', pid).eq('user_id', uid)
    loadMembers(pid)
  }

  function copyLink(id: string) {
    const url = window.location.origin + '/view/' + id
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2500)
  }

  const roleInfo = (r: string) => r==='admin'
    ? { l:'👑 Admin', c:'#F5A623' }
    : r==='editor' ? { l:'✏️ Editor', c:'#60a5fa' }
    : { l:'👁 Viewer', c:'#8899bb' }

  const S = {
    inp: { width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20', borderRadius:7,
      padding:'8px 12px', color:'#e8eaf0', fontFamily:'inherit', fontSize:12,
      outline:'none', boxSizing:'border-box' as any } as React.CSSProperties,
    btn: (bg: string, c: string, bd?: string) => ({
      padding:'7px 13px', background:bg, color:c,
      border: bd ? `1px solid ${bd}` : 'none',
      borderRadius:7, fontSize:11, fontWeight:600, cursor:'pointer',
      whiteSpace:'nowrap' as any, fontFamily:'inherit'
    }) as React.CSSProperties,
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0f1e', color:'#e8eaf0',
      fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'14px 20px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ background:'#F5A623', color:'#0d1b3e', fontWeight:700, fontSize:10,
            width:36, height:36, borderRadius:8,
            display:'flex', alignItems:'center', justifyContent:'center' }}>HTE</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Tiến độ các dự án Solar</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>Danh sách dự án</div>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.href='/login')}
          style={S.btn('transparent','#8899bb','#ffffff20')}>Đăng xuất</button>
      </header>

      <main style={{ maxWidth:700, margin:'0 auto', padding:20 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#8899bb' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>☀️</div>
            <div>Đang tải...</div>
          </div>
        ) : (
          <>
            {/* Title + Create */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:700 }}>📋 Dự án ({projects.length})</div>
              <button onClick={() => setShowForm(!showForm)}
                style={{ ...S.btn('#F5A623','#0d1b3e'), padding:'9px 18px', fontSize:12, borderRadius:9 }}>
                + Tạo dự án mới
              </button>
            </div>

            {/* Create Form */}
            {showForm && (
              <div style={{ background:'#0d1b3e', border:'1px solid #F5A623',
                borderRadius:12, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#F5A623', marginBottom:14 }}>
                  ✨ Tạo dự án mới
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  {[['Tên dự án *','name','Điện mặt trời...','text'],
                    ['Chủ đầu tư','client','Công ty...','text'],
                    ['Nhà thầu','contractor','TTCE-HTE','text'],
                    ['Số ngày thi công','total_days','60','number'],
                  ].map(([lbl,key,ph,type]) => (
                    <div key={key}>
                      <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>{lbl}</label>
                      <input type={type} placeholder={ph} value={(form as any)[key]}
                        onChange={e => setForm(p => ({...p,[key]:e.target.value}))} style={S.inp}/>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>Ngày khởi công</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(p => ({...p,start_date:e.target.value}))} style={S.inp}/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={createProject} disabled={!form.name || creating}
                    style={{ ...S.btn(form.name?'#F5A623':'#444', form.name?'#0d1b3e':'#888'), flex:1, padding:'10px' }}>
                    {creating ? '⏳ Đang tạo...' : '✓ Tạo dự án'}
                  </button>
                  <button onClick={() => setShowForm(false)} style={S.btn('transparent','#8899bb','#ffffff20')}>Huỷ</button>
                </div>
              </div>
            )}

            {/* Project List */}
            {projects.length === 0 ? (
              <div style={{ textAlign:'center', padding:60, color:'#8899bb' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏗️</div>
                <div style={{ marginBottom:6 }}>Chưa có dự án nào</div>
                <div style={{ fontSize:11 }}>Click "+ Tạo dự án mới" để bắt đầu</div>
              </div>
            ) : projects.map(proj => {
              const rl = roleInfo(proj.role ?? 'viewer')
              const isAdmin = proj.role === 'admin'
              return (
                <div key={proj.id} style={{ background:'#0d1b3e', border:'1px solid #ffffff12',
                  borderRadius:12, padding:16, marginBottom:10 }}>

                  {/* Info */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:12 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>{proj.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8,
                          background:rl.c+'22', color:rl.c, border:`1px solid ${rl.c}44` }}>{rl.l}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#8899bb', display:'flex', gap:10, flexWrap:'wrap' }}>
                        {proj.client && <span>🏢 {proj.client}</span>}
                        <span>⏱ {proj.total_days} ngày</span>
                        {proj.start_date && <span>📅 {new Date(proj.start_date).toLocaleDateString('vi-VN')}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                    <button onClick={() => window.location.href=`/dashboard?project=${proj.id}`}
                      style={{ ...S.btn('#F5A623','#0d1b3e'), flex:1 }}>
                      📊 Vào dự án
                    </button>
                    <button onClick={() => copyLink(proj.id)}
                      style={S.btn(copied===proj.id?'#276221':'#17375E22',
                        copied===proj.id?'#fff':'#60a5fa', '#2E75B6')}>
                      {copied===proj.id ? '✅ Đã copy!' : '🔗 Link CĐT'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => showMembers===proj.id ? setShowMembers(null) : loadMembers(proj.id)}
                        style={S.btn('#4A235A22','#c084fc','#7030A0')}>
                        👥 Thành viên
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => deleteProject(proj.id, proj.name)}
                        disabled={deleting===proj.id}
                        style={S.btn('#FF444415','#FF8888','#FF4444')}>
                        {deleting===proj.id ? '⏳' : '🗑️ Xoá'}
                      </button>
                    )}
                  </div>

                  {/* Link preview */}
                  <div style={{ padding:'6px 10px', background:'#ffffff06', borderRadius:7,
                    fontSize:10, color:'#8899bb', fontFamily:'monospace', wordBreak:'break-all' as any }}>
                    🔗 {window.location.origin}/view/{proj.id}
                  </div>

                  {/* Members Panel */}
                  {showMembers === proj.id && (
                    <div style={{ marginTop:12, borderTop:'1px solid #ffffff10', paddingTop:12 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#c0d0ef', marginBottom:10 }}>
                        👥 Thành viên dự án
                      </div>

                      {members.map(m => (
                        <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'7px 10px', background:'#ffffff06', borderRadius:7, marginBottom:6 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'#1a2d5a',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:11, flexShrink:0, color:'#8899bb' }}>
                            {m.user_id === myUserId ? '⭐' : m.user_id.slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex:1, fontSize:11, color:'#c0d0ef', overflow:'hidden',
                            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {m.user_id === myUserId ? 'Bạn' : m.user_id.slice(0,12)+'...'}
                          </div>
                          <select value={m.role}
                            onChange={e => changeRole(proj.id, m.user_id, e.target.value)}
                            disabled={m.user_id === myUserId}
                            style={{ background:'#0a0f1e', border:'1px solid #ffffff20',
                              borderRadius:5, padding:'4px 6px', color:'#e8eaf0',
                              fontSize:11, cursor:'pointer' }}>
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {m.user_id !== myUserId && (
                            <button onClick={() => removeMember(proj.id, m.user_id)}
                              style={S.btn('#FF444415','#FF8888')}>✕</button>
                          )}
                        </div>
                      ))}

                      {/* Add Member */}
                      <div style={{ background:'#ffffff06', borderRadius:8, padding:12, marginTop:8 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:'#8899bb', marginBottom:8 }}>
                          + Thêm thành viên mới
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                          <div>
                            <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:3 }}>Email</label>
                            <input type="email" value={newEmail} placeholder="user@email.com"
                              onChange={e => setNewEmail(e.target.value)} style={S.inp}/>
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:3 }}>Mật khẩu</label>
                            <input type="text" value={newPass} placeholder="Mật khẩu..."
                              onChange={e => setNewPass(e.target.value)} style={S.inp}/>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <select value={newRole} onChange={e => setNewRole(e.target.value)}
                            style={{ ...S.inp, flex:1, width:'auto' }}>
                            <option value="editor">✏️ Editor — cập nhật tiến độ</option>
                            <option value="viewer">👁 Viewer — chỉ xem</option>
                            <option value="admin">👑 Admin — toàn quyền</option>
                          </select>
                          <button onClick={() => addMember(proj.id)} disabled={addingMember}
                            style={S.btn('#375623','#fff')}>
                            {addingMember ? '⏳' : '✓ Thêm'}
                          </button>
                        </div>
                        <div style={{ fontSize:10, color:'#8899bb', marginTop:6 }}>
                          💡 Gửi email + mật khẩu cho thành viên để họ đăng nhập.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </main>
    </div>
  )
}
