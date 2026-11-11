'use client'
// Lỗi ở mức toàn app (kể cả layout) — tự tải lại 1 lần nếu do bản cũ
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error; reset: () => void }) {
  useEffect(() => {
    if (!/ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module/i.test(`${error?.name} ${error?.message}`)) return
    try {
      const t = Number(sessionStorage.getItem('stale-reload-at') || 0)
      if (Date.now() - t < 30000) return
      sessionStorage.setItem('stale-reload-at', String(Date.now()))
    } catch {}
    window.location.reload()
  }, [error])
  return (
    <html lang="vi">
      <body style={{ margin: 0, minHeight: '100vh', background: '#0a0f1e', color: '#8899bb', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'system-ui,sans-serif', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>Trang chưa tải được</div>
        <div style={{ fontSize: 12 }}>Có thể do mạng yếu hoặc ứng dụng vừa được cập nhật.</div>
        <button onClick={() => window.location.reload()} style={{ marginTop: 6, padding: '10px 20px', borderRadius: 10, border: 'none',
          background: '#F5A623', color: '#0d1b3e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🔄 Tải lại trang</button>
      </body>
    </html>
  )
}
