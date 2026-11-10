// Xuất / nhập Excel DANH SÁCH VẬT TƯ của dự án (sub_items của các hạng mục vật tư nhóm A)
// Cột A, B (mã) ẩn — dùng để khớp dòng khi nhập lại. Dòng mới: để trống mã, chọn "Hạng mục vật tư".
import type ExcelJSType from 'exceljs'

const SHEET = 'Vật tư'
export const COLS = ['Mã vật tư', 'Mã hạng mục', 'Hạng mục vật tư', 'Tên vật tư', 'Đơn vị', 'Số lượng', 'Ngày cần (dd/mm/yyyy)', 'Ghi chú']

const itemLabel = (it: any) => `#${it.no ?? it.stt} ${it.name}`
// Tên file không dấu (một số trình duyệt đổi tên file có dấu thành "download")
const safeName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9 _.,()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

async function excel(): Promise<typeof ExcelJSType> {
  const m: any = await import('exceljs')
  return m.default ?? m
}

export async function exportMaterialsXlsx(projectName: string, matItems: any[], subItems: Record<string, any[]>) {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Solar Tiến Độ'
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }] })
  ws.columns = [
    { key: 'id', width: 10, hidden: true }, { key: 'item_id', width: 10, hidden: true },
    { key: 'item', width: 34 }, { key: 'name', width: 34 }, { key: 'unit', width: 10 },
    { key: 'qty', width: 12 }, { key: 'need', width: 20 }, { key: 'note', width: 34 },
  ]
  const head = ws.addRow(COLS)
  head.height = 22
  head.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  // Danh sách hạng mục (sheet phụ) cho ô chọn
  const ls = wb.addWorksheet('DS', { state: 'veryHidden' })
  matItems.forEach((it, i) => { ls.getCell(i + 1, 1).value = itemLabel(it) })

  let r = 1
  for (const it of matItems) {
    const subs = subItems[it.id] ?? []
    const rows = subs.length ? subs : [null]           // hạng mục chưa có vật tư: 1 dòng trống để điền
    for (const s of rows) {
      const row = ws.addRow({
        id: s?.id ?? '', item_id: it.id, item: itemLabel(it),
        name: s?.name ?? '', unit: s?.unit ?? '',
        qty: s?.quantity != null ? Number(s.quantity) : null,
        need: s?.need_date ? toDate(s.need_date) : null, note: s?.note ?? '',
      })
      r++
      if (r % 2 === 0) row.eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } }
      })
    }
  }
  // Thêm 30 dòng trống cho vật tư mới
  for (let i = 0; i < 30; i++) ws.addRow({})
  const last = ws.rowCount
  for (let i = 2; i <= last; i++) {
    ws.getCell(i, 3).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`DS!$A$1:$A$${Math.max(1, matItems.length)}`],
      showErrorMessage: true, errorTitle: 'Hạng mục', error: 'Chọn hạng mục vật tư trong danh sách',
    }
    ws.getCell(i, 6).numFmt = '#,##0.##'
    ws.getCell(i, 6).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
      showErrorMessage: true, error: 'Số lượng phải là số ≥ 0' }
    ws.getCell(i, 7).numFmt = 'dd/mm/yyyy'
    for (const col of [3, 4, 5, 6, 7, 8]) ws.getCell(i, col).border = {
      top: { style: 'hair', color: { argb: 'FFD0D7E2' } }, bottom: { style: 'hair', color: { argb: 'FFD0D7E2' } },
      left: { style: 'hair', color: { argb: 'FFD0D7E2' } }, right: { style: 'hair', color: { argb: 'FFD0D7E2' } },
    }
  }

  const guide = wb.addWorksheet('Hướng dẫn')
  guide.getColumn(1).width = 110
  ;[
    'HƯỚNG DẪN ĐIỀN DANH SÁCH VẬT TƯ',
    '',
    '1. Sửa trực tiếp Tên vật tư, Đơn vị, Số lượng, Ngày cần, Ghi chú ở sheet "Vật tư".',
    '2. Thêm vật tư mới: điền vào dòng trống phía dưới, CHỌN "Hạng mục vật tư" trong danh sách thả xuống, nhập Tên vật tư.',
    '3. Không sửa / xoá các cột ẩn A, B (mã dùng để khớp dữ liệu). Có thể chèn dòng hoặc sắp xếp lại thoải mái.',
    '4. Xoá một dòng trong file KHÔNG xoá vật tư trên app (để tránh mất dữ liệu) — muốn xoá thì xoá trên app.',
    '5. Lưu file, rồi vào app → Tiến độ → "⬆️ Nhập Excel vật tư", xem trước thay đổi rồi bấm Áp dụng.',
    '',
    `Dự án: ${projectName} — xuất lúc ${new Date().toLocaleString('vi-VN')}`,
  ].forEach((t, i) => { const c = guide.getCell(i + 1, 1); c.value = t; if (i === 0) c.font = { bold: true, size: 13 } })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Vat tu - ${safeName(projectName)}.xlsx`
  a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 3000)
}

// ---------- Nhập ----------
export type MatUpdate = { id: string; item: any; before: any; after: { name: string; unit: string | null; quantity: number | null; need_date: string | null; note: string | null } }
export type MatInsert = { item: any; row: number; after: MatUpdate['after'] }
export type MatImport = { updates: MatUpdate[]; inserts: MatInsert[]; errors: string[]; unchanged: number }

function toDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
function cellText(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result)
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('')
    if ('text' in v) return String(v.text)
    if (v instanceof Date) return v.toISOString()
  }
  return String(v).trim()
}
function parseNum(v: any): number | null | 'bad' {
  if (v == null || v === '') return null
  if (typeof v === 'object' && v && 'result' in v) v = v.result
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/\s/g, '')
  if (!s) return null
  // 3.600 / 3,600 / 3.600,5 / 3600.5
  let t = s
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '')
  else t = t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(t)
  return isFinite(n) ? n : 'bad'
}
function parseDate(v: any): string | null | 'bad' {
  if (v == null || v === '') return null
  if (typeof v === 'object' && v && 'result' in v) v = v.result
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return 'bad'
}
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

export async function parseMaterialsXlsx(file: File, matItems: any[], subItems: Record<string, any[]>): Promise<MatImport> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0]
  if (!ws) throw new Error('Không tìm thấy sheet "Vật tư" trong file')

  const itemById: Record<string, any> = Object.fromEntries(matItems.map(i => [i.id, i]))
  const itemByLabel: Record<string, any> = {}
  for (const it of matItems) { itemByLabel[norm(itemLabel(it))] = it; itemByLabel[norm(it.name)] ??= it }
  const subById: Record<string, any> = {}
  for (const it of matItems) for (const s of subItems[it.id] ?? []) subById[s.id] = { ...s, _item: it }

  const out: MatImport = { updates: [], inserts: [], errors: [], unchanged: 0 }
  const seen = new Set<string>()
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return
    const g = (c: number) => row.getCell(c).value
    const id = cellText(g(1)), itemId = cellText(g(2)), label = cellText(g(3))
    const name = cellText(g(4)), unit = cellText(g(5)) || null, note = cellText(g(8)) || null
    const qty = parseNum(g(6)), need = parseDate(g(7))
    if (!id && !name && qty == null && !label) return              // dòng trống
    if (qty === 'bad' || (typeof qty === 'number' && qty < 0)) { out.errors.push(`Dòng ${n}: số lượng "${cellText(g(6))}" không hợp lệ`); return }
    if (need === 'bad') { out.errors.push(`Dòng ${n}: ngày "${cellText(g(7))}" không đúng dạng dd/mm/yyyy`); return }
    const after = { name, unit, quantity: qty as number | null, need_date: need as string | null, note }

    if (id) {
      const cur = subById[id]
      if (!cur) { out.errors.push(`Dòng ${n}: mã vật tư không thuộc dự án này (file của dự án khác?)`); return }
      if (seen.has(id)) { out.errors.push(`Dòng ${n}: vật tư "${cur.name}" bị lặp — chỉ lấy dòng đầu`); return }
      seen.add(id)
      if (!name) { out.errors.push(`Dòng ${n}: thiếu tên vật tư`); return }
      const same = cur.name === name && (cur.unit ?? null) === unit
        && (cur.quantity == null ? null : Number(cur.quantity)) === after.quantity
        && (cur.need_date ?? null) === after.need_date && (cur.note ?? null) === note
      if (same) out.unchanged++
      else out.updates.push({ id, item: cur._item, before: cur, after })
      return
    }
    // Dòng mới (hoặc dòng trống của hạng mục chưa có vật tư)
    if (!name) { if (qty != null) out.errors.push(`Dòng ${n}: có số lượng nhưng thiếu tên vật tư`); return }
    const item = itemById[itemId] ?? itemByLabel[norm(label)]
    if (!item) { out.errors.push(`Dòng ${n}: chưa chọn "Hạng mục vật tư" cho "${name}"`); return }
    out.inserts.push({ item, row: n, after })
  })
  return out
}
