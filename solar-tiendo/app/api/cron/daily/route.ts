import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gzipSync } from 'zlib'
import { sendEmail } from '@/lib/email'

// Tác vụ tự động chạy mỗi ngày (Vercel Cron, cấu hình trong vercel.json):
//  1) Giữ database hoạt động (tránh Supabase gói Free tự tạm dừng)
//  2) Nếu 7 ngày không có hoạt động của người dùng → gửi email cảnh báo (mỗi đợt 1 lần)
//  3) Thứ Hai: gửi email kèm file backup toàn bộ dữ liệu
//
// Biến môi trường cần có trên Vercel:
//   SUPABASE_SERVICE_ROLE_KEY  (đã có)
//   CRON_SECRET                chuỗi bí mật bất kỳ — Vercel tự gửi kèm khi gọi cron
//   RESEND_API_KEY             khoá Resend để gửi email
//   ALERT_EMAIL                (tuỳ chọn) email nhận, mặc định vn.hung714@gmail.com
//   ALERT_FROM                 (tuỳ chọn) người gửi, mặc định "Solar Tiến Độ <onboarding@resend.dev>"

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const INACTIVE_DAYS = 7
const BACKUP_TABLES = [
  'projects', 'project_members', 'profiles', 'app_admins',
  'progress', 'gantt_dates', 'sub_items', 'project_item_settings',
  'weekly_reports', 'risk_log',
  'labor_allocation', 'labor_productivity', 'project_labor_days',
  'items', 'steps', 'zones', 'item_dependencies',
]

const vnDate = (d: Date) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
const vnDay  = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })   // YYYY-MM-DD

export async function GET(req: Request) {
  // Chỉ Vercel Cron (hoặc người có CRON_SECRET) được gọi
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Thiếu SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Không để Next.js lưu đệm kết quả truy vấn (trước đây cron đọc mãi kết quả cũ từ lần chạy đầu)
    global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
  })

  const reqUrl = new URL(req.url)
  const forceBackup = reqUrl.searchParams.get('backup') === '1'
  const forceAlert  = reqUrl.searchParams.get('alert') === '1'
  const now = new Date()
  const report: Record<string, any> = { at: now.toISOString() }

  const getMeta = async (k: string) =>
    (await db.from('app_meta').select('value').eq('key', k).maybeSingle()).data?.value ?? null
  const setMeta = (k: string, v: string) =>
    db.from('app_meta').upsert({ key: k, value: v, updated_at: now.toISOString() })

  // 1) Giữ database hoạt động
  const { count, error: pingErr } = await db.from('projects').select('id', { count: 'exact', head: true })
  report.keepalive = pingErr ? `lỗi: ${pingErr.message}` : `ok (${count} dự án)`
  await setMeta('last_keepalive', now.toISOString())

  // 2) Cảnh báo không hoạt động
  try {
    const { data: last } = await db.rpc('last_user_activity')
    const lastAt = last ? new Date(last as string) : null
    const idleDays = lastAt ? (now.getTime() - lastAt.getTime()) / 86400000 : Infinity
    report.last_activity = lastAt?.toISOString() ?? null
    report.idle_days = Math.floor(idleDays)

    const alertedFor = await getMeta('inactivity_alert_for')   // = mốc hoạt động đã cảnh báo
    const marker = lastAt?.toISOString() ?? 'never'
    if (forceAlert || (idleDays >= INACTIVE_DAYS && alertedFor !== marker)) {
      await sendEmail(
        `⚠️ Solar Tiến Độ: ${Math.floor(idleDays)} ngày không có hoạt động`,
        `<p>Chào anh,</p>
         <p>App <b>Solar Tiến Độ</b> (tiendo.sunel.vn) đã <b>${Math.floor(idleDays)} ngày</b> không có ai đăng nhập hoặc cập nhật dữ liệu.</p>
         <p>Hoạt động gần nhất: <b>${lastAt ? vnDate(lastAt) : 'chưa có'}</b></p>
         <p>Database vẫn đang được giữ hoạt động tự động mỗi ngày, nên <b>chưa bị tạm dừng</b>.
            Email này để anh nắm tình hình: kiểm tra xem đội thi công có đang cập nhật tiến độ không.</p>
         <p>Mở app: <a href="https://tiendo.sunel.vn">https://tiendo.sunel.vn</a></p>`)
      if (!forceAlert) await setMeta('inactivity_alert_for', marker)
      report.alert = 'đã gửi'
    } else {
      report.alert = idleDays >= INACTIVE_DAYS ? 'đã cảnh báo đợt này rồi' : 'không cần'
    }
  } catch (e: any) { report.alert = `lỗi: ${e.message}` }

  // 3) Backup hằng tuần (thứ Hai giờ VN), mỗi ngày tối đa 1 lần
  try {
    const weekday = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getDay()
    const today = vnDay(now)
    const lastBackupDay = await getMeta('last_backup_day')
    if (forceBackup || (weekday === 1 && lastBackupDay !== today)) {
      const dump: Record<string, any> = { exported_at: now.toISOString(), tables: {} }
      const counts: string[] = []
      for (const t of BACKUP_TABLES) {
        const rows: any[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await db.from(t).select('*').range(from, from + 999)
          if (error) { dump.tables[t] = { error: error.message }; break }
          rows.push(...(data ?? []))
          if (!data || data.length < 1000) break
        }
        if (!dump.tables[t]) dump.tables[t] = rows
        counts.push(`<tr><td>${t}</td><td style="text-align:right">${rows.length}</td></tr>`)
      }
      const gz = gzipSync(Buffer.from(JSON.stringify(dump)))
      const filename = `solar-tiendo-backup-${today}.json.gz`
      await sendEmail(
        `💾 Backup Solar Tiến Độ ${today}`,
        `<p>File đính kèm là bản sao lưu toàn bộ dữ liệu app Solar Tiến Độ ngày <b>${today}</b>.</p>
         <p>Giữ email này. Khi cần khôi phục, gửi file cho người hỗ trợ kỹ thuật.</p>
         <table cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr><th align="left">Bảng</th><th>Số dòng</th></tr>${counts.join('')}</table>`,
        [{ filename, content: gz.toString('base64') }])
      if (!forceBackup) await setMeta('last_backup_day', today)
      report.backup = `đã gửi ${filename} (${Math.round(gz.length / 1024)} KB)`
    } else {
      report.backup = 'không phải ngày backup'
    }
  } catch (e: any) { report.backup = `lỗi: ${e.message}` }

  return NextResponse.json(report)
}
