import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solar Tiến Độ — HTE',
  description: 'Theo dõi tiến độ thi công điện mặt trời',
  themeColor: '#0a0f1e',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

const RELOAD_ON_STALE = `(function(){
  var KEY='stale-reload-at';
  function reloadOnce(){
    try{ var t=+sessionStorage.getItem(KEY)||0; if(Date.now()-t<30000) return; sessionStorage.setItem(KEY,String(Date.now())); }catch(e){}
    location.reload();
  }
  window.addEventListener('error',function(e){
    var el=e&&e.target; var src=el&&(el.src||el.href)||'';
    if(src.indexOf('/_next/')>=0) reloadOnce();
    var m=(e&&e.message)||''; if(/ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(m)) reloadOnce();
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason; var m=(r&&(r.name+' '+r.message))||String(r||'');
    if(/ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module/i.test(m)) reloadOnce();
  });
})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"/>
        {/* Tự tải lại 1 lần khi trang đang mở là bản cũ (file chạy đã đổi sau khi cập nhật app) */}
        <script dangerouslySetInnerHTML={{ __html: RELOAD_ON_STALE }}/>
      </head>
      <body>{children}</body>
    </html>
  )
}
