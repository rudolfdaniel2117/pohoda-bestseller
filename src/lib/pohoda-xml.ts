import { XMLParser } from 'fast-xml-parser'
import https from 'node:https'

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

// Kurz EUR → CZK pro SK data
const EUR_TO_CZK = 25

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

  // DEBUG: loguj unikátní hodnoty agenda + storage z prvních 5 záznamů
  const debugSample = movList.slice(0, 5)
  console.log(`[POHODA ${source}] DEBUG sample (${debugSample.length} záznamy z ${movList.length} celkem):`)
  for (const mov of debugSample) {
    const h = (mov as Record<string, unknown>)?.['mov:movementHeader'] as Record<string, unknown> ?? {}
    console.log(`  agenda=${str(h['mov:agenda'])} movType=${str(h['mov:movementType'])} storage=${JSON.stringify(h['mov:storage'])} centre=${JSON.stringify(h['mov:centre'])} number=${str(h['mov:number'])} profit=${str(h['mov:profit'])}`)
  }

  for (const mov of movList) {
    const h = (mov as Record<string, unknown>)?.['mov:movementHeader'] as Record<string, unknown> ?? {}

    // FIX 1: Pouze prodejky — přeskočíme faktury, převody, příjmy
    const agenda = str(h['mov:agenda'])
    if (agenda !== 'saleVoucher' && agenda !== 'predajka') continue

    // Pouze výdeje (ne příjmy/vrátky na skladu)
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

    // FIX 2: Pobočka — mov:storage → typ:storage → typ:ids (např. "Zlín-VO")
    // Bereme první část před lomítkem (např. "Zlín-VO/SWE Sklad" → "Zlín-VO")
    const storageParent = (h['mov:storage'] ?? {}) as Record<string, unknown>
    const storage = (storageParent['typ:storage'] ?? {}) as Record<string, unknown>
    const storageIds = str(storage['typ:ids'])
    const branch = storageIds ? storageIds.split('/')[0].trim() : source

    // Číslo dokladu
    const docNo = str(h['mov:number'])

    // Ceny — FIX 3: SK data jsou v EUR, převedeme na CZK (×25)
    const fxRate = source === 'SK' ? EUR_TO_CZK : 1
    const unitPrice = num(h['mov:unitPrice']) * fxRate
    const weightedCost = num(h['mov:weightedPurchasePrice']) * fxRate
    const profit = num(h['mov:profit']) * fxRate
    const quantity = num(h['mov:quantity'])
    const marginPct = unitPrice > 0 ? (profit / unitPrice) * 100 : 0

    movements.push({
      source,
      agenda,
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

// Použijeme Node.js https.request místo fetch — mServer má self-signed certifikát
function httpsPost(urlStr: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const req = https.request({
      hostname: url.hostname,
      port: Number(url.port) || 443,
      path: url.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      rejectUnauthorized: false, // mServer má self-signed certifikát
      timeout: 120000,
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}

export async function fetchFromMServer(
  source: PohodaSource,
  dateFrom?: string,
  dateTo?: string
): Promise<{ movements: ParsedMovement[]; error?: string }> {
  const { url, ico } = SERVERS[source]
  const body = buildRequest(ico, dateFrom)

  const user = process.env[`POHODA_USER_${source}`] ?? process.env.POHODA_USER ?? ''
  const pass = process.env[`POHODA_PASS_${source}`] ?? process.env.POHODA_PASS ?? ''

  const headers: Record<string, string> = { 'Content-Type': 'text/xml; charset=windows-1250' }
  if (user) {
    headers['STW-Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  }

  let rawXml: string
  try {
    rawXml = await httpsPost(url, body, headers)
  } catch (err) {
    return { movements: [], error: `Síťová chyba: ${err instanceof Error ? err.message : String(err)}` }
  }

  console.log(`[POHODA ${source}] response size: ${rawXml.length} chars`)

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
