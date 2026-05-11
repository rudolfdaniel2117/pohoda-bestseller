import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'
import iconv from 'iconv-lite'

export const maxDuration = 60

const SERVERS = {
  CZ: { url: 'https://hosting.upes.cz:13703/xml', ico: '27780988' },
  SK: { url: 'https://hosting.upes.cz:14703/xml', ico: '53416511' },
}

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
      res.on('end', () => resolve(iconv.decode(Buffer.concat(chunks), 'win1250')))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}

export async function GET(req: NextRequest) {
  const source = (req.nextUrl.searchParams.get('source') ?? 'CZ') as 'CZ' | 'SK'
  const dateFrom = req.nextUrl.searchParams.get('from') ?? undefined

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

  // Vždy vrátíme surové XML — nejspolehlivější diagnostika
  return NextResponse.json({
    source,
    dateFrom: dateFrom ?? '(bez filtru)',
    rawLength: rawXml.length,
    rawXml: rawXml.slice(0, 3000),
  }, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
