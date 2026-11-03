'use client'
import BrandLogo from '@/components/BrandLogo'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
  borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
  fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box',
}

type Stage = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const [stage, setStage]       = useState<Stage>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [show, setShow]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    // Link trong email có lỗi (hết hạn / đã dùng) → Supabase gắn error vào URL
    const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    if (hash.get('error') || query.get('error')) { setStage('invalid'); return }

    let settled = false
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        settled = true; setStage('ready')
      }
    })

    // Trường hợp link dạng ?code=... (PKCE)
    const code = query.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        if (!err && data.session) { settled = true; setStage('ready') }
      })
    }

    // Chờ supabase-js đọc token trong URL; quá 4 giây không có phiên → link không hợp lệ
    const timer = setTimeout(async () => {
      if (settled) return
      const { data } = await supabase.auth.getSession()
      setStage(data.session ? 'ready' : 'invalid')
    }, 4000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự.'); return }
    if (password !== confirm) { setError('Hai mật khẩu không khớp.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      const msg = err.message.toLowerCase()
      if (msg.includes('different') || msg.includes('same')) {
        setError('Mật khẩu mới phải khác mật khẩu cũ.')
      } else {
        setError(err.message)
      }
      return
    }
    setStage('done')
    // Đăng xuất để người dùng đăng nhập lại bằng mật khẩu mới
    await supabase.auth.signOut()
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', marginBottom:12 }}><BrandLogo size={56} /></div>
          <div style={{ fontSize:18, fontWeight:700, color:'#e8eaf0' }}>Đặt mật khẩu mới</div>
        </div>

        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          {stage === 'checking' && (
            <div style={{ textAlign:'center', fontSize:12, color:'#8899bb' }}>Đang kiểm tra link...</div>
          )}

          {stage === 'invalid' && (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>⏰</div>
              <div style={{ fontSize:13, color:'#e8eaf0', marginBottom:8, fontWeight:600 }}>
                Link đã hết hạn hoặc đã được sử dụng
              </div>
              <div style={{ fontSize:12, color:'#8899bb', marginBottom:16 }}>
                Vui lòng yêu cầu gửi lại link mới.
              </div>
              <a href="/forgot-password"
                style={{ display:'inline-block', padding:'10px 16px', background:'#F5A623',
                  color:'#0d1b3e', borderRadius:9, fontSize:13, fontWeight:700, textDecoration:'none' }}>
                Gửi lại link
              </a>
            </div>
          )}

          {stage === 'done' && (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:13, color:'#e8eaf0', marginBottom:16, fontWeight:600 }}>
                Đã đổi mật khẩu thành công
              </div>
              <a href="/login"
                style={{ display:'inline-block', padding:'10px 16px', background:'#F5A623',
                  color:'#0d1b3e', borderRadius:9, fontSize:13, fontWeight:700, textDecoration:'none' }}>
                Đăng nhập
              </a>
            </div>
          )}

          {stage === 'ready' && (
            <form onSubmit={submit}>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }}>Mật khẩu mới</label>
                <input type={show ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} required autoFocus
                  placeholder="Ít nhất 6 ký tự" style={inputStyle}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }}>Nhập lại mật khẩu mới</label>
                <input type={show ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)} required
                  placeholder="••••••••" style={inputStyle}/>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11,
                color:'#8899bb', marginBottom:16, cursor:'pointer' }}>
                <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/>
                Hiện mật khẩu
              </label>
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
                {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
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
