# Bestseller Analyzer — POHODA

Webová aplikace pro identifikaci nejprodávanějších artiklů z exportu pohybů zásob z účetního systému POHODA. Nahrij XLS export, filtruj podle pobočky a období, zobraz žebříček nejprodávanějších a nejziskovějších artiklů.

## Stack
Next.js + Supabase + Tailwind + Vercel

## Lokální vývoj
```bash
npm install
npm run dev
```

Otevři [http://localhost:3000](http://localhost:3000).

## Prostředí

Zkopíruj `.env.example` do `.env.local` a doplň hodnoty:
```bash
cp .env.example .env.local
```

---

## Workshop příkazy

- `/hack-feature` — přidej novou feature (branch + implementace + PR)
- `/hack-review` — second opinion nad PR (bezpečnost, UX, soulad s PRD)
- `/hack-deploy` — deploy na Vercel
