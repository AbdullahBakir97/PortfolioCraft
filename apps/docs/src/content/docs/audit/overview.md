---
title: Audit mode
description: A self-awareness audit of your GitHub footprint — license, docs, tests, stale repos, PR rot, bug debt, archived but active, archive suggestions.
---

## What it does

Audit mode surfaces eight categories of self-awareness signals across your public repositories and your open pull requests. It is read-only against the GitHub API: no commits, no comments, no labels, no PRs of its own. The point is to put one boring artifact in front of you — a Markdown report and a JSON twin — that tells you which repos are dragging your portfolio down before a recruiter or a teammate notices first.

The check catalog covers license gaps, missing READMEs, missing tests, stale repos, rotting open PRs, accumulating bug debt, archived-but-still-active projects, and composite hints that a repo is ready to be archived. Each finding carries a stable id, a severity, a deterministic URL to the evidence, and a suggested action. Findings are deterministic across runs — the same input produces the same ids — so the Markdown block can be safely committed back to a README without churn.

## Quickstart

```yaml
# .github/workflows/audit.yml
name: Audit

on:
  workflow_dispatch:
  schedule:
    - cron: '17 4 * * 1' # weekly, Mondays

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AbdullahBakir97/PortfolioCraft@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          mode: audit            # or 'both' to run portfolio + audit
          audit-output-md: audit.md
          audit-output-json: audit.json
```

`mode: both` runs the portfolio generator and the audit in the same job, sharing one GraphQL warm-up. `mode: audit` skips portfolio rendering entirely.

## Local CLI

```sh
npx portfoliocraft audit --user <login>
```

Useful flags:

```sh
npx portfoliocraft audit --user <login> --severity high     # filter at print time
npx portfoliocraft audit --user <login> --config .portfoliocraft.yml
npx portfoliocraft audit --user <login> --json audit.json --md audit.md
```

The CLI accepts `GITHUB_TOKEN` (or `GH_TOKEN`) from the environment. No new scopes are needed beyond what v0.1 already used.

## Severity model

Findings are tagged with one of five severity levels:

| Severity   | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `critical` | Reserved for v0.3+ checks (security advisories, leaked secrets).        |
| `high`     | Active embarrassment — missing license, archived repo with open issues. |
| `medium`   | Worth fixing this quarter — stale repo, missing README, bug debt.       |
| `low`      | Nice-to-have polish — no detected tests.                                |
| `info`     | Pure suggestions — composite "consider archiving" hints.                |

Two filters interact with severity:

- **`--severity <level>`** (CLI only) is a *display* filter. It hides anything below the level when printing, but the JSON report always contains every finding.
- **`audit-fail-on: <level>`** (Action input, also `failOn:` in YAML config) is a *gate*. If any finding meets or exceeds the level, the run exits non-zero. Empty (the default) never fails the run.

See the [finding catalog](/audit/catalog/) for the canonical severity of each check.

## Outputs

**Markdown report.** Written to the path in `audit-output-md` (default `audit.md`). The renderer is deterministic and idempotent — if you inject the report between

```markdown
<!-- PORTFOLIOCRAFT-AUDIT:START -->
<!-- PORTFOLIOCRAFT-AUDIT:END -->
```

markers in any file, re-running with no new findings will produce a byte-identical block. Safe to commit.

**JSON report.** Written to the path in `audit-output-json` (default `audit.json`). Validated against the `AuditReport` Zod schema before write; invalid reports fail the run loudly. The top-level `schemaVersion` is `1.0.0` and follows semver — minor bumps add fields, major bumps may rename or remove them.

Both paths can be set to the empty string to skip writing the artifact.

## What it doesn't do

Audit mode is intentionally narrow in v0.2:

- **No auto-fix PRs.** Every finding suggests an action; none of them are taken for you. Auto-fix workflows (e.g. opening a PR to add a `LICENSE` file) are a v1.x roadmap item.
- **No bot/gaming detection.** v0.2 does not score whether your contribution graph looks artificial. That heuristic — and the false-positive matrix it implies — is being deferred until we have ground-truth data.
- **No employer-verified commits.** Cross-referencing commit emails with public employer signals is a v1.x feature.
- **No new token scopes.** `public_repo` + `read:user` are still sufficient — the same scopes the portfolio generator already uses. `secrets.GITHUB_TOKEN` works out of the box for public-repo audits.

For configuration knobs (thresholds, ignores, output paths) see [Audit configuration](/audit/configuration/). For the full check catalog see [Finding catalog](/audit/catalog/). For copy-pasteable workflows see [CI recipes](/audit/ci-recipes/).
