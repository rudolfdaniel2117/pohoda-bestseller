import * as XLSX from 'xlsx'

export interface PohodaRow {
  agenda: string
  branch: string
  article_code: string
  article_name: string
  sale_date: string // ISO date string
  quantity: number
  sale_amount: number
  weighted_cost: number
  profit: number
  document_no: string
  margin_pct: number
}

// Excel serial date → ISO date string
function excelDateToISO(serial: number): string {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toISOString().split('T')[0]
}

export function parsePohodaXLS(buffer: ArrayBuffer): PohodaRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Skip header row (index 0)
  const rows: PohodaRow[] = []
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as (string | number | undefined)[]
    if (!r || r.length < 10) continue

    const quantity = parseFloat(String(r[5] ?? 0)) || 0
    const saleAmount = parseFloat(String(r[6] ?? 0)) || 0
    const weightedCost = parseFloat(String(r[7] ?? 0)) || 0
    const profit = parseFloat(String(r[8] ?? 0)) || 0
    const marginPct = parseFloat(String(r[10] ?? 0)) || 0

    let saleDate = ''
    const rawDate = r[4]
    if (typeof rawDate === 'number') {
      saleDate = excelDateToISO(rawDate)
    } else if (typeof rawDate === 'string') {
      saleDate = rawDate.split(' ')[0]
    }

    rows.push({
      agenda: String(r[0] ?? ''),
      branch: String(r[1] ?? ''),
      article_code: String(r[2] ?? ''),
      article_name: String(r[3] ?? ''),
      sale_date: saleDate,
      quantity,
      sale_amount: saleAmount,
      weighted_cost: weightedCost,
      profit,
      document_no: String(r[9] ?? ''),
      margin_pct: marginPct,
    })
  }

  return rows
}
