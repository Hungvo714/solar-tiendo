// Gửi email qua Resend (dùng chung cho cron và thông báo)
// Biến môi trường: RESEND_API_KEY (bắt buộc), ALERT_EMAIL, ALERT_FROM (tuỳ chọn)
export async function sendEmail(
  subject: string,
  html: string,
  attachments?: { filename: string; content: string }[],
) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Chưa cấu hình RESEND_API_KEY')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || 'Solar Tiến Độ <onboarding@resend.dev>',
      to: [process.env.ALERT_EMAIL || 'vn.hung714@gmail.com'],
      subject, html, attachments,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!))
