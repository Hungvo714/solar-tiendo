'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()

  const [noAccess, setNoAccess] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('msg') === 'no-access') setNoAccess(true)
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false) }
    else { router.push('/dashboard'); router.refresh() }
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:56, height:56, background:'#F5A623', borderRadius:14,
            fontSize:14, fontWeight:700, color:'#0d1b3e', marginBottom:12 }}>HTE</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#e8eaf0' }}>Solar Tiến Độ</div>
          <div style={{ fontSize:12, color:'#8899bb', marginTop:4 }}>
            Hệ thống theo dõi tiến độ thi công
          </div>
        </div>
        <form onSubmit={login} style={{ background:'#0d1b3e',
          border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="email@example.com"
              style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
                fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#8899bb', display:'block', marginBottom:6 }}>Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width:'100%', background:'#0a0f1e', border:'1px solid #ffffff20',
                borderRadius:8, padding:'10px 12px', color:'#e8eaf0',
                fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
          </div>
          {noAccess && (
            <div style={{ background:'#FF444420', border:'1px solid #FF4444',
              borderRadius:7, padding:'10px 12px', fontSize:11, color:'#FF8888', marginBottom:14,
              textAlign:'center' }}>
              🚫 Tài khoản của bạn không còn quyền truy cập.<br/>
              <span style={{ fontSize:10 }}>Liên hệ quản trị viên để được hỗ trợ.</span>
            </div>
          )}
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
            {loading ? 'Đang đăng nhập...' : '🔐 Đăng nhập'}
          </button>
        </form>
        <div style={{ textAlign:'center', marginTop:16, fontSize:11, color:'#8899bb' }}>
          Chưa có tài khoản? Liên hệ quản trị viên.
        </div>
      </div>
    </div>
  )
}
