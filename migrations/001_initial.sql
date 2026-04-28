-- Bestseller Analyzer — počáteční migrace
-- Spusť v Supabase SQL Editoru (DEV projekt)
-- Po deployi spusť stejný SQL i v PROD projektu

-- ============================================================
-- IMPORTS — history nahraných souborů z POHODy
-- ============================================================
CREATE TABLE imports (
  id          integer generated always as identity primary key,
  filename    text        not null,
  row_count   integer,
  created_at  timestamptz not null default now(),
  user_id     uuid        references auth.users(id)
);

ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports_allow_all" ON imports FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SALE_ITEMS — jednotlivé řádky z XLS exportu POHODy
-- ============================================================
CREATE TABLE sale_items (
  id            integer generated always as identity primary key,
  import_id     integer     not null references imports(id) on delete cascade,
  article_code  text        not null,
  article_name  text        not null,
  branch        text,                          -- Členění (pobočka)
  quantity      numeric     not null,          -- záporné = vrátka
  sale_amount   numeric,                       -- Částka
  weighted_cost numeric,                       -- Vážená nákupní cena
  profit        numeric,                       -- Zisk
  margin_pct    numeric,                       -- Marže v %
  sale_date     date,                          -- Datum prodeje
  document_no   text,                          -- Číslo dokladu
  created_at    timestamptz not null default now(),
  user_id       uuid        references auth.users(id)
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_allow_all" ON sale_items FOR ALL USING (true) WITH CHECK (true);

-- Index pro rychlé filtrování
CREATE INDEX sale_items_branch_idx     ON sale_items(branch);
CREATE INDEX sale_items_sale_date_idx  ON sale_items(sale_date);
CREATE INDEX sale_items_import_id_idx  ON sale_items(import_id);
CREATE INDEX sale_items_article_idx    ON sale_items(article_code);
