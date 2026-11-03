'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
  borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
  fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box',
}
const labelStyle: React.CSSProperties = { fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name:'', phone:'', company:'', email:'', password:'', confirm:'' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [checkMail, setCheckMail] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.full_name.trim()) { setError('Vui lòng nhập họ tên.'); return }
    if (form.password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự.'); return }
    if (form.password !== form.confirm) { setError('Hai mật khẩu không khớp.'); return }

    setLoading(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/pending`,
        data: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
        },
      },
    })
    setLoading(false)

    if (err) {
      const msg = err.message.toLowerCase()
      if (msg.includes('registered') || msg.includes('exists')) setError('Email này đã có tài khoản. Hãy đăng nhập (dùng "Quên mật khẩu" nếu quên) để xem trạng thái hoặc gửi lại yêu cầu duyệt.')
      else if (msg.includes('rate') || msg.includes('seconds')) setError('Bạn thao tác quá nhanh. Vui lòng chờ vài phút rồi thử lại.')
      else setError(err.message)
      return
    }
    // Supabase trả user không có identities khi email đã tồn tại (chế độ chống dò email)
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('Email này đã có tài khoản. Hãy đăng nhập (dùng "Quên mật khẩu" nếu quên) để xem trạng thái hoặc gửi lại yêu cầu duyệt.')
      return
    }
    if (data.session) window.location.href = '/pending'   // Không bật xác nhận email
    else setCheckMail(true)                                // Bật xác nhận email
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:56, height:56, background:'#F5A623', borderRadius:14,
            fontSize:14, fontWeight:700, color:'#0d1b3e', marginBottom:12 }}>HTE</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#e8eaf0' }}>Đăng ký tài khoản</div>
          <div style={{ fontSize:12, color:'#8899bb', marginTop:4 }}>
            Tài khoản mới cần Admin duyệt và gán vào dự án
          </div>
        </div>

        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          {checkMail ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📧</div>
              <div style={{ fontSize:13, color:'#e8eaf0', marginBottom:8, fontWeight:600 }}>Xác nhận email</div>
              <div style={{ fontSize:12, color:'#8899bb', lineHeight:1.6 }}>
                Đã gửi email xác nhận tới <b style={{ color:'#e8eaf0' }}>{form.email}</b>.<br/>
                Bấm link trong email, sau đó chờ Admin duyệt tài khoản.<br/>
                Kiểm tra cả hộp thư <b>Spam</b>.
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Họ và tên *</label>
                <input value={form.full_name} onChange={set('full_name')} required autoFocus
                  placeholder="Nguyễn Văn A" style={inputStyle}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                <div>
                  <label style={labelStyle}>Số điện thoại</label>
                  <input value={form.phone} onChange={set('phone')} placeholder="09xx xxx xxx" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Công ty / Đơn vị</label>
                  <input value={form.company} onChange={set('company')} placeholder="Thầu phụ, CĐT..." style={inputStyle}/>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={form.email} onChange={set('email')} required
                  placeholder="email@example.com" style={inputStyle}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                <div>
                  <label style={labelStyle}>Mật khẩu *</label>
                  <input type="password" value={form.password} onChange={set('password')} required
                    placeholder="Ít nhất 6 ký tự" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Nhập lại *</label>
                  <input type="password" value={form.confirm} onChange={set('confirm')} required
                    placeholder="••••••••" style={inputStyle}/>
                </div>
              </div>
              {error && (
                <div style={{ background:'#FF444420', border:'1px solid #FF4444',
                  borderRadius:7, padding:'8px 12px', fontSize:11, color:'#FF8888', marginBottom:14 }}>
                  ⚠ {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:12, background: loading ? '#ccaa66' : '#F5A623',
                  color:'#0d1b3e', border:'none', borderRadius:9, fontSize:13,
                  fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                {loading ? 'Đang đăng ký...' : 'Đăng ký'}
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#8899bb' }}>
          Đã có tài khoản? <a href="/login" style={{ color:'#F5A623', textDecoration:'none' }}>Đăng nhập</a>
        </div>
      </div>
    </div>
  )
}
