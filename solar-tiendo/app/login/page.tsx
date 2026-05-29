'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'var(--bg)', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:56, height:56, background:'#F5A623', borderRadius:14,
            fontSize:14, fontWeight:700, color:'#0d1b3e', marginBottom:12 }}>HTE</div>
          <div style={{ fontSize:18, fontWeight:700 }}>Solar Tiến Độ</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
            Hệ thống theo dõi tiến độ thi công
          </div>
        </div>
        <form onSubmit={login} style={{ background:'#0d1b3e',
          border:'1px solid var(--border)', borderRadius:14, padding:24 }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:8, padding:'10px 12px', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:8, padding:'10px 12px', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none' }}/>
          </div>
          {error && <div style={{ background:'#FF444420', border:'1px solid #FF4444',
            borderRadius:7, padding:'8px 12px', fontSize:11, color:'#FF8888', marginBottom:14 }}>
            ⚠ {error}</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:12, background:'#F5A623', color:'#0d1b3e',
              border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {loading ? 'Đang đăng nhập...' : '🔐 Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
