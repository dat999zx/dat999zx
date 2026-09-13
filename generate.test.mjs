import assert from 'node:assert/strict';
import test from 'node:test';
import { build, esc, wrap } from './generate.mjs';

const repo = (name, extra = {}) => ({ name, fork: false, private: false, stargazers_count: 1, language: 'TypeScript', pushed_at: '2026-09-01T00:00:00Z', description: 'd', ...extra });
const data = {
  user: { login: 'dat999zx', bio: 'Too human for <AI> & co', created_at: '2018-03-13T00:00:00Z' },
  repos: [repo('knowl', { description: '<script>alert(1)</script> & "memory"' }), repo('secret-thing', { private: true }), repo('forked', { fork: true })],
  langs: { TypeScript: 900, Python: 100 },
  snake: null,
  now: Date.parse('2026-09-13T00:00:00Z'),
};

test('esc and wrap', () => {
  assert.equal(esc(`<a & "b">'`), '&lt;a &amp; &quot;b&quot;&gt;&#39;');
  const lines = wrap('one two three four five six seven eight nine ten', 10, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l.length <= 10) && lines[1].endsWith('…'));
  assert.deepEqual(wrap('abcdefghijklmnop', 5, 9), ['abcde', 'fghij', 'klmno', 'p']);
});

test('build escapes repo text and never shows private repos or forks', () => {
  const out = Object.values(build(data)).join('');
  assert.ok(!out.includes('<script>') && !out.includes('<AI>'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!out.includes('secret-thing') && !out.includes('forked'));
});

test('intro reveals rows in time order', () => {
  const svg = build(data)['terminal.svg'];
  const times = [...svg.matchAll(/to="inline" begin="([\d.]+)s"/g)].map(m => +m[1]);
  assert.ok(times.length > 20);
  times.reduce((prev, t) => (assert.ok(t >= prev, `${t} < ${prev}`), t));
});
