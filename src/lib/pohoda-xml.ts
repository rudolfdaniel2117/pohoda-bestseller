import { XMLParser } from 'fast-xml-parser'

export type PohodaSource = 'CZ' | 'SK'

const SERVERS: Record<PohodaSource, { url: string; ico: string }> = {
  CZ: { url: 'https://hosting.upes.cz:13703/xml', ico: '27780988' },
  SK: { url: 'https://hosting.upes.cz:14703/xml', ico: '53416511' },
}

// Sestaví XML request pro mServer
function buildRequest(ico: string, dateFrom?: string): string {
  const filterBlock = dateFrom
    ? `<lst:requestMovement><ftr:filter><ftr:dateFrom>${dateFrom}</ftr:dateFrom></ftr:filter></lst:requestMovement>`
    : `<lst:requestMovement></lst:requestMovement>`

  return `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"
  xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"
  id="Z001" ico="${ico}" application="BestsellerAnalyzer" version="2.0" note="">
  <dat:dataPackItem id="1" version="2.0">
    <lst:listMovementRequest version="2.0" movementVersion="2.0">
      ${filterBlock}
    </lst:listMovementRequest>
  </dat:dataPackItem>
</dat:dataPack>`
}

export interface ParsedMovement {
  source: PohodaSource
  agenda: string
  document_no: string
  sale_date: string
  article_code: string
  article_name: string
  branch: string
  quantity: number
  sale_amount: number
  weighted_cost: number
  profit: number
  margin_pct: number
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}
function num(v: unknown): number {
  return parseFloat(String(v ?? 0)) || 0
}

function parseMovements(xml: string, source: PohodaSource, dateTo?: string): ParsedMovement[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['lst:movement', 'movement'].includes(name),
  })

  const result = parser.parse(xml)
  const movements: ParsedMovement[] = []

  // Navigace v response struktuře
  let movList: unknown[] = []
  try {
    // response → responsePackItem → listMovement → movement[]
    const rsp = (result['rsp:responsePack'] ?? result['responsePack']) as Record<string, unknown>
    const item = (rsp?.['rsp:responsePackItem'] ?? rsp?.['responsePackItem']) as Record<string, unknown>
    const listMov = (item?.['lst:listMovement'] ?? item?.['listMovement']) as Record<string, unknown>
    const raw = listMov?.['lst:movement'] ?? listMov?.['movement']
    movList = Array.isArray(raw) ? raw : raw ? [raw] : []
  } catch {
    return []
  }

  for (const mov of movList) {
    const h = (mov as Record<string, unknown>)?.['mov:movementHeader'] as Record<string, unknown> ?? {}

    // Pouze výdejky (prodeje) — přeskočíme příjmy a ostatní
    const movType = str(h['mov:movementType'])
    if (movType !== 'expense') continue

    // Datum — filtrujeme dateTo client-side (mServer ho nepodporuje)
    const saleDate = str(h['mov:date']).split('T')[0]
    if (dateTo && saleDate > dateTo) continue

    // Artikl — mov:stockItem → typ:stockItem
    const stockItemParent = (h['mov:stockItem'] ?? {}) as Record<string, unknown>
    const stockItem = (stockItemParent['typ:stockItem'] ?? {}) as Record<string, unknown>
    const articleCode = str(stockItem['typ:ids'])
    const articleName = str(stockItem['typ:name'])
    if (!articleCode) continue

    // Pobočka — mov:address → typ:address → typ:company
    const addressParent = (h['mov:address'] ?? {}) as Record<string, unknown>
    const address = (addressParent['typ:address'] ?? {}) as Record<string, unknown>
    const branch = str(address['typ:company']) || str(address['typ:name']) || source

    // Číslo dokladu
    const docNo = str(h['mov:number'])

    // Ceny
    const unitPrice = num(h['mov:unitPrice'])  // prodejní cena (Kč)
    const weightedCost = num(h['mov:weightedPurchasePrice'])
    const profit = num(h['mov:profit'])
    const quantity = num(h['mov:quantity'])
    const marginPct = unitPrice > 0 ? (profit / unitPrice) * 100 : 0

    movements.push({
      source,
      agenda: str(h['mov:agenda']),
      document_no: docNo,
      sale_date: saleDate,
      article_code: articleCode,
      article_name: articleName,
      branch,
      quantity,
      sale_amount: unitPrice,
      weighted_cost: weightedCost,
      profit,
      margin_pct: marginPct,
    })
  }

  return movements
}

export async function fetchFromMServer(
  source: PohodaSource,
  dateFrom?: string,
  dateTo?: string
): Promise<{ movements: ParsedMovement[]; error?: string }> {
  const { url, ico } = SERVERS[source]
  // dateTo filtrujeme client-side — mServer ho nepodporuje
  const body = buildRequest(ico, dateFrom)

  const user = process.env[`POHODA_USER_${source}`] ?? process.env.POHODA_USER ?? ''
  const pass = process.env[`POHODA_PASS_${source}`] ?? process.env.POHODA_PASS ?? ''

  const headers: Record<string, string> = {
    'Content-Type': 'text/xml; charset=windows-1250',
  }
  if (user) {
    headers['STW-Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? { agent: null } as any : {}),
    signal: AbortSignal.timeout(120000), // 2 minuty — může být velký dataset
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return { movements: [], error: `HTTP ${response.status}: ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}` }
  }

  const rawXml = await response.text()
  console.log(`[POHODA ${source}] response size: ${rawXml.length} chars`)

  // Zkontroluj jestli response obsahuje chybu
  if (rawXml.includes('state="error"') && !rawXml.includes('lst:listMovement')) {
    const noteMatch = rawXml.match(/note="([^"]{0,300})/)
    return { movements: [], error: noteMatch ? decodeHtml(noteMatch[1]) : 'Chyba v XML response' }
  }

  const movements = parseMovements(rawXml, source, dateTo)
  return { movements }
}

function decodeHtml(str: string): string {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#xA;/g, ' ')
}
