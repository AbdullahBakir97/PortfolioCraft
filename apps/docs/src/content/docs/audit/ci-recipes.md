---
title: CI recipes
description: Common CI integration patterns for the audit subcommand.
---

Three copy-pasteable recipes for the most common ways to wire `mode: audit` into a workflow. All recipes target GitHub-hosted runners and the same Action references the [dogfood workflow](https://github.com/AbdullahBakir97/PortfolioCraft/blob/main/.github/workflows/dogfood.yml) uses — but pinned to floating major tags here for readability. Pin to a SHA in production.

For configuration of thresholds, ignores, and the `fail-on` gate, see [Audit configuration](/audit/configuration/). For the meaning of each finding category, see [Finding catalog](/audit/catalog/).

## Recipe 1: Audit-only weekly cron

A scheduled audit that runs every Monday morning, uploads the artifacts, and posts a one-page summary to the workflow's Job Summary tab. No commits, no PR comments — just a paper trail.

```yaml
# .github/workflows/audit-weekly.yml
name: Audit (weekly)

on:
  schedule:
    - cron: '17 4 * * 1' # 04:17 UTC every Monday
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Run PortfolioCraft audit
        id: audit
        uses: AbdullahBakir97/PortfolioCraft@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          mode: audit
          audit-output-md: audit.md
          audit-output-json: audit.json
          # No fail-on: a weekly cron should never gate other work.

      - name: Upload audit artifacts
        uses: actions/upload-artifact@v4
        with:
          name: audit-${{ github.run_id }}
          path: |
            audit.md
            audit.json
          retention-days: 90

      - name: Post Markdown report to Job Summary
        if: always()
        run: cat audit.md >> "$GITHUB_STEP_SUMMARY"
```

The `id: audit` step exposes `audit-finding-count` and `audit-fail-on-result` as step outputs if you want to wire alerts off them later.

## Recipe 2: Portfolio + audit on README change, gated PR

Run the full portfolio + audit pipeline on any PR that touches the README or the audit config, and block merge when a `high` or `critical` finding shows up. This is the recipe for repos where the audit is a quality bar, not just a report.

```yaml
# .github/workflows/portfolio-and-audit.yml
name: Portfolio + audit

on:
  pull_request:
    paths:
      - 'README.md'
      - '.portfoliocraft.yml'
      - '.github/workflows/portfolio-and-audit.yml'

permissions:
  contents: read
  pull-requests: read

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          # Need full history so PortfolioCraft can render its commit signals.
          fetch-depth: 0

      - name: Run PortfolioCraft (portfolio + audit)
        uses: AbdullahBakir97/PortfolioCraft@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          mode: both
          # Don't commit on PRs — the bot would push to the PR branch.
          commit: false
          dry-run: true
          audit-output-md: audit.md
          audit-output-json: audit.json
          audit-fail-on: high   # gate: high + critical fail this run

      - name: Upload audit artifacts (always)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: audit-pr-${{ github.event.pull_request.number }}
          path: |
            audit.md
            audit.json
          retention-days: 30
```

Pair this with a branch protection rule that requires the `Portfolio + audit` check to pass.

## Recipe 3: PR comment summary

Run the audit on PR open and post the Markdown report as a sticky comment on the PR. The comment is updated in place on every push, not appended — easy to read, no comment spam. Uses `marocchino/sticky-pull-request-comment`.

```yaml
# .github/workflows/audit-pr-comment.yml
name: Audit PR comment

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write   # required to post the sticky comment

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Run PortfolioCraft audit
        uses: AbdullahBakir97/PortfolioCraft@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          mode: audit
          audit-output-md: audit.md
          audit-output-json: audit.json
          # Don't fail the PR — let humans read the comment and decide.

      - name: Post audit as sticky PR comment
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          # 'header' is the dedupe key — keep stable across runs.
          header: portfoliocraft-audit
          path: audit.md
          # Optional: hide the previous comment instead of overwriting.
          # hide_and_recreate: true
```

A few notes on this recipe:

- `pull-requests: write` is the minimum permission to post the comment. The audit itself only needs `contents: read`.
- The `header` value is what dedupes the comment — change it (e.g. `portfoliocraft-audit-v2`) if you want to start a fresh thread without manually deleting the old one.
- For forks, `secrets.GITHUB_TOKEN` is read-only by default. Use `pull_request_target` instead of `pull_request` if you need write access from forked PRs — and read [GitHub's guidance](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/) on `pull_request_target` first.

For more configuration knobs (thresholds, category ignores, output paths) see [Audit configuration](/audit/configuration/).
