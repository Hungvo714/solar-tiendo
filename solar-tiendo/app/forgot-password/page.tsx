'use client'
import BrandLogo from '@/components/BrandLogo'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
  borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
  fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box',
}

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) {
      const msg = err.message.toLowerCase()
      if (msg.includes('rate') || msg.includes('seconds')) {
        setError('Bạn vừa yêu cầu quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.')
      } else {
        setError(err.message)
      }
      return
    }
    // Luôn báo thành công để không lộ email nào có tài khoản
    setSent(true)
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', marginBottom:12 }}><BrandLogo size={56} /></div>
          <div style={{ fontSize:18, fontWeight:700, color:'#e8eaf0' }}>Quên mật khẩu</div>
          <div style={{ fontSize:12, color:'#8899bb', marginTop:4 }}>
            Nhập email đăng nhập để nhận link đặt lại mật khẩu
          </div>
        </div>

        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          {sent ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📧</div>
              <div style={{ fontSize:13, color:'#e8eaf0', marginBottom:8, fontWeight:600 }}>
                Đã gửi yêu cầu
              </div>
              <div style={{ fontSize:12, color:'#8899bb', lineHeight:1.6 }}>
                Nếu <b style={{ color:'#e8eaf0' }}>{email}</b> có tài khoản, bạn sẽ nhận được email
                chứa link đặt lại mật khẩu trong vài phút.<br/>
                Kiểm tra cả hộp thư <b>Spam / Quảng cáo</b>.
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="email@example.com" autoFocus style={inputStyle}/>
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
                {loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:16, fontSize:12 }}>
          <a href="/login" style={{ color:'#F5A623', textDecoration:'none' }}>← Quay lại đăng nhập</a>
        </div>
      </div>
    </div>
  )
}
