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
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [newUserInfo, setNewUserInfo] = useState<{email:string,pass:string}|null>(null)
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
      
      // Check xem có phải admin của ít nhất 1 dự án không
      const hasAdminRole = list.some((p: any) => p.role === 'admin')
      setIsAdmin(hasAdminRole)

      // Nếu không có dự án nào → user bị xoá khỏi tất cả project
      // Đăng xuất và thông báo
      if (list.length === 0) {
        await supabase.auth.signOut()
        window.location.href = '/login?msg=no-access'
        return
      }
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
    if (!newEmail) { alert('Nhập email thành viên'); return }
    setAddingMember(true)
    try {
      // Bước 1: Tìm user đã tồn tại qua email
      const { data: existingUsers, error: searchErr } = await supabase
        .from('auth_users_view')
        .select('id, email')
        .eq('email', newEmail.trim().toLowerCase())
        .limit(1)

      let userId: string | null = null

      // User tìm thấy HOẶC lỗi "already registered" → user đã tồn tại
      const userExists = (existingUsers && existingUsers.length > 0)

      if (userExists) {
        // User đã tồn tại - add vào dự án
        userId = existingUsers![0].id
        const { error: upsertErr } = await supabase.from('project_members').upsert({
          project_id: pid, user_id: userId, role: newRole
        }, { onConflict: 'project_id,user_id' })
        if (upsertErr) { alert('Lỗi: ' + upsertErr.message); return }
        alert(`✅ Đã thêm ${newEmail} vào dự án!\nRole: ${newRole}`)
        setNewEmail(''); setNewPass(''); setNewRole('editor')
        loadMembers(pid)
        return
      } else {
        // Tạo mật khẩu dễ nhớ: 3 từ + số
        const words = ['Solar','Nang','Luong','Cong','Trinh','Dien','Mai','Dat','An','Toan']
        const w1 = words[Math.floor(Math.random()*words.length)]
        const w2 = Math.floor(Math.random()*9000)+1000
        const pass = newPass || `${w1}${w2}!`
        
        // Lưu session admin hiện tại
        const { data: { session: adminSession } } = await supabase.auth.getSession()
        
        const { data, error } = await supabase.auth.signUp({
          email: newEmail, password: pass
        })
        
        // Khôi phục session admin ngay lập tức
        if (adminSession) {
          await supabase.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token,
          })
        }
        
        if (error || !data.user) { alert('Lỗi tạo user: ' + error?.message); return }
        userId = data.user.id
        await supabase.from('project_members').upsert({
          project_id: pid, user_id: userId, role: newRole
        }, { onConflict: 'project_id,user_id' })
        
        const displayPass = newPass || pass
        setNewUserInfo({ email: newEmail, pass: displayPass })
      }
      setNewEmail(''); setNewPass(''); setNewRole('editor')
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
    if (!confirm('Xoá thành viên này khỏi dự án này?\n\nNếu họ không còn dự án nào, họ sẽ bị đăng xuất khi vào app.')) return
    await supabase.from('project_members').delete().eq('project_id', pid).eq('user_id', uid)
    loadMembers(pid)
  }

  async function removeUserAllProjects(uid: string, email?: string) {
    if (!confirm(`Xoá user này khỏi TẤT CẢ dự án?\n\nHọ sẽ không thể vào app nữa.`)) return
    await supabase.from('project_members').delete().eq('user_id', uid)
    alert('✅ Đã xoá user khỏi tất cả dự án!')
    loadProjects()
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
    <>
    {/* Popup thông tin tài khoản mới */}
    {newUserInfo && (
      <div style={{ position:'fixed', inset:0, background:'#000000aa',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #4ade80',
          borderRadius:14, padding:24, maxWidth:360, width:'90%' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#4ade80', marginBottom:16 }}>
            ✅ Tạo tài khoản thành công!
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:'#8899bb', marginBottom:4 }}>Email</div>
            <div style={{ background:'#0a0f1e', borderRadius:7, padding:'8px 12px',
              fontSize:12, color:'#e8eaf0', fontFamily:'monospace' }}>
              {newUserInfo.email}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:'#8899bb', marginBottom:4 }}>Mật khẩu</div>
            <div style={{ background:'#0a0f1e', borderRadius:7, padding:'8px 12px',
              fontSize:16, color:'#F5A623', fontFamily:'monospace', fontWeight:700,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>{newUserInfo.pass}</span>
              <button onClick={() => {
                navigator.clipboard.writeText(newUserInfo.pass)
                alert('✅ Đã copy mật khẩu!')
              }} style={{ background:'#F5A623', color:'#0d1b3e', border:'none',
                borderRadius:6, padding:'4px 10px', fontSize:10,
                fontWeight:700, cursor:'pointer' }}>
                Copy
              </button>
            </div>
          </div>
          <div style={{ fontSize:10, color:'#8899bb', marginBottom:16,
            background:'#ffffff08', borderRadius:7, padding:'8px 12px' }}>
            💡 Gửi email + mật khẩu này cho thành viên để họ đăng nhập.
            Họ có thể đổi mật khẩu sau khi vào app.
          </div>
          <button onClick={() => setNewUserInfo(null)}
            style={{ width:'100%', padding:10, background:'#276221',
              border:'none', borderRadius:9, color:'#fff',
              fontFamily:'inherit', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Đã hiểu, đóng lại
          </button>
        </div>
      </div>
    )}
    <div style={{ minHeight:'100vh', background:'#0a0f1e', color:'#e8eaf0',
      fontFamily:'system-ui,sans-serif', fontSize:13 }}>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d1b3e,#1a2d5a)',
        padding:'14px 20px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid #ffffff12' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:8, overflow:'hidden',
            background:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <img src="data:image/jpeg;base64,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" alt="HTE" style={{ width:36, height:27, objectFit:'cover' }}/>
          </div>
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
              {isAdmin && (
                <button onClick={() => setShowForm(!showForm)}
                  style={{ ...S.btn('#F5A623','#0d1b3e'), padding:'9px 18px', fontSize:12, borderRadius:9 }}>
                  + Tạo dự án mới
                </button>
              )}
            </div>

            {/* Create Form */}
            {showForm && isAdmin && (
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
                            <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:3 }}>
                              Mật khẩu <span style={{ color:'#ffffff40' }}>(để trống → gửi email mời)</span>
                            </label>
                            <input type="text" value={newPass} placeholder="Để trống nếu user mới..."
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
  </>
  )
}
