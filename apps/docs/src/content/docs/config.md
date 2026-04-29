---
title: Configuration file
description: Override defaults with .devportfolio.yml
---

```yaml
# .devportfolio.yml
sections: [header, stack, projects, activity]
locale: en
filters:
  exclude_archived: true
  exclude_forks: true
  exclude_topics: [tutorial, exercise]
  min_stars: 0
weights:
  loc: 0.5
  recency: 0.3
  maturity: 0.2
projects:
  pinned_first: true
  max: 6
```

Each section is validated by Zod before the run starts; invalid configs fail loudly with a precise path like `weights: must sum to 1.0`.
