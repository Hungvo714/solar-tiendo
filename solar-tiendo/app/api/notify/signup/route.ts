import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'

// Database (trigger trên bảng profiles, qua pg_net) gọi vào đây khi có tài khoản chuyển sang "Chờ duyệt".
// Xác thực bằng mã bí mật lưu trong app_meta.notify_secret (chỉ service role đọc được).

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Thiếu SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const userId = String(body.user_id ?? '')
  const event  = body.event === 'reapply' ? 'reapply' : 'signup'

  const { data: meta } = await db.from('app_meta').select('value').eq('key', 'notify_secret').maybeSingle()
  if (!meta?.value || body.secret !== meta.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Chờ vài giây: tài khoản do Admin chính tạo sẽ được chuyển 'approved' ngay sau khi tạo → không cần báo
  await new Promise(r => setTimeout(r, 4000))

  const { data: p } = await db.from('profiles')
    .select('email, full_name, phone, company, status, created_at').eq('id', userId).maybeSingle()
  if (!p || p.status !== 'pending') return NextResponse.json({ skipped: 'không còn ở trạng thái chờ duyệt' })
  const { count: memberships } = await db.from('project_members')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if ((memberships ?? 0) > 0) return NextResponse.json({ skipped: 'đã thuộc dự án' })

  const { count: pendingTotal } = await db.from('profiles')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending')

  const title = event === 'reapply' ? 'gửi lại yêu cầu duyệt' : 'đăng ký tài khoản mới'
  const row = (k: string, v: unknown) =>
    `<tr><td style="color:#666;padding:4px 12px 4px 0">${k}</td><td style="padding:4px 0"><b>${escapeHtml(v) || '—'}</b></td></tr>`

  try {
    await sendEmail(
      `👤 ${p.full_name || p.email} vừa ${title} — Solar Tiến Độ`,
      `<p>Có người vừa <b>${title}</b> trên app Solar Tiến Độ:</p>
       <table style="font-size:14px;border-collapse:collapse">
         ${row('Họ tên', p.full_name)}${row('Email', p.email)}${row('Số điện thoại', p.phone)}${row('Công ty / Đơn vị', p.company)}
       </table>
       <p style="margin:20px 0">
         <a href="https://tiendo.sunel.vn/users" style="background:#F5A623;color:#0d1b3e;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
           Mở trang duyệt
         </a>
       </p>
       <p style="color:#666;font-size:12px">Hiện có ${pendingTotal ?? 1} tài khoản đang chờ duyệt.</p>`)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  return NextResponse.json({ sent: true })
}
