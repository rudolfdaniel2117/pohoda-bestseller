import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'
import { XMLParser } from 'fast-xml-parser'

export const maxDuration = 60

const SERVERS = {
  CZ: { url: 'https://hosting.upes.cz:13703/xml', ico: '27780988' },
  SK: { url: 'https://hosting.upes.cz:14703/xml', ico: '53416511' },
}

function buildRequest(ico: string, dateFrom: string): string {
  return `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"
  xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"
  id="Z001" ico="${ico}" application="BestsellerAnalyzer" version="2.0" note="">
  <dat:dataPackItem id="1" version="2.0">
    <lst:listMovementRequest version="2.0" movementVersion="2.0">
      <lst:requestMovement><ftr:filter><ftr:dateFrom>${dateFrom}</ftr:dateFrom></ftr:filter></lst:requestMovement>
    </lst:listMovementRequest>
  </dat:dataPackItem>
</dat:dataPack>`
}

function httpsPost(urlStr: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const req = https.request({
      hostname: url.hostname,
      port: Number(url.port) || 443,
      path: url.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      rejectUnauthorized: false,
      timeout: 55000,
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

export async function GET(req: NextRequest) {
  const source = (req.nextUrl.searchParams.get('source') ?? 'CZ') as 'CZ' | 'SK'
  // Omezíme na posledních 7 dní aby response nebyla obří
  const dateFrom = req.nextUrl.searchParams.get('from') ?? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const { url, ico } = SERVERS[source]
  const user = process.env[`POHODA_USER_${source}`] ?? process.env.POHODA_USER ?? ''
  const pass = process.env[`POHODA_PASS_${source}`] ?? process.env.POHODA_PASS ?? ''

  const headers: Record<string, string> = { 'Content-Type': 'text/xml; charset=windows-1250' }
  if (user) headers['STW-Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

  let rawXml: string
  try {
    rawXml = await httpsPost(url, buildRequest(ico, dateFrom), headers)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  // Parsuj a vrať hlavičky prvních 3 pohybů jako JSON — stačí pro identifikaci polí
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['lst:movement', 'movement'].includes(name),
  })
  const parsed = parser.parse(rawXml)

  let movements: unknown[] = []
  try {
    const rsp = (parsed['rsp:responsePack'] ?? parsed['responsePack']) as Record<string, unknown>
    const item = (rsp?.['rsp:responsePackItem'] ?? rsp?.['responsePackItem']) as Record<string, unknown>
    const listMov = (item?.['lst:listMovement'] ?? item?.['listMovement']) as Record<string, unknown>
    const raw = listMov?.['lst:movement'] ?? listMov?.['movement']
    movements = Array.isArray(raw) ? raw : raw ? [raw] : []
  } catch {
    return NextResponse.json({ error: 'Parse error', rawXml: rawXml.slice(0, 2000) })
  }

  const sample = movements.slice(0, 10).map((m) => {
    const mov = m as Record<string, unknown>
    return mov['mov:movementHeader']
  })

  return NextResponse.json({
    source,
    dateFrom,
    total: movements.length,
    sample,
    // Vždy přiložíme první část XML — pomáhá diagnostikovat prázdné výsledky
    rawSnippet: rawXml.slice(0, 1500),
  }, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
