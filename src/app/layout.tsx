import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bestseller Analyzer — POHODA',
  description: 'Identifikace nejprodávanějších artiklů z exportu POHODA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold text-gray-900 hover:text-blue-600">
              📊 Bestseller Analyzer
            </Link>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              Přehled
            </Link>
            <Link href="/imports" className="text-sm text-gray-500 hover:text-gray-900">
              Historie importů
            </Link>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
