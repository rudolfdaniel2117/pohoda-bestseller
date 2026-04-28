# PRD: Bestseller Analyzer — POHODA

## Problém
Majitel obchodu potřebuje rychle identifikovat nejprodávanější artikly z exportu pohybů zásob z účetního programu POHODA. Bez nástroje musí ručně procházet stovky řádků v Excelu a těžko vidí, co se skutečně prodává a co vydělává.

## Cílový uživatel
Majitel nebo provozní manažer maloobchodu s více pobočkami, který používá účetní systém POHODA.

## User Stories
- Jako majitel chci nahrát XLS export z POHODy, abych nemusel data ručně kopírovat
- Jako majitel chci vidět žebříček artiklů podle čistého prodaného množství (po vratkách), abych věděl co se nejvíce prodává
- Jako majitel chci vidět ziskovost každého artiklu, abych věděl co nejvíce vydělává
- Jako majitel chci filtrovat podle pobočky, abych porovnal výkon prodejen
- Jako majitel chci filtrovat podle období (datum od–do), abych analyzoval konkrétní časový úsek

## MVP Scope

### In scope
- Nahrání XLS exportu z POHODy (formát pohyby zásob)
- Parsování a uložení dat do databáze
- Žebříček artiklů podle čistého prodaného množství (SUM quantity, vrátky odečteny)
- Žebříček artiklů podle celkového zisku
- Filtr podle pobočky (Členění)
- Filtr podle období (datum od–do)
- Historie nahraných souborů (imports)

### Out of scope
- Grafy trendů v čase (jak se prodej vyvíjí po měsících)
- Porovnání dvou období vedle sebe
- Export výsledků do CSV
- Detail jednoho artiklu (prodej po měsících)
- Uživatelské účty / multi-tenant

## Datový model

### Tabulka: imports
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | integer generated always as identity PK | Primární klíč |
| filename | text | Název nahraného souboru |
| row_count | integer | Počet řádků v importu |
| created_at | timestamptz default now() | Čas nahrání |
| user_id | uuid references auth.users | Pro budoucí auth |

### Tabulka: sale_items
| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | integer generated always as identity PK | Primární klíč |
| import_id | integer references imports(id) | Vazba na import |
| article_code | text | Kód artiklu (Kód) |
| article_name | text | Název artiklu (Název) |
| branch | text | Pobočka/prodejna (Členění) |
| quantity | numeric | Prodané množství, záporné = vrátka (Množství) |
| sale_amount | numeric | Prodejní cena (Částka) |
| weighted_cost | numeric | Vážená nákupní cena (Vážená) |
| profit | numeric | Zisk (Zisk) |
| margin_pct | numeric | Marže v procentech |
| sale_date | date | Datum prodeje (Datum) |
| document_no | text | Číslo dokladu (Číslo) |
| created_at | timestamptz default now() | Čas uložení záznamu |
| user_id | uuid references auth.users | Pro budoucí auth |

## SQL pro Supabase

Viz `migrations/001_initial.sql`.
