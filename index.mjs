// @ts-check
// freehire — a career-ops plugin.
//
// Reads the public, keyless search API of freehire.me (an open-source job
// index) and returns its hits as career-ops Jobs. Every hit's `url` is the
// posting's own link (the employer's ATS page or the board it was found on),
// not a freehire page, so the tracker keys on the same URL a direct scan would.
//
//   node plugins.mjs run freehire search "senior golang"   # one-off query
//   scan with a `provider: freehire` entry in portals.yml   # recurring query
//
// All HTTP goes through ctx.fetchJson, so the manifest's allowedHosts applies.

const API = 'https://freehire.me/api/v1/jobs/search';
const PAGE_SIZE = 100; // the API's maximum; larger values are clamped
const DEFAULT_MAX = 100;
const HARD_MAX = 1000;
// freehire's robots.txt asks API clients to name themselves, so a rate-limit
// change can be announced to the client before it meets a 429.
const USER_AGENT = 'career-ops-plugin-freehire/0.1.1 (+https://github.com/strelov1/career-ops-plugin-freehire)';

/**
 * Build the search URL. `filters` maps API query params to a value or a list
 * (lists become repeated params, e.g. countries: [de, nl]). Params are passed
 * through as-is, so any filter the API documents works without a plugin
 * release; one it does not know is reported back and logged by fetchJobs.
 *
 * @param {string} query
 * @param {Record<string, unknown>} filters
 * @param {number} offset
 * @param {number} limit
 */
export function buildUrl(query, filters, offset, limit) {
  const u = new URL(API);
  if (query) u.searchParams.set('q', query);
  for (const [key, value] of Object.entries(filters || {})) {
    if (value == null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) u.searchParams.append(key, String(v));
  }
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));
  return u.toString();
}

/** @param {string} html */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Only periods with an exact annual equivalent are converted; an hourly or
// daily rate would need an assumed working schedule, so it is left off rather
// than guessed.
const ANNUAL_FACTOR = { year: 1, month: 12 };

/** @param {any} e enrichment block */
function salaryOf(e) {
  const factor = ANNUAL_FACTOR[e?.salary_period];
  if (!factor) return undefined;
  const min = Number.isFinite(e.salary_min) ? e.salary_min * factor : undefined;
  const max = Number.isFinite(e.salary_max) ? e.salary_max * factor : undefined;
  if (min == null && max == null) return undefined;
  /** @type {{min?: number, max?: number, currency?: string}} */
  const s = { currency: String(e.salary_currency || '').toUpperCase() };
  if (min != null) s.min = min;
  if (max != null) s.max = max;
  return s;
}

/** @param {any} j */
function locationOf(j) {
  if (j.location) return j.location;
  const where = (j.countries || []).map((c) => String(c).toUpperCase()).join(', ');
  if (j.work_mode === 'remote') return where ? `Remote (${where})` : 'Remote';
  return where;
}

/**
 * Map one API hit to a career-ops Job. Returns null for a hit with no usable
 * title or URL.
 * @param {any} j
 */
export function toJob(j) {
  const title = String(j?.title || '').trim();
  const url = String(j?.url || '').trim();
  if (!title || !/^https:\/\//i.test(url)) return null;
  /** @type {Record<string, unknown>} */
  const job = { title, url, company: j.company || '', location: locationOf(j) };
  const description = htmlToText(j.description) || j.enrichment?.summary || '';
  if (description) job.description = description;
  const posted = Date.parse(j.posted_at || j.created_at || '');
  if (Number.isFinite(posted)) job.postedAt = posted;
  const salary = salaryOf(j.enrichment);
  if (salary) job.salary = salary;
  return job;
}

/**
 * Page through the API until `max` hits or the result set ends.
 * @param {{query?: string, filters?: Record<string, unknown>, max?: number}} spec
 * @param {any} ctx
 */
export async function fetchJobs(spec, ctx) {
  const max = Math.min(Math.max(1, Number(spec.max) || DEFAULT_MAX), HARD_MAX);
  const jobs = [];
  const seen = new Set();
  let warned = false;
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, max - offset);
    const body = /** @type {any} */ (
      await ctx.fetchJson(buildUrl(spec.query || '', spec.filters || {}, offset, limit), {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      })
    );
    const ignored = body?.meta?.ignored_params;
    if (!warned && Array.isArray(ignored) && ignored.length) {
      ctx.log(`freehire: filters not understood and ignored: ${ignored.map((p) => p.param).join(', ')}`);
      warned = true;
    }
    const page = Array.isArray(body?.data) ? body.data : [];
    for (const hit of page) {
      const job = toJob(hit);
      if (!job || seen.has(job.url)) continue;
      seen.add(job.url);
      jobs.push(job);
    }
    const total = Number(body?.meta?.total);
    if (page.length < limit || (Number.isFinite(total) && offset + page.length >= total)) break;
  }
  return jobs;
}

export default {
  provider: {
    id: 'freehire',
    /**
     * A portals.yml entry:
     *   - name: freehire remote golang
     *     provider: freehire
     *     query: golang
     *     filters: { work_mode: remote, seniority: senior, posted_within_days: 7 }
     *     max: 200
     *
     * Declared as an arrow property, not method shorthand: career-ops' plugin
     * audit reads an unqualified fetch followed by a paren as global fetch.
     * @param {any} entry
     * @param {any} ctx
     */
    fetch: async (entry, ctx) => fetchJobs({ query: entry.query, filters: entry.filters, max: entry.max }, ctx),
  },

  /**
   * One-off search. Default filters and max come from this plugin's block in
   * config/plugins.yml (ctx.settings).
   * @param {string} query
   * @param {any} ctx
   */
  async search(query, ctx) {
    const settings = ctx?.settings || {};
    return fetchJobs({ query, filters: /** @type {any} */ (settings.filters), max: /** @type {any} */ (settings.max) }, ctx);
  },
};
