'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PendingPage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'loading'|'pending'|'rejected'>('loading')

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
        .select('status').eq('id', session.user.id).maybeSingle()
      setStatus(prof?.status === 'rejected' ? 'rejected' : 'pending')
    }
    check()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0a0f1e', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380, textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
          width:56, height:56, background:'#F5A623', borderRadius:14,
          fontSize:14, fontWeight:700, color:'#0d1b3e', marginBottom:16 }}>HTE</div>

        <div style={{ background:'#0d1b3e', border:'1px solid #ffffff12', borderRadius:14, padding:24 }}>
          {status === 'loading' && <div style={{ fontSize:12, color:'#8899bb' }}>Đang kiểm tra...</div>}

          {status === 'pending' && (<>
            <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
            <div style={{ fontSize:14, color:'#e8eaf0', fontWeight:700, marginBottom:8 }}>
              Tài khoản đang chờ duyệt
            </div>
            <div style={{ fontSize:12, color:'#8899bb', lineHeight:1.6, marginBottom:16 }}>
              <b style={{ color:'#e8eaf0' }}>{email}</b> đã đăng ký thành công.<br/>
              Admin sẽ duyệt và gán bạn vào dự án. Sau đó bạn đăng nhập lại là vào được.
            </div>
            <button onClick={() => window.location.reload()}
              style={{ padding:'10px 16px', background:'#F5A623', color:'#0d1b3e', border:'none',
                borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginRight:8 }}>
              Kiểm tra lại
            </button>
          </>)}

          {status === 'rejected' && (<>
            <div style={{ fontSize:32, marginBottom:8 }}>🚫</div>
            <div style={{ fontSize:14, color:'#e8eaf0', fontWeight:700, marginBottom:8 }}>
              Yêu cầu chưa được chấp nhận
            </div>
            <div style={{ fontSize:12, color:'#8899bb', marginBottom:16 }}>
              Liên hệ quản trị viên để được hỗ trợ.
            </div>
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
