'use client'
import BrandLogo from '@/components/BrandLogo'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Project = {
  id: string; name: string; client: string; contractor: string
  start_date: string; total_days: number; role?: string; share_token?: string
}
type Member = { user_id: string; role: string; email?: string|null; full_name?: string|null }

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
  const [newUserInfo,  setNewUserInfo]  = useState<{email:string,pass:string}|null>(null)
  const [isSuper,      setIsSuper]      = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [editProject,  setEditProject]  = useState<any|null>(null)
  const [editForm,     setEditForm]     = useState({ name:'', client:'', contractor:'', location:'', start_date:'', total_days:'' })
  const [form, setForm] = useState({
    name:'', client:'', contractor:'TTCE-HTE', start_date:'', total_days:'60', location:''
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
      // Admin chính?
      const { data: sup } = await supabase.rpc('is_super_admin')
      if (sup) {
        setIsSuper(true)
        setIsAdmin(true)   // Admin chính luôn tạo được dự án
        const { count } = await supabase.from('profiles')
          .select('id', { count: 'exact', head: true }).eq('status', 'pending')
        setPendingCount(count ?? 0)
      }

      // Nếu không có dự án nào → user bị xoá khỏi tất cả project
      // Đăng xuất và thông báo
      if (list.length === 0) {
        // Tài khoản tự đăng ký đang chờ duyệt → trang chờ (không đăng xuất)
        const { data: prof } = await supabase.from('profiles')
          .select('status').eq('id', user.id).maybeSingle()
        if (sup) return   // Admin chính vẫn vào được dù chưa có dự án
        if (prof && prof.status !== 'approved') { window.location.href = '/pending'; return }
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
        location: form.location || null,
      }).select().single()
      if (error || !proj) { alert('Lỗi: ' + error?.message); return }
      await supabase.from('project_members').insert({
        project_id: proj.id, user_id: user.id, role: 'admin'
      })
      setShowForm(false)
      setForm({ name:'', client:'', contractor:'TTCE-HTE', start_date:'', total_days:'60', location:'' })
      loadProjects()
    } finally {
      setCreating(false)
    }
  }

  async function deleteProject(id: string, name: string) {
    if (!isSuper) { alert('Chỉ Admin chính được xoá dự án.'); return }
    if (!confirm(`Xoá dự án "${name}"?\nToàn bộ tiến độ, ngày, khối lượng, thành viên sẽ bị xoá vĩnh viễn.`)) return
    const typed = prompt(`Để xác nhận, gõ lại chính xác tên dự án:\n${name}`)
    if (typed == null) return
    if (typed.trim() !== name.trim()) { alert('Tên không khớp — đã huỷ xoá.'); return }
    setDeleting(id)
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')
    if (error) alert('Lỗi: ' + error.message)
    else if (!data?.length) alert('Không xoá được — chỉ Admin chính có quyền xoá dự án.')
    setDeleting(null)
    loadProjects()
  }

  async function loadMembers(pid: string) {
    const { data } = await supabase.from('project_members').select('*').eq('project_id', pid)
    const list = (data ?? []) as Member[]
    // Lấy email / họ tên để hiển thị (bảng profiles — nếu chưa chạy SQL thì bỏ qua)
    const ids = list.map(m => m.user_id)
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,email,full_name').in('id', ids)
      const byId: Record<string, any> = {}
      ;(profs ?? []).forEach((p: any) => { byId[p.id] = p })
      list.forEach(m => { m.email = byId[m.user_id]?.email; m.full_name = byId[m.user_id]?.full_name })
    }
    setMembers(list)
    setShowMembers(pid)
  }



  function openEditProject(proj: any) {
    setEditProject(proj)
    setEditForm({
      name:       proj.name        ?? '',
      client:     proj.client      ?? '',
      contractor: proj.contractor  ?? '',
      location:   proj.location    ?? '',
      start_date: proj.start_date  ?? '',
      total_days: String(proj.total_days ?? 60),
    })
  }

  async function saveEditProject() {
    if (!editProject) return
    await supabase.from('projects').update({
      name:       editForm.name,
      client:     editForm.client,
      contractor: editForm.contractor,
      location:   editForm.location || null,
      start_date: editForm.start_date,
      total_days: parseInt(editForm.total_days) || 60,
    }).eq('id', editProject.id)
    setEditProject(null)
    loadProjects()
  }

  async function addMember(pid: string) {
    if (!newEmail) { alert('Nhập email thành viên'); return }
    setAddingMember(true)
    try {
      // Bước 1: Tìm user đã tồn tại qua RPC function
      const { data: existingId } = await supabase
        .rpc('get_user_id_by_email', { user_email: newEmail.trim() })

      let userId: string | null = null

      if (existingId) {
        // User đã tồn tại - add vào dự án
        userId = existingId as string
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
        
        if (!isSuper) {
          alert('Email này chưa có tài khoản.\n\nNgười dùng cần tự Đăng ký tại trang đăng nhập, hoặc nhờ Admin chính tạo tài khoản.')
          return
        }
        // Admin chính tạo tài khoản qua API phía máy chủ (đã xác nhận email, đăng nhập được ngay)
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ action: 'create', email: newEmail.trim(), password: pass, projectId: pid, role: newRole }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { alert('Lỗi tạo tài khoản: ' + (json.error ?? res.statusText)); return }
        userId = json.userId
        
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

  const shareUrl = (p: Project) => window.location.origin + '/view/' + (p.share_token ?? p.id)

  function copyLink(p: Project) {
    navigator.clipboard.writeText(shareUrl(p))
    setCopied(p.id)
    setTimeout(() => setCopied(null), 2500)
  }

  async function regenerateLink(p: Project) {
    if (!confirm(`Đổi link CĐT của "${p.name}"?\n\nLink cũ sẽ KHÔNG mở được nữa. Bạn cần gửi link mới cho CĐT.`)) return
    const { error } = await supabase.rpc('regenerate_share_token', { pid: p.id })
    if (error) { alert('Lỗi: ' + error.message); return }
    await loadProjects()
    alert('✅ Đã tạo link mới. Bấm "Link CĐT" để copy.')
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
    {/* Modal sửa dự án */}
    {editProject && (
      <div style={{ position:'fixed', inset:0, background:'#000000bb',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
        <div style={{ background:'#0d1b3e', border:'1px solid #4472C4',
          borderRadius:14, padding:24, width:360, maxWidth:'90vw' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#e8eaf0', marginBottom:16 }}>
            ✏️ Sửa thông tin dự án
          </div>
          {[
            ['Tên dự án *',           'name',       'text',   'Điện mặt trời...'],
            ['Chủ đầu tư',            'client',     'text',   'Công ty...'],
            ['Nhà máy (nơi lắp đặt)', 'location',   'text',   'VD: Nhà máy ABC'],
            ['Nhà thầu',              'contractor', 'text',   'TTCE-HTE'],
          ].map(([label, key, type, ph]) => (
            <div key={key} style={{ marginBottom:10 }}>
              <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:3 }}>{label}</label>
              <input type={type} value={(editForm as any)[key]}
                placeholder={ph}
                onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                  borderRadius:7, padding:'7px 10px', color:'#e8eaf0',
                  fontFamily:'inherit', fontSize:12, outline:'none',
                  boxSizing:'border-box' as any, colorScheme:'dark' as any }}/>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={() => setEditProject(null)}
              style={{ flex:1, padding:10, background:'transparent', border:'1px solid #ffffff20',
                borderRadius:9, color:'#8899bb', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>
              Huỷ
            </button>
            <button onClick={saveEditProject} disabled={!editForm.name}
              style={{ flex:1, padding:10, background: editForm.name ? '#1a3a8a' : '#1a2d5a',
                border:'1px solid #4472C4', borderRadius:9, color:'#fff',
                fontFamily:'inherit', fontSize:12, fontWeight:600,
                cursor: editForm.name ? 'pointer' : 'not-allowed' }}>
              💾 Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    )}
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
          <BrandLogo size={36} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Tiến độ các dự án Solar</div>
            <div style={{ fontSize:10, color:'#8899bb' }}>Danh sách dự án</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isSuper && (
            <button onClick={() => window.location.href = '/users'}
              style={{ ...S.btn('#F5A62320','#F5A623','#F5A62366'), position:'relative' }}>
              👥 Người dùng
              {pendingCount > 0 && (
                <span style={{ marginLeft:6, background:'#FF4444', color:'#fff', borderRadius:10,
                  padding:'1px 6px', fontSize:10 }}>{pendingCount}</span>
              )}
            </button>
          )}
          <button onClick={() => window.location.href = '/account'} title="Thông tin cá nhân, đổi mật khẩu"
            style={S.btn('transparent','#c0d0ef','#ffffff30')}>👤 Tài khoản</button>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href='/login')}
            style={S.btn('transparent','#8899bb','#ffffff20')}>Đăng xuất</button>
        </div>
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
                    ['Nhà máy (nơi lắp đặt)','location','VD: Nhà máy Dệt Sợi ABC','text'],
                    ['Nhà thầu','contractor','TTCE-HTE','text'],
                  ].map(([lbl,key,ph,type]) => (
                    <div key={key}>
                      <label style={{ fontSize:10, color:'#8899bb', display:'block', marginBottom:4 }}>{lbl}</label>
                      <input type={type} placeholder={ph} value={(form as any)[key]}
                        onChange={e => setForm(p => ({...p,[key]:e.target.value}))} style={S.inp}/>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:14 }}>
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
                        {proj.start_date && <span>📅 {new Date(proj.start_date).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                    <button onClick={() => window.location.href=`/dashboard?project=${proj.id}`}
                      style={{ ...S.btn('#F5A623','#0d1b3e'), flex:1 }}>
                      📊 Vào dự án
                    </button>
                    <button onClick={() => copyLink(proj)}
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
                      <button onClick={() => openEditProject(proj)}
                        style={S.btn('#1a2d5a','#60a5fa','#4472C4')}>
                        ✏️ Sửa
                      </button>
                    )}
                    {isSuper && (
                      <button onClick={() => window.location.href = `/items?project=${proj.id}`}
                        title="Thêm / ẩn hạng mục, sửa điều kiện liên quan"
                        style={S.btn('#F5A62315','#F5A623','#F5A62366')}>
                        ⚙️ Hạng mục
                      </button>
                    )}
                    {isSuper && (
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
                    🔗 {shareUrl(proj)}
                    {isSuper && (
                      <button onClick={() => regenerateLink(proj)} title="Tạo link mới, link cũ hết hiệu lực"
                        style={{ marginLeft:8, background:'transparent', border:'1px solid #ffffff20', borderRadius:5,
                          color:'#8899bb', fontSize:10, padding:'2px 6px', cursor:'pointer', fontFamily:'inherit' }}>
                        🔄 Đổi link
                      </button>
                    )}
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
                            {m.user_id === myUserId ? 'Bạn'
                              : (m.full_name ? `${m.full_name} · ` : '') + (m.email ?? m.user_id.slice(0,12)+'...')}
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
                              Mật khẩu <span style={{ color:'#ffffff40' }}>(để trống → tự tạo)</span>
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
