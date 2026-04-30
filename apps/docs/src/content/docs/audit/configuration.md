---
title: Audit configuration
description: Configure audit thresholds, ignores, and outputs in .portfoliocraft.yml.
---

The audit subcommand reads its configuration from the same `.portfoliocraft.yml` file the portfolio generator uses. Everything lives under a single `audit:` block. Every field has a default, so an empty block is valid.

```yaml
# .portfoliocraft.yml
audit:
  enabled: true
  thresholds:
    stale-repo-months: 6
    pr-rot-days: 30
    bug-debt-warn: 365
  ignore:
    repos: []                # globs supported, e.g. "old-experiments-*"
    categories: []           # disable specific check categories
  outputs:
    markdown: audit.md
    json: audit.json
  fail-on: ''                # '' | low | medium | high | critical
```

The block is validated with Zod before the run starts; an invalid value fails the run with a precise path like `audit.thresholds.stale-repo-months: must be a positive integer`.

## `enabled`

**Default:** `true`.

Master switch. When `false`, `mode: audit` and `mode: both` skip the audit phase entirely and exit 0 without writing audit artifacts. Use this to keep the config block versioned in your repo while temporarily turning the feature off.

## `thresholds`

The three knobs that drive the age-based checks. All values are positive integers.

- **`stale-repo-months`** *(default: `6`)* — A non-archived, non-fork repo is flagged as stale when its last push is older than this many months. Feeds the `stale` check.
- **`pr-rot-days`** *(default: `30`)* — One of your own open PRs is flagged when it has been open longer than this many days. Feeds the `pr-rot` check. PRs older than 90 days are escalated to `high` regardless of this setting.
- **`bug-debt-warn`** *(default: `365`)* — A repo with open issues is flagged when its oldest open issue is older than this many days. Feeds the `bug-debt` check.

The catalog page documents which check each knob drives — see [Finding catalog](/audit/catalog/).

## `ignore`

Two list filters applied before findings are emitted.

- **`repos`** *(default: `[]`)* — Glob patterns matched against `owner/name`. Anything matching is excluded from every check. Useful for archived demo repos you intentionally keep around. Example: `["abdullahbakir97/old-experiments-*", "abdullahbakir97/scratch"]`.
- **`categories`** *(default: `[]`)* — A list of category identifiers to disable wholesale. Valid values: `stale`, `license`, `docs`, `tests`, `pr-rot`, `bug-debt`, `archived`, `archive-suggestion`.

Ignores are applied at the finding level — if a repo matches both `ignore.repos` and would otherwise produce a `license` finding, the finding is dropped. Counts in the summary section reflect the post-filter view.

## `outputs`

Where to write the two report artifacts.

- **`markdown`** *(default: `audit.md`)* — Path to the Markdown report. Set to the empty string `''` to skip Markdown output.
- **`json`** *(default: `audit.json`)* — Path to the JSON report. Set to the empty string `''` to skip JSON output.

The Markdown block is idempotent between `<!-- PORTFOLIOCRAFT-AUDIT:START -->` markers; safe to commit. The JSON is validated against the `AuditReport` Zod schema (`schemaVersion: "1.0.0"`).

## `fail-on`

**Default:** `''` (never fails).

Severity floor that gates the run's exit code. When a finding meets or exceeds this level, the runner exits non-zero — useful for blocking a PR. Valid values:

| Value        | Effect                                            |
| ------------ | ------------------------------------------------- |
| `''` (empty) | Never fails. Exit code is always 0.               |
| `low`        | Any non-`info` finding fails the run.             |
| `medium`     | `medium`, `high`, or `critical` findings fail.    |
| `high`       | `high` or `critical` findings fail.               |
| `critical`   | Only `critical` findings fail. (v0.3+ checks.)    |

The Action input `audit-fail-on` overrides this YAML field on a per-run basis.

## Action input mapping

When the same setting can be controlled from `.portfoliocraft.yml` and from the Action's `with:` block, the Action input wins so CI can override per-run without editing the committed config.

| YAML config             | Action input         | Notes                                                         |
| ----------------------- | -------------------- | ------------------------------------------------------------- |
| `audit.outputs.markdown`| `audit-output-md`    | Empty string in either disables the Markdown report.          |
| `audit.outputs.json`    | `audit-output-json`  | Empty string in either disables the JSON report.              |
| `audit.fail-on`         | `audit-fail-on`      | Action input overrides YAML.                                  |
| `audit.enabled`         | `mode`               | `mode: audit` requires `enabled: true` (or unset). `mode: both` runs portfolio + audit. |
| `audit.thresholds.*`    | *(not exposed)*      | Thresholds are config-only; promote a per-repo file to change. |
| `audit.ignore.*`        | *(not exposed)*      | Ignores are config-only.                                      |

For the full Action input list, see [Inputs reference](/inputs/). For workflow recipes, see [CI recipes](/audit/ci-recipes/).
