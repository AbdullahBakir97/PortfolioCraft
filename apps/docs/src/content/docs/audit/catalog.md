---
title: Finding catalog
description: All 9 audit check categories with severity, what triggers them, and how to fix.
---

This is the canonical list of the nine check categories shipped through v0.3. Each section covers what the check is, what data it consumes, the threshold knob (if any), and what the current behavior explicitly does *not* yet do. The threshold knobs all live under `audit.thresholds` in `.portfoliocraft.yml` — see [Audit configuration](/audit/configuration/#thresholds).

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

### `pr-rot` — Awaiting your response (high)

- **Identifier:** `pr-rot` (high-severity branch)
- **Severity:** `high`
- **Trigger (v0.3):** Your own open PR where the **last timeline actor was you** AND age since the last event is more than 90 days. The "ball is in your court" branch.
- **Data:** `userOpenPRs` from the `is:pr is:open author:<user>` search, plus per-PR `timelineItems` (last 30 events: reviews, comments, review requests).
- **Suggested action:** Update with a fresh comment, mark as draft, or close.
- **Threshold:** `audit.thresholds.pr-rot-days` controls the medium-severity entry; 90 days is the high-severity escalation. Both are fixed; per-user override coming in v0.4.
- **Notes:** When the per-PR timeline query fails (rate-limit, transient error), the check falls back to v0.2 age-only behavior. The finding's `metadata.lastActorRole` exposes `'author' | 'reviewer' | 'unknown'` so downstream tools can re-rank.

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

### `pr-rot` — Awaiting your response (medium)

- **Identifier:** `pr-rot` (medium-severity branch)
- **Severity:** `medium`
- **Trigger (v0.3):** Your own open PR where the last timeline actor was you AND age since the last event is between `pr-rot-days` and 90 days.
- **Data:** Same as the high branch.
- **Suggested action:** Update with a fresh comment, mark as draft, or close.
- **Threshold:** `audit.thresholds.pr-rot-days` *(default: 30)*.

### `bug-debt` — Aging open issues (label-weighted)

- **Identifier:** `bug-debt`
- **Severity:** `high` when the dominant label multiplier is ≥ 3 (e.g. `severity:critical` or `severity:high`); otherwise `medium`.
- **Trigger (v0.3):** A non-archived, non-fork repository where `oldestAgeDays × openIssuesCount × labelMultiplier > bug-debt-warn`.
- **Data:** Open-issue count, oldest-issue createdAt, plus the labels of the 25 most recent open issues (sampled).
- **Label multipliers:** `severity:critical` × 4, `critical` × 4, `severity:high` × 3, `priority: high` × 3, `bug` / `defect` / `regression` × 2, `severity:medium` × 1, `severity:low` × 0.5, `enhancement` / `feature-request` × 0.5, `question` × 0.25, `documentation` × 0.5. Untyped issues default to × 1.0. Multi-match takes the max. Floor is 1.0 — labels with weight < 1 don't reduce the multiplier below 1, just fail to elevate it.
- **Suggested action:** Triage the labeled issues — close, fix, or split into smaller issues.
- **Threshold:** `audit.thresholds.bug-debt-warn` *(default: 365)*. The threshold now applies to `weightedDebtScore`.
- **Backward compat:** `metadata.debtScore` (legacy unweighted v0.2 calc) is preserved for downstream tools. `metadata.weightedDebtScore`, `metadata.labelMultiplier`, and `metadata.dominantLabels` are the new fields.

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
- **Threshold:** Not directly configurable. Use `audit.ignore.repos` to suppress noisy hits — see [Audit configuration](/audit/configuration/#ignore).
- **Limitations:** Composite signal weights are baked in. If any single sub-signal is wrong (e.g. you intentionally keep a license-free experiment around), prefer `audit.ignore.repos` over disabling the whole category.

### `unverified-employer-context` — Employer claim vs commit signal

- **Identifier:** `unverified-employer-context` (added in v0.3)
- **Severity:** `info`
- **Trigger:** Either (a) the user's `bio` or `company` mentions a recognizable employer/organization but commit email domains don't reflect it (no overlap), OR (b) the average commit signature ratio across recent history is below 10%.
- **Data:** `snapshot.user.bio`, `snapshot.user.company`, plus `signatureStats.uniqueAuthorEmails` and `signatureStats.signatureRatio` aggregated across all repos. `users.noreply.github.com` emails are filtered out.
- **Suggested action:** Add a verified domain to your GitHub email or update your bio so commit context reflects the employer claim, OR enable GPG/SSH commit signing — published cryptographic signature strengthens employer-verifiable claims.
- **Threshold:** None. Threshold for low-signature branch (10%) is fixed in v0.3.
- **Notes:** Skips silently when no employer hint is parseable from the profile — never emits noise on hobbyist accounts. Severity is intentionally `info` only: this is a *signal weakness*, not a finding of fault. Pair with [`audit.ignore.categories`](/audit/configuration/#ignore) if it produces noise on your specific profile.

---

To configure the thresholds and ignores referenced above, see [Audit configuration](/audit/configuration/). To gate CI on these findings, see [CI recipes](/audit/ci-recipes/).
