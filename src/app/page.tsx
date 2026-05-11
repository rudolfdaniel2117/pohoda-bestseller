'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { BestsellerRow } from '@/types'

const CHUNK_SIZE = 500
const PAGE_SIZE = 25

type PohodaSource = 'CZ' | 'SK'

export default function HomePage() {
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [fetchSources, setFetchSources] = useState<Set<PohodaSource>>(new Set(['CZ', 'SK']))
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  // Výchozí: od začátku letošního roku — bez filtru by mServer vracel celou historii a timeoutoval
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [dateTo, setDateTo] = useState('')
  const [allBestsellers, setAllBestsellers] = useState<BestsellerRow[]>([])
  const [sortBy, setSortBy] = useState<'quantity' | 'profit' | 'margin'>('quantity')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const supabase = createClient()

  const loadBranches = useCallback(async () => {
    const { data } = await supabase.from('sale_items').select('branch')
    if (data) {
      const unique = [...new Set((data as { branch: string }[]).map(r => r.branch).filter(Boolean))]
      setBranches(unique.sort())
    }
  }, [supabase])

  const loadBestsellers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('sale_items')
      .select('article_code,article_name,quantity,profit,sale_amount,margin_pct')

    if (selectedBranch) query = query.eq('branch', selectedBranch)
    if (dateFrom) query = query.gte('sale_date', dateFrom)
    if (dateTo) query = query.lte('sale_date', dateTo)

    const { data, error } = await query
    if (error) { console.error(error); setLoading(false); return }

    interface RawRow { article_code: string; article_name: string; quantity: string; profit: string; sale_amount: string; margin_pct: string }
    const map = new Map<string, BestsellerRow>()
    for (const row of (data as RawRow[])) {
      const key = row.article_code
      if (!map.has(key)) {
        map.set(key, { article_code: row.article_code, article_name: row.article_name, net_quantity: 0, total_profit: 0, total_revenue: 0, avg_margin_pct: 0 })
      }
      const agg = map.get(key)!
      agg.net_quantity += Number(row.quantity)
      agg.total_profit += Number(row.profit)
      agg.total_revenue += Number(row.sale_amount)
    }
    for (const agg of map.values()) {
      agg.avg_margin_pct = agg.total_revenue > 0 ? (agg.total_profit / agg.total_revenue) * 100 : 0
    }
    const sorted = [...map.values()]
      .filter(r => r.net_quantity > 0)
      .sort((a, b) => {
        if (sortBy === 'quantity') return b.net_quantity - a.net_quantity
        if (sortBy === 'profit') return b.total_profit - a.total_profit
        return b.avg_margin_pct - a.avg_margin_pct
      })
    setAllBestsellers(sorted)
    setPage(1)
    setLoading(false)
  }, [supabase, selectedBranch, dateFrom, dateTo, sortBy])

  useEffect(() => { loadBranches() }, [loadBranches])
  useEffect(() => { loadBestsellers() }, [loadBestsellers])
  useEffect(() => { setPage(1) }, [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return allBestsellers
    const q = search.toLowerCase()
    return allBestsellers.filter(r =>
      r.article_name.toLowerCase().includes(q) || r.article_code.toLowerCase().includes(q)
    )
  }, [allBestsellers, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSource(s: PohodaSource) {
    setFetchSources(prev => {
      const next = new Set(prev)
      if (next.has(s)) { if (next.size > 1) next.delete(s) }
      else next.add(s)
      return next
    })
  }

  async function handleFetchPohoda() {
    if (fetchSources.size === 0) return
    setFetching(true)
    setFetchMsg('Načítám data z POHODA mServeru...')

    try {
      const res = await fetch('/api/pohoda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: [...fetchSources],
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      })

      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      if (json.errors?.length) {
        setFetchMsg(`⚠ Chyba: ${json.errors.join('; ')}`)
        setFetching(false)
        return
      }

      const movements = json.movements as {
        source: string; agenda: string; document_no: string; sale_date: string
        article_code: string; article_name: string; branch: string
        quantity: number; sale_amount: number; weighted_cost: number
        profit: number; margin_pct: number
      }[]

      if (movements.length === 0) {
        setFetchMsg('Žádná data — zkontroluj připojení k mServeru nebo filtry.')
        setFetching(false)
        return
      }

      setFetchMsg(`Načteno ${movements.length} pohybů. Ukládám...`)

      const { data: imp, error: impErr } = await supabase
        .from('imports')
        .insert({ filename: `POHODA ${[...fetchSources].join('+')} ${new Date().toLocaleDateString('cs-CZ')}`, row_count: movements.length })
        .select().single()
      if (impErr) throw impErr

      const items = movements.map(m => ({
        import_id: imp.id,
        article_code: m.article_code,
        article_name: m.article_name,
        branch: m.branch,
        quantity: m.quantity,
        sale_amount: m.sale_amount,
        weighted_cost: m.weighted_cost,
        profit: m.profit,
        margin_pct: m.margin_pct,
        sale_date: m.sale_date || null,
        document_no: m.document_no,
      }))

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const { error } = await supabase.from('sale_items').insert(items.slice(i, i + CHUNK_SIZE))
        if (error) throw error
        setFetchMsg(`Ukládám... ${Math.min(i + CHUNK_SIZE, items.length)}/${items.length}`)
      }

      setFetchMsg(`✓ Hotovo! Importováno ${movements.length} pohybů.`)
      loadBranches()
      loadBestsellers()
    } catch (err) {
      setFetchMsg(`Chyba: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFetching(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
  const fmtCzk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })

  // mServer je dostupný jen z lokální sítě — na Vercelu fetch selže
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  return (
    <div className="space-y-6">
      {/* POHODA Import */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Načíst data z POHODy</h2>

        {!isLocalhost && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <strong>Import funguje pouze lokálně.</strong> POHODA mServer je dostupný jen z vaší sítě.
            Spusť <code className="bg-amber-100 px-1 rounded">npm run dev</code> na svém počítači
            a importuj na <a href="http://localhost:3000" className="underline font-medium">localhost:3000</a>.
            Zde na Vercelu funguje pouze prohlížení již importovaných dat.
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Zdroj dat</label>
            <div className="flex gap-2">
              {(['CZ', 'SK'] as PohodaSource[]).map(s => (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  disabled={!isLocalhost}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${fetchSources.has(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleFetchPohoda}
            disabled={fetching || !isLocalhost}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {fetching ? 'Načítám...' : '⬇ Načíst pohyby'}
          </button>
          {fetchMsg && (
            <span className={`text-sm ${fetchMsg.startsWith('Chyba') || fetchMsg.startsWith('⚠') ? 'text-red-600' : fetchMsg.startsWith('✓') ? 'text-green-600' : 'text-gray-500'}`}>
              {fetchMsg}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          CZ: hosting.upes.cz:13703 · SK: hosting.upes.cz:14703 · Data se sloučí do jednoho žebříčku
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Hledat artikl</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Název nebo kód..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Pobočka</label>
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Všechny pobočky</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Datum od</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Datum do</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setSelectedBranch(''); setDateFrom(''); setDateTo(''); setSearch('') }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
          Zrušit filtry
        </button>
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center border-b border-gray-200">
          <div className="flex">
            {([['quantity', 'Nejprodávanější (ks)'], ['profit', 'Nejziskovější (Kč)'], ['margin', 'Nejvyšší marže (%)']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setSortBy(val)}
                className={`px-6 py-3 text-sm font-medium transition-colors ${sortBy === val ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>
          {filtered.length > 0 && (
            <span className="ml-auto px-4 text-xs text-gray-400">{filtered.length} artiklů</span>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Načítám data...</div>
        ) : filtered.length === 0 && allBestsellers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-3xl mb-3">📦</p>
            <p className="font-medium text-gray-500">Žádná data</p>
            <p className="text-sm mt-1">Klikni na <strong>Načíst pohyby</strong> pro stažení dat z POHODy.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-medium text-gray-500">Žádné výsledky</p>
            <p className="text-sm mt-1">Zkus jiný vyhledávací výraz.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-right w-10">#</th>
                    <th className="px-4 py-3 text-left">Kód</th>
                    <th className="px-4 py-3 text-left">Název artiklu</th>
                    <th className="px-4 py-3 text-right">Prodej (ks)</th>
                    <th className="px-4 py-3 text-right">Tržba</th>
                    <th className="px-4 py-3 text-right">Zisk</th>
                    <th className="px-4 py-3 text-right">Marže</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((row, i) => (
                    <tr key={row.article_code} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-right text-gray-400 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{row.article_code}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate" title={row.article_name}>{row.article_name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(row.net_quantity)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtCzk(row.total_revenue)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{fmtCzk(row.total_profit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${sortBy === 'margin' ? 'text-blue-700' : 'text-gray-500'}`}>
                        {row.avg_margin_pct.toFixed(1)} %
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-400">Strana {page} z {totalPages} ({filtered.length} artiklů)</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">‹ Předchozí</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">Další ›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">»</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
