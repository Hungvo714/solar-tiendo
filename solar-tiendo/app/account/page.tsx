'use client'
// Tài khoản của tôi: cập nhật thông tin cá nhân + đổi mật khẩu (mọi người dùng)
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

const inp: React.CSSProperties = {
  width: '100%', background: '#0a0f1e', border: '1px solid #ffffff20', borderRadius: 8,
  padding: '10px 12px', color: '#e8eaf0', fontFamily: 'inherit', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 11, color: '#8899bb', marginBottom: 4, display: 'block' }
const card: React.CSSProperties = { background: '#0d1b3e', border: '1px solid #ffffff15', borderRadius: 12, padding: 18, marginBottom: 14 }
const btn = (bg: string, c: string): React.CSSProperties => ({
  padding: '10px 18px', background: bg, border: 'none', borderRadius: 9, color: c,
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
})
const msg = (ok: boolean): React.CSSProperties => ({
  marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
  background: ok ? '#4ade8015' : '#FF444418', border: `1px solid ${ok ? '#4ade8050' : '#FF444455'}`, color: ok ? '#4ade80' : '#FF9999',
})

export default function AccountPage() {
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoMsg, setInfoMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; t: string } | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUid(user.id); setEmail(user.email ?? '')
      const { data: p } = await supabase.from('profiles').select('full_name, phone, company').eq('id', user.id).maybeSingle()
      setFullName(p?.full_name ?? ''); setPhone(p?.phone ?? ''); setCompany(p?.company ?? '')
      setLoading(false)
    })()
  }, [])

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault(); setInfoMsg(null)
    if (!fullName.trim()) { setInfoMsg({ ok: false, t: 'Vui lòng nhập họ tên.' }); return }
    if (phone.trim() && !/^[0-9+ .()-]{8,15}$/.test(phone.trim())) { setInfoMsg({ ok: false, t: 'Số điện thoại không hợp lệ.' }); return }
    setSavingInfo(true)
    const { error } = await supabase.rpc('update_profile', { target_user: uid, p_full_name: fullName, p_phone: phone, p_company: company })
    setSavingInfo(false)
    setInfoMsg(error ? { ok: false, t: 'Lỗi: ' + error.message } : { ok: true, t: '✅ Đã lưu thông tin.' })
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(null)
    if (!cur) { setPwMsg({ ok: false, t: 'Nhập mật khẩu hiện tại.' }); return }
    if (pw.length < 6) { setPwMsg({ ok: false, t: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }); return }
    if (pw !== pw2) { setPwMsg({ ok: false, t: 'Hai mật khẩu mới không khớp.' }); return }
    if (pw === cur) { setPwMsg({ ok: false, t: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }); return }
    setSavingPw(true)
    // Xác nhận mật khẩu hiện tại trước khi đổi
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: cur })
    if (e1) { setSavingPw(false); setPwMsg({ ok: false, t: 'Mật khẩu hiện tại không đúng.' }); return }
    const { error: e2 } = await supabase.auth.updateUser({ password: pw })
    setSavingPw(false)
    if (e2) { setPwMsg({ ok: false, t: 'Lỗi: ' + e2.message }); return }
    setCur(''); setPw(''); setPw2('')
    setPwMsg({ ok: true, t: '✅ Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', color: '#e8eaf0', fontFamily: 'system-ui,sans-serif', fontSize: 13 }}>
      <header style={{ background: 'linear-gradient(135deg,#0d1b3e,#1a2d5a)', padding: '14px 20px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #ffffff12', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandLogo size={36} onClick={() => window.location.href = '/projects'} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Tài khoản của tôi</div>
            <div style={{ fontSize: 10, color: '#8899bb' }}>{email}</div>
          </div>
        </div>
        <button onClick={() => window.location.href = '/projects'}
          style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent',
            border: '1px solid #ffffff20', color: '#8899bb', fontFamily: 'inherit' }}>← Dự án</button>
      </header>

      <main style={{ maxWidth: 520, margin: '0 auto', padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#8899bb' }}>Đang tải...</div>
        ) : (<>
          <form onSubmit={saveInfo} style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F5A623', marginBottom: 14 }}>👤 Thông tin cá nhân</div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Email (dùng để đăng nhập)</label>
              <input value={email} disabled style={{ ...inp, opacity: 0.6 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Họ và tên *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} style={inp} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Số điện thoại</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Công ty</label>
              <input value={company} onChange={e => setCompany(e.target.value)} style={inp} />
            </div>
            <button type="submit" disabled={savingInfo} style={btn('#F5A623', '#0d1b3e')}>{savingInfo ? 'Đang lưu…' : 'Lưu thông tin'}</button>
            {infoMsg && <div style={msg(infoMsg.ok)}>{infoMsg.t}</div>}
          </form>

          <form onSubmit={changePw} style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 14 }}>🔒 Đổi mật khẩu</div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Mật khẩu hiện tại</label>
              <input type={show ? 'text' : 'password'} value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" style={inp} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Mật khẩu mới (ít nhất 6 ký tự)</label>
              <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" style={inp} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Nhập lại mật khẩu mới</label>
              <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" style={inp} />
            </div>
            <label style={{ fontSize: 11, color: '#8899bb', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Hiện mật khẩu
            </label>
            <button type="submit" disabled={savingPw} style={btn('#1565C0', '#fff')}>{savingPw ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
            {pwMsg && <div style={msg(pwMsg.ok)}>{pwMsg.t}</div>}
            <div style={{ fontSize: 10, color: '#8899bb', marginTop: 10 }}>
              Quên mật khẩu hiện tại? Đăng xuất rồi bấm “Quên mật khẩu” ở trang đăng nhập.
            </div>
          </form>
        </>)}
      </main>
    </div>
  )
}
