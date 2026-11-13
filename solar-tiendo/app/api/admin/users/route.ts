import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Thao tác tài khoản chỉ dành cho Admin chính (bảng app_admins).
// Cần biến môi trường SUPABASE_SERVICE_ROLE_KEY trên Vercel (KHÔNG có tiền tố NEXT_PUBLIC_).
//   action = 'create'       { email, password, fullName?, phone?, company?, projectId?, role? }
//   action = 'set_password' { userId, password }
//   action = 'delete'       { userId }

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
const ROLES = ['admin', 'editor', 'viewer']
const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: Request) {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return err('Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY. Thêm biến này trên Vercel rồi Redeploy.', 500)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Không để Next.js lưu đệm kết quả truy vấn (trước đây cron đọc mãi kết quả cũ từ lần chạy đầu)
    global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
  })

  // 1) Xác thực người gọi + kiểm tra là Admin chính
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return err('Chưa đăng nhập', 401)
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller.user) return err('Phiên đăng nhập không hợp lệ', 401)
  const { data: sa } = await admin.from('app_admins').select('user_id').eq('user_id', caller.user.id).maybeSingle()
  if (!sa) return err('Chỉ Admin chính mới thực hiện được', 403)

  let body: any
  try { body = await req.json() } catch { return err('Dữ liệu không hợp lệ') }
  const action = String(body.action ?? '')

  // ---- Tạo tài khoản ----
  if (action === 'create') {
    const email    = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const role     = String(body.role ?? 'editor')
    const projectId = body.projectId ? String(body.projectId) : null
    const fullName = body.fullName ? String(body.fullName).trim() : null
    const phone    = body.phone ? String(body.phone).trim() : null
    const company  = body.company ? String(body.company).trim() : null
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('Email không hợp lệ')
    if (password.length < 6) return err('Mật khẩu phải có ít nhất 6 ký tự')
    if (projectId && !ROLES.includes(role)) return err('Vai trò không hợp lệ')

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, phone, company },
    })
    if (cErr || !created.user) {
      const msg = cErr?.message ?? 'Không tạo được tài khoản'
      return err(/already|registered|exists/i.test(msg) ? 'Email này đã có tài khoản' : msg, 409)
    }
    const uid = created.user.id
    await admin.from('profiles').upsert({ id: uid, email, full_name: fullName, phone, company, status: 'approved' })
    if (projectId) {
      const { error: mErr } = await admin.from('project_members')
        .upsert({ project_id: projectId, user_id: uid, role }, { onConflict: 'project_id,user_id' })
      if (mErr) return err('Đã tạo tài khoản nhưng lỗi gán dự án: ' + mErr.message, 500)
    }
    return NextResponse.json({ userId: uid, email })
  }

  const userId = String(body.userId ?? '')
  if (!userId) return err('Thiếu userId')

  // ---- Đặt mật khẩu mới ----
  if (action === 'set_password') {
    const password = String(body.password ?? '')
    if (password.length < 6) return err('Mật khẩu phải có ít nhất 6 ký tự')
    const { error: e } = await admin.auth.admin.updateUserById(userId, { password })
    if (e) return err(e.message)
    return NextResponse.json({ ok: true })
  }

  // ---- Xoá tài khoản ----
  if (action === 'delete') {
    if (userId === caller.user.id) return err('Không thể tự xoá tài khoản Admin chính của mình')
    await admin.from('project_members').delete().eq('user_id', userId)
    const { error: e } = await admin.auth.admin.deleteUser(userId)
    if (e) return err(e.message)
    return NextResponse.json({ ok: true })
  }

  return err('Thao tác không hợp lệ')
}
