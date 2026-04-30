# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-04-30

Self-awareness audit subcommand. Additive to v0.1; existing `mode: portfolio` (default) is unchanged.

### Added
- New `audit` mode that surfaces eight categories of self-awareness signals across your public repos and open PRs: stale, license, docs, tests, pr-rot, bug-debt, archived-but-active, archive-suggestion.
- New CLI subcommand: `npx portfoliocraft audit --user <login>`.
- New Action input `mode: portfolio | audit | both` (default `portfolio` — backward-compatible).
- New Action inputs: `audit-output-md`, `audit-output-json`, `audit-fail-on`.
- New Action outputs: `audit-md-path`, `audit-json-path`, `audit-finding-count`, `audit-fail-on-result`.
- Idempotent audit Markdown markers `<!-- PORTFOLIOCRAFT-AUDIT:START -->` / `END` (distinct from portfolio markers).
- AuditReport JSON output with `schemaVersion: "1.0.0"` — Zod-validated, byte-stable across runs given identical input.
- Severity model: `critical | high | medium | low | info`. CLI `--severity` flag and Action `audit-fail-on` input act as filters.
- Configurable via `audit:` block in `.portfoliocraft.yml` — thresholds (`stale-repo-months`, `pr-rot-days`, `bug-debt-warn`), ignore globs, output paths, fail-on threshold.
- 6-hour cache for audit-extras GraphQL data (per-repo license / README / issues + user open PRs), separate from the 24-hour portfolio snapshot cache.

### Quality
- 98% statement coverage on `packages/core/src/audit/` (well above the 80% target). 100% on the eight check implementations.
- 149 new test assertions across 13 new test files. Property test guards finding-sort determinism.

### Notes
- `pr-rot` and `bug-debt` use simplified age-based heuristics in v0.2 (no per-PR timeline introspection or label-aware weighting). v0.3 will add comment-timeline accuracy and label-aware bug-debt scoring.
- No new GitHub token scopes required — `public_repo` + `read:user` still sufficient. Audit data never leaves the runner.

## [0.1.0] — 2026-04-29

Initial release.

### Added
- GitHub Action that generates a verifiable professional portfolio from your GitHub history.
- Outputs: README section (idempotent `<!-- PORTFOLIOCRAFT:START -->` / `END` markers), JSON Resume (`schemaVersion: "1.0.0"`), PDF CV, SVG stat cards.
- Stack proficiency scoring (LOC × recency × repo maturity), with `--explain` mode for full transparency.
- Project significance ranking with real-work filter (excludes forks, archives, and tutorial repos).
- Domain classification: Backend, Frontend, DevOps, ML, Mobile.
- `--dry-run` mode for safe previews.
- `actions/cache` integration with 24h TTL on stable GitHub data.
- Configurable via `action.yml` inputs and an optional `.portfoliocraft.yml`.
- i18n-ready templates: English and Arabic at launch.
- Local CLI: `npx portfoliocraft generate --user <login>`.

### Quality
- 84% statement coverage, 85% branch coverage on `@portfoliocraft/core`.
- TypeScript strict (`noUncheckedIndexedAccess`), Biome lint and format, Vitest, MSW for HTTP mocking.
- CodeQL, Dependabot, build provenance attestations, SBOM on every release.
- Drift-proof `dist/` bundle: rebuilt on Linux in the release workflow before tagging.

### Security
- Action requests minimum scopes: `public_repo` and `read:user`. No data leaves the runner.

[0.2.0]: https://github.com/AbdullahBakir97/PortfolioCraft/releases/tag/v0.2.0
[0.1.0]: https://github.com/AbdullahBakir97/PortfolioCraft/releases/tag/v0.1.0
