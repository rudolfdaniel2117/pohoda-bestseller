'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { parsePohodaXLS } from '@/lib/parse-pohoda'
import type { BestsellerRow } from '@/types'

const CHUNK_SIZE = 500
const PAGE_SIZE = 25

export default function HomePage() {
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
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
        map.set(key, {
          article_code: row.article_code,
          article_name: row.article_name,
          net_quantity: 0,
          total_profit: 0,
          total_revenue: 0,
          avg_margin_pct: 0,
        })
      }
      const agg = map.get(key)!
      agg.net_quantity += Number(row.quantity)
      agg.total_profit += Number(row.profit)
      agg.total_revenue += Number(row.sale_amount)
    }

    for (const agg of map.values()) {
      agg.avg_margin_pct = agg.total_revenue > 0
        ? (agg.total_profit / agg.total_revenue) * 100
        : 0
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

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return allBestsellers
    const q = search.toLowerCase()
    return allBestsellers.filter(r =>
      r.article_name.toLowerCase().includes(q) ||
      r.article_code.toLowerCase().includes(q)
    )
  }, [allBestsellers, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('Parsuju soubor...')

    try {
      const buffer = await file.arrayBuffer()
      const rows = parsePohodaXLS(buffer)
      setUploadMsg(`Nalezeno ${rows.length} řádků. Ukládám do databáze...`)

      const { data: imp, error: impErr } = await supabase
        .from('imports')
        .insert({ filename: file.name, row_count: rows.length })
        .select()
        .single()
      if (impErr) throw impErr

      const items = rows.map(r => ({
        import_id: imp.id,
        article_code: r.article_code,
        article_name: r.article_name,
        branch: r.branch,
        quantity: r.quantity,
        sale_amount: r.sale_amount,
        weighted_cost: r.weighted_cost,
        profit: r.profit,
        margin_pct: r.margin_pct,
        sale_date: r.sale_date || null,
        document_no: r.document_no,
      }))

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase.from('sale_items').insert(chunk)
        if (error) throw error
        setUploadMsg(`Ukládám... ${Math.min(i + CHUNK_SIZE, items.length)}/${items.length}`)
      }

      setUploadMsg(`✓ Hotovo! Importováno ${rows.length} řádků.`)
      loadBranches()
      loadBestsellers()
    } catch (err) {
      setUploadMsg(`Chyba: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
  const fmtCzk = (n: number) =>
    n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Nahrát export z POHODy</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed transition-colors ${uploading ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50'}`}>
            <span>📂</span>
            <span className="text-sm font-medium">
              {uploading ? 'Nahrávám...' : 'Vybrat XLS soubor'}
            </span>
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          {uploadMsg && (
            <span className={`text-sm ${uploadMsg.startsWith('Chyba') ? 'text-red-600' : uploadMsg.startsWith('✓') ? 'text-green-600' : 'text-gray-500'}`}>
              {uploadMsg}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Formát: export pohybů zásob z POHODy (.xls)</p>
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
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Všechny pobočky</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Datum od</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Datum do</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => { setSelectedBranch(''); setDateFrom(''); setDateTo(''); setSearch('') }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
        >
          Zrušit filtry
        </button>
      </div>

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setSortBy('quantity')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${sortBy === 'quantity' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Nejprodávanější (ks)
            </button>
            <button
              onClick={() => setSortBy('profit')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${sortBy === 'profit' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Nejziskovější (Kč)
            </button>
            <button
              onClick={() => setSortBy('margin')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${sortBy === 'margin' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Nejvyšší marže (%)
            </button>
          </div>
          {filtered.length > 0 && (
            <span className="ml-auto px-4 text-xs text-gray-400">
              {filtered.length} artiklů
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Načítám data...</div>
        ) : filtered.length === 0 && allBestsellers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-3xl mb-3">📦</p>
            <p className="font-medium text-gray-500">Žádná data</p>
            <p className="text-sm mt-1">Nahraj XLS export z POHODy pro zobrazení žebříčku.</p>
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
                      <td className="px-4 py-3 text-right text-gray-400 font-mono">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{row.article_code}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate" title={row.article_name}>
                        {row.article_name}
                      </td>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Strana {page} z {totalPages} ({filtered.length} artiklů)
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
                  >
                    ‹ Předchozí
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
                  >
                    Další ›
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
