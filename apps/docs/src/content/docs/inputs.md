---
title: Inputs reference
description: Every input the PortfolioCraft Action accepts.
---

| Name             | Default                          | Description                                                                |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `token`          | required                         | `secrets.GITHUB_TOKEN` is enough for public-repo data; PAT for private.    |
| `user`           | token owner                      | GitHub login to profile.                                                   |
| `sections`       | `header,stack,projects,activity` | Comma-separated README sections in order.                                  |
| `locale`         | `en`                             | Template locale (`en` and `ar` ship at launch).                            |
| `output-readme`  | `README.md`                      | README to update between markers. Empty string to skip.                    |
| `output-json`    | `profile.json`                   | JSON Resume output path. Empty string to skip.                             |
| `output-pdf`     | `cv.pdf`                         | PDF CV output path. Empty string to skip.                                  |
| `output-svg-dir` | `assets/cards`                   | Directory for stat cards. Empty string to skip.                            |
| `config-file`    | `.portfoliocraft.yml`              | Optional YAML config to override defaults.                                 |
| `commit`         | `true`                           | Commit generated artifacts back to the repo.                               |
| `commit-message` | `chore: refresh portfolio`       | Commit message used when committing artifacts.                             |
| `dry-run`        | `false`                          | Run end-to-end without writing files or committing.                        |
| `explain`        | `false`                          | Print scoring/classification reasoning to the job log.                     |
