# Changesets

This folder is the queue for upcoming releases. Each markdown file describes one user-visible change and the bump type (major/minor/patch) for each affected workspace package.

To add one:

```bash
pnpm changeset
```

…and follow the prompts. On `main`, [release-please](https://github.com/googleapis/release-please) opens a release PR that bumps versions, generates the changelog, and updates the floating `v1` tag.
