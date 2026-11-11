'use client'
// Xem trước kế hoạch thi công khi tạo dự án bằng cách sao chép
import type { PlanResult, PlanMode } from '@/lib/planCopy'
import { fmtVN, diffDays } from '@/lib/schedule'

const MODE_LABEL: Record<PlanMode, string> = {
  shift: 'Dời theo ngày bắt đầu', scale: 'Co / giãn theo ngày bắt đầu + hoàn thành', keep: 'Giữ nguyên ngày như dự án nguồn',
}

export default function PlanPreview({ plan, mode, target, srcName, busy, onBack, onCreate }: {
  plan: PlanResult; mode: PlanMode; target?: string | null; srcName: string
  busy: boolean; onBack: () => void; onCreate: () => void
}) {
  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 9.5, color: '#8899bb', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: 10.5, color: '#c8d8f0', borderTop: '1px solid #ffffff10', whiteSpace: 'nowrap' }
  const rng = (s: string | null, e: string | null) => `${fmtVN(s)} → ${fmtVN(e)}`
  const dur = (s: string | null, e: string | null) => s && e ? `${diffDays(s, e) + 1}N` : ''
  const card = (label: string, val: string, color = '#e8eaf0') => (
    <div style={{ flex: 1, minWidth: 120, background: '#ffffff08', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9.5, color: '#8899bb' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 2 }}>{val}</div>
    </div>
  )
  const late = mode === 'scale' && target && plan.end && plan.end > target

  return (
    <div onClick={() => !busy && onBack()} style={{ position: 'fixed', inset: 0, background: '#000000b0', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1b3e', border: '1px solid #ffffff20', borderRadius: 12,
        width: 'min(860px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', color: '#e8eaf0' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff12' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📅 Xem trước kế hoạch thi công</div>
          <div style={{ fontSize: 10, color: '#8899bb', marginTop: 2 }}>Sao chép từ “{srcName}” · {MODE_LABEL[mode]}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {card('Ngày bắt đầu', fmtVN(plan.start))}
            {card(mode === 'scale' ? 'Hoàn thành (tính được)' : 'Ngày hoàn thành', fmtVN(plan.end), late ? '#FF9999' : '#4ade80')}
            {mode === 'scale' && target && card('Hoàn thành mong muốn', fmtVN(target), '#fbbf24')}
            {card('Tổng thời gian', plan.totalDays ? `${plan.totalDays} ngày` : '—')}
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '10px 16px', flex: 1 }}>
          {plan.warnings.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: '#fbbf2415', border: '1px solid #fbbf2450' }}>
              {plan.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.6 }}>⚠️ {w}</div>)}
            </div>
          )}
          {plan.rows.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#8899bb', fontSize: 12 }}>Dự án nguồn chưa có ngày kế hoạch nào.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead><tr style={{ background: '#1a2d5a' }}>
                  <th style={th}>Hạng mục</th><th style={th}>Dự án nguồn</th><th style={th}>Dự án mới</th><th style={th}>Số ngày</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {plan.rows.map(r => (
                    <tr key={r.item.id} style={{ background: r.warn ? '#FF444410' : r.pushed ? '#fbbf240c' : 'transparent' }}>
                      <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>
                        <span style={{ color: '#8899bb' }}>#{r.item.no ?? r.item.stt}</span> {r.item.name}
                        {r.item.group_type === 'A' && <span style={{ fontSize: 9, color: '#60a5fa', marginLeft: 4 }}>vật tư</span>}
                      </td>
                      <td style={{ ...td, color: '#8899bb' }}>{rng(r.srcS, r.srcE)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{rng(r.s, r.e)}</td>
                      <td style={{ ...td, fontFamily: 'monospace', color: '#8899bb' }}>{dur(r.srcS, r.srcE)}{mode === 'scale' && dur(r.s, r.e) !== dur(r.srcS, r.srcE) ? ` → ${dur(r.s, r.e)}` : ''}</td>
                      <td style={{ ...td, fontSize: 9.5, whiteSpace: 'normal' }}>
                        {r.warn ? <span style={{ color: '#FF9999' }}>⚠️ {r.warn}</span>
                          : r.pushed ? <span style={{ color: '#fbbf24' }}>⤵ lùi theo điều kiện</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ fontSize: 9.5, color: '#8899bb', marginTop: 8, lineHeight: 1.6 }}>
            Vật tư: “Dự án mới” là Đặt hàng (KH) → Có hàng (KH). Thời gian gia công vật tư và số ngày chờ không bị co. Lịch tính theo ngày lịch.
            Sau khi tạo, vẫn sửa được từng ngày ở trang Tiến độ.
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #ffffff12', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onBack} disabled={busy} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #ffffff25',
            borderRadius: 8, color: '#8899bb', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>← Quay lại chỉnh</button>
          <button onClick={onCreate} disabled={busy} style={{ padding: '8px 18px', background: '#F5A623', border: 'none', borderRadius: 8,
            color: '#0d1b3e', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? '⏳ Đang tạo...' : '✓ Tạo dự án'}
          </button>
        </div>
      </div>
    </div>
  )
}
