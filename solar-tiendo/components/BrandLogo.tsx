// Logo dùng chung cho toàn app (header, đăng nhập, báo cáo in) — một kiểu duy nhất
export default function BrandLogo({ size = 36, onClick, title = 'Danh sách dự án' }:
  { size?: number; onClick?: () => void; title?: string }) {
  const r = Math.round(size * 0.24)
  return (
    <div onClick={onClick} title={onClick ? title : undefined}
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(145deg, #A0189F 0%, #7A0F86 55%, #520A63 100%)',
        boxShadow: '0 1px 0 #ffffff26 inset, 0 2px 6px #00000055',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any,
      }}>
      <span style={{
        color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.33), letterSpacing: size * 0.012,
        fontFamily: "'Inter','Segoe UI',Roboto,Arial,sans-serif", lineHeight: 1, marginTop: -size * 0.04,
      }}>HTE</span>
      {/* vạch nắng */}
      <span style={{
        position: 'absolute', left: '22%', right: '22%', bottom: Math.round(size * 0.17),
        height: Math.max(2, Math.round(size * 0.06)), borderRadius: 2,
        background: 'linear-gradient(90deg, #F5A623, #FFD166)',
      }} />
    </div>
  )
}
