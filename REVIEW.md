# Review Report — Bestseller Analyzer

## 🔴 Blockery (oprav před deployem)

**1. loadBranches stahuje celou tabulku**
- Soubor: `src/app/page.tsx:23`
- Problém: SELECT branch bez limitu stáhne všechny řádky z sale_items jen aby získal unikátní pobočky. Po více importech (tisíce řádků) bude pomalé a zbytečně zatíží Supabase free tier.
- Návrh: Přidej `.select('branch').limit(5000)` nebo vytvoř v Supabase SQL view: `CREATE VIEW branches AS SELECT DISTINCT branch FROM sale_items;` a dotazuj jen tu.

## 🟡 Warning (zvaž před deployem)

**2. Chyba při načítání bestsellů se tiše ignoruje**
- Soubor: `src/app/page.tsx:41`
- Problém: Když Supabase vrátí error, console.error ho zaloguje, ale uživatel nevidí nic — stránka zůstane prázdná bez vysvětlení.
- Návrh: Přidej stav `errorMsg` a zobraz ho v UI místo prázdné tabulky.

**3. Mazání importu nesmaže sale_items**
- Soubor: `migrations/001_initial.sql`, `src/app/imports/page.tsx:26`
- Problém: SQL má ON DELETE CASCADE na sale_items.import_id — to je správně, ale funguje jen pokud je Supabase foreign key constraint aktivní. Ověř v dashboardu (Table Editor → sale_items → Foreign Keys), že constraint opravdu existuje.
- Návrh: Po prvním importu a smazání zkontroluj že sale_items jsou prázdné.

## 🟢 Nitpick

**4. Chybí error state při uploadu přes 5 000 řádků**
- Soubor: `src/app/page.tsx`
- Problém: Supabase free tier má limit na délku requestu. Při velmi velkém XLS (20k+ řádků) může chunk insert selhat s nejasnou chybou.
- Návrh: Přidej do error message tip: "Zkus menší soubor nebo kontaktuj administrátora."

---

**Závěr:** Appka je funkční a bezpečnostně OK (.env ignorováno, RLS zapnuté, žádné hardcoded klíče). Největší riziko je výkon loadBranches při více datech.

**Další krok:** Spusť `/hack-feature` a řekni: "Oprav loadBranches — místo SELECT branch bez limitu použij SELECT DISTINCT branch FROM sale_items přes Supabase RPC nebo view. A přidej error state do loadBestsellers."
