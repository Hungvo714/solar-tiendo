import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin tạo tài khoản cho người khác (chạy phía máy chủ, dùng service role key).
// Yêu cầu biến môi trường SUPABASE_SERVICE_ROLE_KEY trên Vercel (KHÔNG có tiền tố NEXT_PUBLIC_).

export const dynamic = 'force-dynamic'

const ROLES = ['admin', 'editor', 'viewer']

export async function POST(req: Request) {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY. Thêm biến này trên Vercel rồi Redeploy.' },
      { status: 500 })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1) Xác thực người gọi
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller.user) return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })

  // 2) Đọc dữ liệu
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 }) }
  const email     = String(body.email ?? '').trim().toLowerCase()
  const password  = String(body.password ?? '')
  const projectId = String(body.projectId ?? '')
  const role      = String(body.role ?? 'editor')
  const fullName  = body.fullName ? String(body.fullName).trim() : null

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
  if (password.length < 6)          return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 })
  if (!ROLES.includes(role))        return NextResponse.json({ error: 'Vai trò không hợp lệ' }, { status: 400 })
  if (!projectId)                   return NextResponse.json({ error: 'Thiếu dự án' }, { status: 400 })

  // 3) Người gọi phải là Admin của dự án này
  const { data: me } = await admin.from('project_members').select('role')
    .eq('project_id', projectId).eq('user_id', caller.user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Bạn không phải Admin của dự án này' }, { status: 403 })

  // 4) Tạo tài khoản (đã xác nhận email, đăng nhập được ngay)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, status: 'approved' },
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Không tạo được tài khoản'
    const exists = /already|registered|exists/i.test(msg)
    return NextResponse.json(
      { error: exists ? 'Email này đã có tài khoản. Dùng ô "Thêm thành viên" (để trống mật khẩu) để gán vào dự án.' : msg },
      { status: exists ? 409 : 400 })
  }

  // 5) Gán vào dự án + đánh dấu đã duyệt
  const uid = created.user.id
  const { error: memErr } = await admin.from('project_members')
    .upsert({ project_id: projectId, user_id: uid, role }, { onConflict: 'project_id,user_id' })
  if (memErr) return NextResponse.json({ error: 'Đã tạo tài khoản nhưng lỗi gán dự án: ' + memErr.message }, { status: 500 })
  await admin.from('profiles').upsert({ id: uid, email, full_name: fullName, status: 'approved' })

  return NextResponse.json({ userId: uid, email })
}
