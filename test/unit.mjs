// Zero-network unit tests for the URL builder, the hit mapping and paging.
import assert from 'node:assert';
import { buildUrl, toJob, fetchJobs } from '../index.mjs';

// Lists become repeated params; empty values are dropped.
{
  const u = new URL(buildUrl('golang', { countries: ['de', 'nl'], work_mode: 'remote', seniority: '' }, 100, 50));
  assert.deepStrictEqual(u.searchParams.getAll('countries'), ['de', 'nl']);
  assert.strictEqual(u.searchParams.get('q'), 'golang');
  assert.strictEqual(u.searchParams.get('work_mode'), 'remote');
  assert.strictEqual(u.searchParams.has('seniority'), false);
  assert.strictEqual(u.searchParams.get('offset'), '100');
  assert.strictEqual(u.searchParams.get('limit'), '50');
}

// A full hit maps to a Job; monthly salary is annualized.
{
  const job = toJob({
    title: ' Golang Developer ',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    company: 'Acme',
    location: '',
    countries: ['de'],
    work_mode: 'remote',
    description: '<p>Build &amp; ship.</p><ul><li>Go</li></ul>',
    posted_at: '2026-10-14T14:15:11Z',
    enrichment: { salary_min: 3000, salary_max: 4500, salary_currency: 'eur', salary_period: 'month' },
  });
  assert.strictEqual(job.title, 'Golang Developer');
  assert.strictEqual(job.location, 'Remote (DE)');
  assert.strictEqual(job.description, 'Build & ship.\nGo');
  assert.strictEqual(job.postedAt, Date.parse('2026-10-14T14:15:11Z'));
  assert.deepStrictEqual(job.salary, { currency: 'EUR', min: 36000, max: 54000 });
}

// An hourly rate is not annualized by guess; a hit without an https URL is dropped.
{
  const job = toJob({ title: 'X', url: 'https://x.example/1', enrichment: { salary_min: 50, salary_period: 'hour' } });
  assert.strictEqual(job.salary, undefined);
  assert.strictEqual(toJob({ title: 'X', url: 'http://x.example/1' }), null);
  assert.strictEqual(toJob({ title: '', url: 'https://x.example/1' }), null);
}

// Paging stops at max, de-duplicates by URL, and logs ignored filters once.
{
  const calls = [];
  const logs = [];
  const hit = (i) => ({ title: `Job ${i}`, url: `https://x.example/${i}` });
  const ctx = {
    log: (m) => logs.push(m),
    fetchJson: async (url) => {
      const u = new URL(url);
      calls.push(u);
      const offset = Number(u.searchParams.get('offset'));
      const limit = Number(u.searchParams.get('limit'));
      const data = Array.from({ length: limit }, (_, k) => hit(offset + k));
      data.push(hit(offset)); // a duplicate inside the page
      return { data, meta: { total: 1000, ignored_params: [{ param: 'bogus' }] } };
    },
  };
  const jobs = await fetchJobs({ query: 'go', filters: { bogus: 1 }, max: 150 }, ctx);
  assert.strictEqual(jobs.length, 150);
  assert.deepStrictEqual(calls.map((u) => u.searchParams.get('limit')), ['100', '50']);
  assert.deepStrictEqual(logs, ['freehire: filters not understood and ignored: bogus']);
}

// A short page ends the walk.
{
  let n = 0;
  const ctx = { log() {}, fetchJson: async () => (n++, { data: [{ title: 'A', url: 'https://x.example/a' }], meta: { total: 1 } }) };
  const jobs = await fetchJobs({ query: 'go', max: 500 }, ctx);
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(n, 1);
}

console.log('✓ unit ok');
