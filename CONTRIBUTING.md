# Contributing to DevPortfolio

Thanks for your interest. This project is built to be hackable — every layer has a single responsibility and is independently testable.

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

You need Node 20.18.0 LTS (`.nvmrc`) and pnpm 9+.

## Layout

- `packages/core` — pure logic (Octokit clients, ingestion, scoring, classification, filters, cache, Zod schemas). No `@actions/*` imports allowed here; this package must stay framework-free so the CLI can ship with it.
- `packages/renderers` — Markdown (Eta), JSON Resume, PDF (React-PDF), SVG (Satori).
- `packages/action` — the Action entrypoint. Wires inputs → `core` → `renderers` → outputs. Bundles via ncc into `dist/index.js`.
- `packages/cli` — Commander-based CLI, same engine.
- `apps/docs` — Starlight (Astro) docs site.
- `examples/` — dogfood configs.

## Code style

- TypeScript strict + `noUncheckedIndexedAccess`. No `any`, no `@ts-ignore`.
- Validate everything that crosses a boundary with Zod; the schema is the source of truth for types (`z.infer`).
- Biome handles linting and formatting. Run `pnpm lint` / `pnpm format`.
- Write tests with Vitest. Mock HTTP with MSW, never with stubbed fetch.

## Commits and releases

This project uses [Changesets](https://github.com/changesets/changesets). When your change is user-visible, run:

```bash
pnpm changeset
```

…and pick the appropriate bump. Release-please opens release PRs from `main`.

## Bundling

The Action entrypoint is bundled with `@vercel/ncc` to `dist/index.js` at the repo root. CI runs `pnpm verify-dist` and fails if `dist/` is out of date relative to the source.

## Filing issues

Please include:

- DevPortfolio version (`v1.x.y` or commit SHA).
- Workflow excerpt that triggered the bug.
- Output of running locally with `--dry-run --explain`.
- Whether the GitHub user is public/private and approximate repo count.
