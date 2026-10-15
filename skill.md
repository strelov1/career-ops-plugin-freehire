---
name: career-ops-plugin-freehire
description: How to use the freehire plugin to find open job postings on freehire.me and the Job fields it produces.
license: MIT
---

# freehire

freehire.me is an open-source job index. This plugin queries its public search
API (no key) and returns matching open postings as job leads. Each lead's URL is
the posting's own page — the employer's ATS or the board it came from — so
evaluate and apply there, as with any other lead.

## How to run it

- `node plugins.mjs run freehire search "<query>"` — one-off search, e.g.
  `node plugins.mjs run freehire search "senior golang"`. Results go to the
  pipeline.
- Recurring: a `portals.yml` entry with `provider: freehire`, picked up by scan:

  ```yaml
  - name: freehire remote golang
    provider: freehire
    query: golang
    filters:
      work_mode: remote
      seniority: senior
      posted_within_days: 7
    max: 200
  ```

## What it produces

`Job[]` with `title`, `url`, `company`, `location`, and when available
`description` (plain text, the index's preview), `postedAt` (epoch ms) and
`salary` (`{min, max, currency}`, annualized; only yearly and monthly figures are
converted — hourly or daily rates are left off).

## Settings

In `config/plugins.yml` under `plugins.freehire` (used by `search`; a
`portals.yml` entry carries its own):

- `max` — how many results to return (default 100, at most 1000).
- `filters` — query parameters of the freehire search API, passed through as-is.
  A list becomes a repeated parameter. Common ones: `work_mode` (`remote`,
  `hybrid`, `onsite`), `seniority`, `category`, `countries` (ISO codes, lowercase),
  `regions`, `skills`, `salary_min` with `salary_currency` and `salary_period`,
  `posted_within_days`. The full list is in https://freehire.me/openapi.yaml.
  A filter the API does not understand is reported in the log rather than
  silently widening the search.
