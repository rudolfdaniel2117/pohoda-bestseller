'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Import } from '@/types'

export default function ImportsPage() {
  const [imports, setImports] = useState<Import[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const supabase = createClient()

  const loadImports = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('imports')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setImports(data as Import[])
    setLoading(false)
  }, [supabase])

  async function deleteImport(id: number) {
    if (!confirm('Smazat tento import a všechna jeho data?')) return
    setDeleting(id)
    await supabase.from('imports').delete().eq('id', id)
    setImports(prev => prev.filter(i => i.id !== id))
    setDeleting(null)
  }

  useEffect(() => { loadImports() }, [loadImports])

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Historie importů</h1>

      {loading ? (
        <div className="text-gray-400 text-center py-12">Načítám...</div>
      ) : imports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-3">📋</p>
          <p className="font-medium text-gray-500">Zatím žádné importy</p>
          <p className="text-sm mt-1">Nahraj XLS soubor na hlavní stránce.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Soubor</th>
                <th className="px-4 py-3 text-right">Řádků</th>
                <th className="px-4 py-3 text-left">Nahráno</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {imports.map(imp => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{imp.filename}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{imp.row_count?.toLocaleString('cs-CZ')}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(imp.created_at).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteImport(imp.id)}
                      disabled={deleting === imp.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      {deleting === imp.id ? 'Mažu...' : 'Smazat'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
