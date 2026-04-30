---
title: Architecture
description: How PortfolioCraft is laid out and why.
---

PortfolioCraft is a pnpm + Turborepo monorepo with four runtime packages and one docs app:

- `@portfoliocraft/core` — framework-free engine. GitHub clients (REST + GraphQL with throttling/retry plugins), ingestion, scoring, classification, filters, cache, Zod schemas. **Must not depend on `@actions/*`** so it can ship with the CLI.
- `@portfoliocraft/renderers` — Markdown (Eta), JSON Resume, PDF (`@react-pdf/renderer`), SVG (Satori → resvg). Each renderer is a pure function from a `PortfolioReport` to bytes.
- `@portfoliocraft/action` — the GitHub Action entrypoint. Wires inputs → `core` → `renderers` → outputs. Bundled with `@vercel/ncc` to a single `dist/index.js` at the repo root.
- `portfoliocraft` (the CLI) — Commander-driven; reuses everything in `core` and `renderers`.

Zod schemas in `core/src/schemas.ts` are the single source of truth for types: every external boundary (action inputs, YAML config, GitHub responses, generated reports) is parsed before being trusted.
