export interface Import {
  id: number
  filename: string
  row_count: number
  created_at: string
}

export interface SaleItem {
  id: number
  import_id: number
  article_code: string
  article_name: string
  branch: string
  quantity: number
  sale_amount: number
  weighted_cost: number
  profit: number
  margin_pct: number
  sale_date: string
  document_no: string
  created_at: string
}

export interface BestsellerRow {
  article_code: string
  article_name: string
  net_quantity: number
  total_profit: number
  total_revenue: number
  avg_margin_pct: number
}
