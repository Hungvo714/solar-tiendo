'use client'
// Lỗi trong trang: nếu do bản cũ (file chạy đã đổi sau khi cập nhật) → tự tải lại 1 lần;
// lỗi khác → hiện thông báo thân thiện + nút tải lại
import { useEffect } from 'react'

const isStale = (e: any) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module/i.test(`${e?.name} ${e?.message}`)

export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    if (!isStale(error)) return
    try {
      const t = Number(sessionStorage.getItem('stale-reload-at') || 0)
      if (Date.now() - t < 30000) return
      sessionStorage.setItem('stale-reload-at', String(Date.now()))
    } catch {}
    window.location.reload()
  }, [error])
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', color: '#8899bb', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'system-ui,sans-serif', padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>Trang chưa tải được</div>
      <div style={{ fontSize: 12 }}>Có thể do mạng yếu hoặc ứng dụng vừa được cập nhật.</div>
      <button onClick={() => window.location.reload()} style={{ marginTop: 6, padding: '10px 20px', borderRadius: 10, border: 'none',
        background: '#F5A623', color: '#0d1b3e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🔄 Tải lại trang</button>
    </div>
  )
}
