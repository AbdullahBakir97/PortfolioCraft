# Security Policy

## Supported versions

The floating `v1` tag tracks the latest `1.x` release. Security fixes land on `main` and are tagged within 7 days for users pinning specific SHAs.

| Version | Supported          |
| ------- | ------------------ |
| `v1.x`  | ✅                 |
| `< v1`  | ❌                 |

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Use GitHub's [private vulnerability reporting](https://github.com/AbdullahBakir97/portfoliocraft/security/advisories/new) or email `abdullah.bakir.1997@gmail.com` with:

- A description of the issue and impact.
- Steps to reproduce (a minimal workflow snippet is ideal).
- Affected version (`v1.x.y` or commit SHA).
- Whether the issue is already known publicly.

You will receive an acknowledgement within **72 hours**. We aim to ship a fix or mitigation within **14 days** of confirmation, coordinated with you on disclosure timing.

## Hardening guarantees

- Releases ship signed build provenance via `actions/attest-build-provenance`.
- Each release attaches a CycloneDX SBOM produced by `anchore/sbom-action`.
- The Action runs with `step-security/harden-runner` in CI, restricting outbound network calls during build.
- CodeQL runs on every PR and on a weekly schedule.

## Token scope

The Action only reads through the GitHub API by default; it writes only when `commit: true`. With `secrets.GITHUB_TOKEN`, the standard `contents: write` permission is sufficient — **no organization-level permissions** are required.
