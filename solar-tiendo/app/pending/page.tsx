'use client'
import BrandLogo from '@/components/BrandLogo'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
  borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
  fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box',
}
const labelStyle: React.CSSProperties = { fontSize:11, color:'#8899bb', display:'block', marginBottom:6, textAlign:'left' }

export default function PendingPage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'loading'|'pending'|'rejected'>('loading')
  const [form, setForm]     = useState({ full_name:'', phone:'', company:'' })
  const [sending, setSending] = useState(false)
  const [error, setError]   = useState('')
  const [justSent, setJustSent] = useState(false)

  useEffect(() => {
    let tries = 0
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Link xác nhận email vừa mở: chờ supabase-js đọc token trong URL
        if (tries++ < 3) { setTimeout(check, 1000); return }
        window.location.href = '/login'; return
      }
      setEmail(session.user.email ?? '')

      // Đã được gán vào dự án → vào app
      const { data: mem } = await supabase.from('project_members')
        .select('project_id').eq('user_id', session.user.id).limit(1)
      if (mem && mem.length > 0) { window.location.href = '/projects'; return }

      const { data: prof } = await supabase.from('profiles')
        .select('status, full_name, phone, company').eq('id', session.user.id).maybeSingle()
      setForm({ full_name: prof?.full_name ?? '', phone: prof?.phone ?? '', company: prof?.company ?? '' })
      setStatus(prof?.status === 'rejected' ? 'rejected' : 'pending')
    }
    check()
  }, [])

  async function resend(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.full_name.trim()) { setError('Vui lòng nhập họ tên.'); return }
    setSending(true)
    const { error: err } = await supabase.rpc('request_reapproval', {
      p_full_name: form.full_name, p_phone: form.phone, p_company: form.company,
    })
    setSending(false)
    if (err) { setError(err.message); return }
    setJustSent(true)
    setStatus('pending')
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:400, textAlign:'center' }}>
        <div style={{ display:'inline-flex', marginBottom:16 }}><BrandLogo size={56} /></div>

        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          {status === 'loading' && <div style={{ fontSize:12, color:'#8899bb' }}>Đang kiểm tra...</div>}

          {status === 'pending' && (<>
            <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
            <div style={{ fontSize:14, color:'#e8eaf0', fontWeight:700, marginBottom:8 }}>
              {justSent ? 'Đã gửi lại yêu cầu' : 'Tài khoản đang chờ duyệt'}
            </div>
            <div style={{ fontSize:12, color:'#8899bb', lineHeight:1.6, marginBottom:16 }}>
              <b style={{ color:'#e8eaf0' }}>{email}</b>{justSent ? ' đã gửi lại yêu cầu.' : ' đã đăng ký thành công.'}<br/>
              Admin sẽ duyệt và gán bạn vào dự án. Sau đó bấm "Kiểm tra lại" hoặc đăng nhập lại là vào được.
            </div>
            <button onClick={() => window.location.reload()}
              style={{ padding:'10px 16px', background:'#F5A623', color:'#0d1b3e', border:'none',
                borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginRight:8 }}>
              Kiểm tra lại
            </button>
          </>)}

          {status === 'rejected' && (<>
            <div style={{ fontSize:32, marginBottom:8 }}>🚫</div>
            <div style={{ fontSize:14, color:'#e8eaf0', fontWeight:700, marginBottom:6 }}>
              Yêu cầu chưa được chấp nhận
            </div>
            <div style={{ fontSize:12, color:'#8899bb', lineHeight:1.6, marginBottom:16 }}>
              Có thể do thiếu thông tin. Bổ sung đầy đủ bên dưới rồi gửi lại yêu cầu để Admin xem xét.
            </div>
            <form onSubmit={resend}>
              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Họ và tên *</label>
                <input value={form.full_name} onChange={set('full_name')} required style={inputStyle}
                  placeholder="Nguyễn Văn A"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Số điện thoại</label>
                  <input value={form.phone} onChange={set('phone')} style={inputStyle} placeholder="09xx xxx xxx"/>
                </div>
                <div>
                  <label style={labelStyle}>Công ty / Đơn vị</label>
                  <input value={form.company} onChange={set('company')} style={inputStyle} placeholder="Thầu phụ, CĐT..."/>
                </div>
              </div>
              {error && (
                <div style={{ background:'#FF444420', border:'1px solid #FF4444', borderRadius:7,
                  padding:'8px 12px', fontSize:11, color:'#FF8888', marginBottom:12, textAlign:'left' }}>
                  ⚠ {error}
                </div>
              )}
              <button type="submit" disabled={sending}
                style={{ width:'100%', padding:12, background: sending ? '#ccaa66' : '#F5A623',
                  color:'#0d1b3e', border:'none', borderRadius:9, fontSize:13, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                {sending ? 'Đang gửi...' : '📨 Gửi lại yêu cầu'}
              </button>
            </form>
          </>)}

          {status !== 'loading' && (
            <button onClick={logout}
              style={{ padding:'10px 16px', background:'transparent', color:'#8899bb',
                border:'1px solid #ffffff20', borderRadius:9, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
              Đăng xuất
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
