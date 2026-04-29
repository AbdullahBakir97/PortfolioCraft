---
title: Quickstart
description: Wire DevPortfolio into your profile repository in under 60 seconds.
---

```yaml
# .github/workflows/portfolio.yml
name: Portfolio

on:
  schedule:
    - cron: '17 4 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AbdullahBakir97/devportfolio@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

Then drop the markers anywhere in your `README.md`:

```markdown
<!-- DEVPORTFOLIO:START -->
<!-- DEVPORTFOLIO:END -->
```
