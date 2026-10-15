# career-ops-plugin-freehire

A community plugin for [career-ops](https://github.com/career-ops-hq/career-ops).

## What it does

Searches open job postings on [freehire.me](https://freehire.me), an open-source
job index, through its public API — no key, no account. Results land in your
career-ops pipeline like any other lead, and each one links to the posting's own
page (the employer's ATS or the board it came from), not to freehire.

## Install

```bash
node plugins.mjs add strelov1/career-ops-plugin-freehire --sha 61df25db3be84041aa4be2219def0d4dfef623ee
node plugins.mjs enable freehire            # shows the capability card
node plugins.mjs enable freehire --confirm  # grants it
```

Or copy this directory to `plugins.local/freehire/` in your career-ops checkout.

## Use

One-off search:

```bash
node plugins.mjs run freehire search "senior golang"
```

Recurring, as part of `scan` — add an entry to `portals.yml`:

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

## Configure

No keys. Defaults for `search` go in `config/plugins.yml`:

```yaml
plugins:
  freehire:
    enabled: true
    max: 100
    filters:
      work_mode: remote
      countries: [de, nl]
```

`filters` are the [freehire search API](https://freehire.me/openapi.yaml)'s query
parameters, passed through as-is. A filter the API does not understand is logged.

## Test

```bash
node test/unit.mjs && node test/smoke.mjs
```

## License

MIT
