---
title: Finding catalog
description: All 8 audit check categories with severity, what triggers them, and how to fix.
---

This is the canonical list of the eight check categories shipped in v0.2. Each section covers what the check is, what data it consumes, the threshold knob (if any), and what v0.2 explicitly does *not* yet do. The threshold knobs all live under `audit.thresholds` in `.portfoliocraft.yml` — see [Audit configuration](/audit/configuration/#thresholds).

Findings are emitted in the order below: most severe first.

---

## High severity

### `license` — No detected LICENSE

- **Identifier:** `license`
- **Severity:** `high`
- **Trigger:** A non-archived, non-fork repository whose GitHub-detected SPDX license is `null`.
- **Data:** `licenseInfo.spdxId` from the GraphQL repository payload.
- **Suggested action:** Add a `LICENSE` file. MIT and Apache-2.0 are common defaults for permissive open source.
- **Threshold:** None.
- **v0.2 limitations:** Relies on GitHub's license detector — a `LICENSE` file with a non-standard header may not be recognized. The fix is to use a stock SPDX template.

### `archived` — Archived but still active

- **Identifier:** `archived`
- **Severity:** `high`
- **Trigger:** An archived repo that still attracts activity — at least one open issue, an open issue from the last 90 days, or more than 5 forks.
- **Data:** `repo.isArchived`, `repo.forkCount`, open issue count and oldest open issue date from the per-repo extras.
- **Suggested action:** Un-archive to accept contributions, or link to a maintained fork in the README so visitors don't waste time filing issues.
- **Threshold:** None (the 90-day and 5-fork heuristics are baked in for v0.2 and may become configurable in v0.3).
- **v0.2 limitations:** Only flags repos owned by the audited user; archived dependencies you depend on are out of scope.

### `pr-rot` — Stale open PR (90+ days)

- **Identifier:** `pr-rot` (high-severity branch)
- **Severity:** `high` (when age > 90 days)
- **Trigger:** One of the audited user's own open PRs is older than 90 days.
- **Data:** `userOpenPRs` collected from the `is:pr is:open author:<user>` search.
- **Suggested action:** Update with a fresh comment, mark as draft, or close.
- **Threshold:** `audit.thresholds.pr-rot-days` controls the entry point at `medium`; the 90-day escalation to `high` is fixed in v0.2.
- **v0.2 limitations:** This check uses **age only**. It does not introspect the PR timeline to distinguish "awaiting reviewer" from "awaiting author response". v0.3 will add a per-PR timeline query and weight age accordingly.

---

## Medium severity

### `stale` — Stale repository

- **Identifier:** `stale`
- **Severity:** `medium`
- **Trigger:** A non-archived, non-fork repository whose last push is older than the configured threshold.
- **Data:** `repo.pushedAt` from the GraphQL repository payload.
- **Suggested action:** Push a fresh commit, archive the repo, or exclude it from your portfolio config.
- **Threshold:** `audit.thresholds.stale-repo-months` *(default: 6)*.
- **v0.2 limitations:** "Push" is whatever GitHub records — including bot commits like Dependabot. A repo with weekly dep bumps but no human work will not be flagged here. Combined-signal detection lands in v0.3.

### `docs` — No README

- **Identifier:** `docs`
- **Severity:** `medium`
- **Trigger:** A non-archived, non-fork repository whose default branch root has no `README.md`.
- **Data:** Top-level entry list of the default branch from the GraphQL `tree` query.
- **Suggested action:** Add a `README.md` with at minimum a one-line description and a quickstart.
- **Threshold:** None.
- **v0.2 limitations:** Only checks for `README.md` (case-sensitive on the GitHub side). Variants like `readme.rst` or `Readme.markdown` are not detected; v0.3 will broaden the match.

### `pr-rot` — Stale open PR (medium)

- **Identifier:** `pr-rot` (medium-severity branch)
- **Severity:** `medium` (when age is between `pr-rot-days` and 90 days)
- **Trigger:** Same data source as the `high` branch above; a different age band.
- **Data:** `userOpenPRs` from the `is:pr is:open author:<user>` search.
- **Suggested action:** Update with a fresh comment, mark as draft, or close.
- **Threshold:** `audit.thresholds.pr-rot-days` *(default: 30)*.
- **v0.2 limitations:** Age-only heuristic — see the high-severity entry above.

### `bug-debt` — Aging open issues

- **Identifier:** `bug-debt`
- **Severity:** `medium`
- **Trigger:** A non-archived, non-fork repository whose oldest open issue is older than the configured threshold.
- **Data:** Open-issue count and oldest open issue creation date from the per-repo extras.
- **Suggested action:** Triage stale issues — close, label, or convert to discussions.
- **Threshold:** `audit.thresholds.bug-debt-warn` *(default: 365 days)*.
- **v0.2 limitations:** This check uses **age only**, and counts *all* open issues — not just `label:bug`. The accompanying `debtScore` (oldest age × open count) is published in the finding's `metadata` so consumers can re-rank. v0.3 will fetch labels and weight by reported severity.

---

## Low severity

### `tests` — No tests detected

- **Identifier:** `tests`
- **Severity:** `low`
- **Trigger:** A non-archived, non-fork repository whose default branch root has no `test/`, `tests/`, `spec/`, `__tests__/` directory and no `*.test.*` or `*.spec.*` files at the root.
- **Data:** Top-level entry list of the default branch.
- **Suggested action:** Add a tests directory with at least a smoke test for your main entrypoint.
- **Threshold:** None.
- **v0.2 limitations:** Heuristic and shallow — only the repo root is inspected. Tests nested in `src/`, `pkg/`, or under language-specific conventions are not detected. CI configs and `package.json` test scripts are also ignored. Deeper detection lands in v0.3.

---

## Info

### `archive-suggestion` — Composite "consider archiving"

- **Identifier:** `archive-suggestion`
- **Severity:** `info`
- **Trigger:** A composite signal that a non-archived, non-pinned, non-fork repo is dormant: last push older than 12 months, no open issues, no detected license. Pinned repos are always skipped to avoid noisy suggestions on intentionally curated work.
- **Data:** `repo.pushedAt`, `repo.isPinned`, open-issue count, detected SPDX license.
- **Suggested action:** If unmaintained, archive to declutter your portfolio. The code stays accessible.
- **Threshold:** Not directly configurable in v0.2. Use `audit.ignore.repos` to suppress noisy hits — see [Audit configuration](/audit/configuration/#ignore).
- **v0.2 limitations:** Composite signal weights are baked in. If any single sub-signal is wrong (e.g. you intentionally keep a license-free experiment around), prefer `audit.ignore.repos` over disabling the whole category. v0.3 will expose per-signal weights.

---

To configure the thresholds and ignores referenced above, see [Audit configuration](/audit/configuration/). To gate CI on these findings, see [CI recipes](/audit/ci-recipes/).
