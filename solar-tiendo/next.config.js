/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Trang HTML luôn tải bản mới (Zalo / trình duyệt điện thoại hay giữ bản cũ → sau mỗi lần cập nhật
  // sẽ gọi file chạy cũ không còn tồn tại → lỗi trang). File tĩnh /_next/ vẫn được cache bình thường.
  async headers() {
    const noStore = [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }]
    const pages = ['/', '/login', '/register', '/pending', '/forgot-password', '/reset-password', '/account',
      '/projects', '/users', '/items', '/dashboard', '/progress', '/gantt', '/report']
    return [
      { source: '/view/:id', headers: noStore },              // link CĐT
      ...pages.map(source => ({ source, headers: noStore })),
    ]
  },
}
module.exports = nextConfig
