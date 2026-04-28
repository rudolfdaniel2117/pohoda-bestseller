# Bestseller Analyzer — POHODA

Webová aplikace pro identifikaci nejprodávanějších artiklů z exportu pohybů zásob z účetního systému POHODA. Nahrij XLS export, filtruj podle pobočky a období, zobraz žebříček nejprodávanějších a nejziskovějších artiklů.

## Stack
Next.js + Supabase + Tailwind + Vercel

## Lokální vývoj
```bash
npm install
npm run dev
```

---

## Quick Start

```bash
# 1. Naklonuj kit
git clone git@github.com:jirkasemmler/prd-vibe-kit.git <moje-appka>

# 2. Spusť Claude Code
cd <moje-appka>
claude
# nebo Claude Desktop → záložka Code → Working dir → <moje-appka>

# 3. Validace — napiš /hack a mělo by to napovídat
/hack-check
```

## Co je v kitu

| Soubor | Co dělá |
|--------|---------|
| `CLAUDE.md` | Pravidla pro AI — stack, konvence, git workflow, SDLC návyky |
| `.claude/commands/` | 10 agentů (commandů) — PRD, scaffold, deploy, feature, review… |
| `README.md` | Tohle čteš |
| `.nvmrc` | Node.js verze pro Vercel |

## Dostupné příkazy

Napiš `/hack` v Claude Code a uvidíš autocomplete.

| Příkaz | Co dělá | Výstup |
|--------|---------|--------|
| `/hack-check` | Setup, GitHub repo, volba úrovně | GitHub repo + .participant-level |
| `/hack-prd` | PRD agent — problém, uživatel, scope, model | PRD.md + GitHub Issue + backlog + SQL |
| `/hack-scaffold` | Z PRD vygeneruje celou appku | Next.js appka + .env.example |
| `/hack-review` | Druhá AI projde tvůj kód | Review report (blockery, warningy) |
| `/hack-deploy` | Vercel deploy s PROD klíči | Živá URL na *.vercel.app |
| `/hack-feature` | Issue → branch → implementace → PR | Feature branch + PR + Vercel preview |
| `/hack-feature-pro` | Tým Lead/Builder/Critic, max 2 kola iterace | Větší feature s viditelnou multi-agent spoluprací |
| `/hack-test` | Vitest + React Testing Library | 5–8 testů + npm test zelený |
| `/hack-ci` | GitHub Actions pipeline | CI na každém push a PR |
| `/hack-agent` | Postav si přenosný subagent (worked example: prd-critic) | Nový agent v `.claude/agents/` použitelný napříč projekty |

## Dva režimy — stejné commandy, jiný tón

`/hack-check` se zeptá na úroveň: **basic** nebo **advanced**.

- **Basic** — agent vysvětluje, nabízí příklady, ptá se po jedné otázce, drží jednoduchý scope
- **Advanced** — agent jede rychle, challenguje rozhodnutí, přeskakuje vysvětlení, nechává volnost

Všech 10 agentů je dostupných pro všechny. Přepínáš kdykoliv v `.participant-level`.

## Prerekvizity

- [Node.js 18+](https://nodejs.org)
- [Git](https://git-scm.com) + [GitHub CLI (`gh`)](https://cli.github.com)
- [Claude Code](https://docs.claude.com/en/docs/claude-code) (Claude Pro/Max) nebo Claude Desktop (záložka Code)
- [Supabase](https://supabase.com) — **dva projekty** (DEV + PROD), oba free tier
- [Vercel](https://vercel.com) — free tier

### Volitelné (podle appky)

- [Gemini API](https://aistudio.google.com) — AI feature (free tier)
- [Brevo](https://www.brevo.com) — odesílání emailů (free tier, 300/den)

## Stack

- **Next.js 15** — App Router, TypeScript, Tailwind CSS
- **Supabase** — PostgreSQL + RLS + Auth + Storage
- **Vercel** — hosting, auto-deploy, preview URLs

## Flow

```
/hack-check     →  Setup + GitHub repo
/hack-prd       →  PRD → GitHub Issue + backlog + SQL
                    SQL spustíš v DEV Supabase projektu
/hack-scaffold  →  Appka z PRD + DEV klíče do .env.local
                    npm run dev → localhost:3000
/hack-deploy    →  Vercel + PROD klíče → živá URL
                    SQL spustíš i v PROD projektu
```

Pak iteruješ:

```
Issue/prompt → branch → /hack-feature → /hack-review → PR → preview → merge → repeat
```

## SDLC návyky

- **Issue-driven development** — jeden issue = jeden branch = jeden PR
- **Preview = staging** — Vercel preview URL na každém PR, nikdy merge bez testu
- **Code review** — /hack-review jako druhý pár očí
- **Migrace v gitu** — SQL v `migrations/` složce, DB změny v PR description
- **DEV/PROD oddělení** — lokálně DEV databáze, Vercel PROD databáze
- **.env.example** — šablona proměnných v gitu, tajné klíče v .env.local

## Recepty v /hack-feature

Agent má připravené recepty pro:

- **AI feature** — Gemini nebo Groq, API route handler, klientské volání
- **Odesílání emailů** — Brevo REST API, server-side route
- **File upload** — Supabase Storage, klientský upload + public URL
- **Autorizace** — Supabase Auth, login/signup, RLS zpřísnění
