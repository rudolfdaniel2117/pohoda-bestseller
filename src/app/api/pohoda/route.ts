import { NextRequest, NextResponse } from 'next/server'
import { fetchFromMServer } from '@/lib/pohoda-xml'
import type { PohodaSource } from '@/lib/pohoda-xml'

// Vercel: prodluž timeout na max 60s (hobby plán)
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { dateFrom, dateTo, sources } = await req.json() as {
    dateFrom?: string
    dateTo?: string
    sources: PohodaSource[]
  }

  const results = await Promise.allSettled(
    sources.map(s => fetchFromMServer(s, dateFrom, dateTo))
  )

  const movements = []
  const errors: string[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const source = sources[i]
    if (r.status === 'fulfilled') {
      if (r.value.error) {
        errors.push(`${source}: ${r.value.error}`)
      } else {
        movements.push(...r.value.movements)
      }
    } else {
      errors.push(`${source}: ${r.reason?.message ?? 'Neznámá chyba'}`)
    }
  }

  return NextResponse.json({
    movements,
    count: movements.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
