import { XMLParser } from 'fast-xml-parser'

export type PohodaSource = 'CZ' | 'SK'

const SERVERS: Record<PohodaSource, { url: string; ico: string }> = {
  CZ: { url: 'http://hosting.upes.cz:13703/xml', ico: '27780988' },
  SK: { url: 'http://hosting.upes.cz:14703/xml', ico: '53416511' },
}

function buildRequest(ico: string, dateFrom?: string, dateTo?: string): string {
  const filterBlock = (dateFrom || dateTo) ? `
        <lst:filter>
          ${dateFrom ? `<ftr:dateFrom>${dateFrom}</ftr:dateFrom>` : ''}
          ${dateTo ? `<ftr:dateTo>${dateTo}</ftr:dateTo>` : ''}
        </lst:filter>` : ''

  return `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"
  xmlns:mov="http://www.stormware.cz/schema/version_2/movement.xsd"
  xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"
  id="Z001" ico="${ico}" application="BestsellerAnalyzer" version="2.0">
  <dat:dataPackItem id="1" version="2.0">
    <lst:listMovementRequest version="2.0">
      <lst:requestMovement>${filterBlock}
      </lst:requestMovement>
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

function parseMovements(xml: string, source: PohodaSource): ParsedMovement[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'lst:movement',
  })

  const result = parser.parse(xml)
  const movements: ParsedMovement[] = []

  // Navigate to the movement list — struktura se může lišit podle verze
  let movList: unknown[] = []
  try {
    const pack = result['dat:dataPack'] ?? result['dataPack']
    const item = pack?.['dat:dataPackItem'] ?? pack?.['dataPackItem']
    const listMovement = item?.['lst:listMovement'] ?? item?.['listMovement']
    movList = listMovement?.['lst:movement'] ?? listMovement?.['movement'] ?? []
    if (!Array.isArray(movList)) movList = [movList]
  } catch {
    return []
  }

  for (const mov of movList) {
    const m = mov as Record<string, unknown>
    const h = (m?.['mov:movementHeader'] ?? m?.['movementHeader'] ?? {}) as Record<string, unknown>
    const stock = (h?.['mov:storage'] ?? h?.['mov:stock'] ?? {}) as Record<string, unknown>
    const stockItem = stock?.['typ:stockItem'] as Record<string, unknown> | undefined
    const stockRef = stockItem?.['typ:ids'] ?? stock?.['typ:ids'] ?? ''
    const stockName = stockItem?.['typ:name'] ?? stock?.['typ:name'] ?? ''

    const rawDate = h?.['mov:date'] ?? ''
    const saleDate = typeof rawDate === 'string' ? rawDate.split('T')[0] : String(rawDate)

    const docNoObj = h?.['mov:number'] as Record<string, unknown> | string | undefined
    const docNo = (typeof docNoObj === 'object' ? docNoObj?.['typ:numberRequested'] : docNoObj) ?? ''

    const agenda = String(h?.['mov:agenda'] ?? '')

    const centre = h?.['mov:centre'] as Record<string, unknown> | string | undefined
    const store = h?.['mov:store'] as Record<string, unknown> | string | undefined
    const branch = (typeof centre === 'object' ? centre?.['typ:ids'] : centre) ??
      (typeof store === 'object' ? store?.['typ:ids'] : store) ??
      source  // fallback: CZ nebo SK

    const quantity = parseFloat(String(h?.['mov:quantity'] ?? 0)) || 0
    const saleAmount = parseFloat(String(h?.['mov:price'] ?? 0)) || 0
    const weightedCost = parseFloat(String(h?.['mov:weightedPurchasePrice'] ?? 0)) || 0
    const profit = parseFloat(String(h?.['mov:profit'] ?? 0)) || 0
    const margin = saleAmount > 0 ? (profit / saleAmount) * 100 : 0

    if (!stockRef && !stockName) continue  // přeskoč prázdné řádky

    movements.push({
      source,
      agenda,
      document_no: String(docNo),
      sale_date: saleDate,
      article_code: String(stockRef),
      article_name: String(stockName),
      branch: String(branch),
      quantity,
      sale_amount: saleAmount,
      weighted_cost: weightedCost,
      profit,
      margin_pct: margin,
    })
  }

  return movements
}

export async function fetchFromMServer(
  source: PohodaSource,
  dateFrom?: string,
  dateTo?: string
): Promise<{ movements: ParsedMovement[]; rawXml?: string; error?: string }> {
  const { url, ico } = SERVERS[source]
  const body = buildRequest(ico, dateFrom, dateTo)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=windows-1250' },
    body,
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    return { movements: [], error: `HTTP ${response.status}: ${response.statusText}` }
  }

  const rawXml = await response.text()
  const movements = parseMovements(rawXml, source)
  return { movements, rawXml }
}
