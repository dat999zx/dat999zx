// Builds the profile SVGs into dist/ from live GitHub data.
// Run: GITHUB_TOKEN=$(gh auth token) node generate.mjs   (token optional locally)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const USER = 'dat999zx';
const FEATURED = ['knowl', 'hermes-discord-router', 'auction', 'why-error'];
const TAGLINE = 'they build memory for coding agents';
const TODOS = [[true, 'give coding agents a memory (knowl)'], [true, 'bridge Discord and Hermes'], [false, 'touch grass']];
const VERBS = ['Noodling', 'Pondering', 'Clauding', 'Percolating', 'Moseying', 'Cogitating', 'Schlepping', 'Honking', 'Simmering', 'Wrangling'];

const C = { bg: '#141413', bar: '#1f1e1d', line: '#3a3935', fg: '#faf9f5', dim: '#8f8d85', acc: '#d97757', ok: '#6bbf6b' };
const LANG = { TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Java: '#b07219', 'C#': '#178600', HTML: '#e34c26', CSS: '#663399', Luau: '#00a2ff', Shell: '#89e051' };
const FONT = "ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,'DejaVu Sans Mono',monospace";
const W = 860, FS = 14, LH = 21, PAD = 22, BODY = 62, TYPE = 0.06;
const CW = 8.4; // widest common monospace advance at 14px; narrower fonts just leave small gaps
const X = col => (PAD + col * CW).toFixed(1);

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function wrap(text, width, maxLines) {
  let lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + word).length <= width) lines[lines.length - 1] += ' ' + word;
    else lines.push(word);
  }
  lines = lines.flatMap(l => l.match(new RegExp(`.{1,${width}}`, 'g')));
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, width - 1).trimEnd() + '…';
  }
  return lines;
}

export function ago(iso, now) {
  const s = (now - Date.parse(iso)) / 1000;
  for (const [n, u] of [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']]) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return 'just now';
}

// --- SVG primitives (SMIL, so it runs inside <img> without JS) ---
// Answer screens loop off an anchor animation "L": GitHub strips loading="lazy", so a screen inside a
// closed <details> starts playing at page load; looping means opening it still shows it playing.
let loop = false;
const begin = at => `${loop ? 'L.begin+' : ''}${at.toFixed(2)}s`;
const setD = (to, at) => `<set attributeName="display" to="${to}" begin="${begin(at)}" fill="freeze"/>`;
const show = at => (loop ? setD('none', 0) : '') + setD('inline', at); // reset first so each loop starts hidden
const appear = (at, inner, until) => `<g display="none">${show(at)}${until ? setD('none', until) : ''}${inner}</g>`;
const seg = (col, text, cls = 'fg') => `<tspan x="${X(col)}" class="${cls}">${esc(text)}</tspan>`;
const cursor = (until, x) => `<tspan${x ? ` x="${x}"` : ''} class="fg">█<animate attributeName="fill-opacity" values="1;0" calcMode="discrete" dur="1s" repeatCount="indefinite"/>${until ? (loop ? setD('inline', 0) : '') + setD('none', until) : ''}</tspan>`;
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽'];

function svgDoc(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:space="preserve" font-family="${FONT}" font-size="${FS}">` +
    `<title>${esc(title)}</title><style>text{white-space:pre}.fg{fill:${C.fg}}.dim{fill:${C.dim}}.acc{fill:${C.acc}}.ok{fill:${C.ok}}.b{font-weight:700}.done{fill:${C.dim};text-decoration:line-through}</style>` +
    body + '</svg>';
}

function frame(h, title, body) {
  return svgDoc(W, h, title,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>` +
    `<path d="M0.5 32V10.5a10 10 0 0 1 10-10H${W - 10.5}a10 10 0 0 1 10 10V32z" fill="${C.bar}" stroke="${C.line}"/>` +
    ['#ff5f57', '#febc2e', '#28c840'].map((f, i) => `<circle cx="${20 + i * 20}" cy="16.5" r="6" fill="${f}"/>`).join('') +
    `<text x="${W / 2}" y="21" text-anchor="middle" class="dim" font-size="12">${esc(title)}</text>` + body);
}

// A scripted session: rows advance down the window, `at` advances through time.
function term() {
  const parts = [];
  let row = 0, at = 0;
  const y = (r = row) => BODY + r * LH;
  const t = {
    parts, y,
    get row() { return row; },
    get at() { return at; },
    wait(dt) { at += dt; return t; },
    skip(n = 1) { row += n; return t; },
    line(inner, until) { parts.push(appear(at, `<text y="${y()}">${inner}</text>`, until)); row++; return t; },
    rules(until) {
      parts.push(appear(at, `<path d="M${PAD} ${y() - LH + 4}H${W - PAD}M${PAD} ${y() + 9}H${W - PAD}" stroke="${C.line}"/>`, until));
    },
    prompt(text) {
      const start = at + 0.35, end = start + text.length * TYPE + 0.3;
      const chars = [...text].map((ch, i) => `<tspan display="none">${show(start + i * TYPE)}${esc(ch)}</tspan>`).join('');
      t.rules(end);
      parts.push(appear(at, `<text x="${X(0)}" y="${y()}"><tspan class="dim">&gt; </tspan><tspan class="fg">${chars}</tspan>${cursor(end)}</text>`));
      at = end; row += 2;
      return t;
    },
    spin(dur, verb) {
      const glyphs = GLYPHS.map((g, i) => `<text x="${X(0)}" y="${y()}" class="acc">${g}<animate attributeName="fill-opacity" values="${GLYPHS.map((_, j) => +(i === j)).join(';')}" calcMode="discrete" dur="0.72s" repeatCount="indefinite"/></text>`).join('');
      parts.push(appear(at, glyphs + `<text y="${y()}">${seg(2, `${verb}…`, 'acc')}<tspan class="dim"> (esc to interrupt)</tspan></text>`, at + dur));
      at += dur;
      return t;
    },
    tool(name, args, rows = []) {
      t.line(`${seg(0, '●', 'ok')}${seg(2, name, 'fg b')}<tspan class="fg">(${esc(args)})</tspan>`);
      rows.forEach((r, i) => t.wait(0.09).line((i ? '' : seg(2, '⎿', 'dim')) + r));
      return t.skip().wait(0.3);
    },
    say(lines) {
      lines.forEach((l, i) => t.line((i ? '' : seg(0, '●', 'fg')) + seg(2, l)).wait(0.18));
      return t.skip();
    },
    idle() {
      t.rules();
      t.line(seg(0, '>', 'dim') + cursor(0, X(2)));
      return t.line(seg(0, '? for shortcuts', 'dim'));
    },
  };
  return t;
}

function clawd(x, y, at) {
  const grid = ['000111111111111000', '000110111111011000', '011111111111111110', '000111111111111000', '000010100001010000'];
  const pw = 6, ph = 12;
  const px = grid.flatMap((r, j) => [...r.matchAll(/1+/g)].map(m => `<rect x="${x + m.index * pw}" y="${y + j * ph}" width="${m[0].length * pw}" height="${ph}"/>`));
  const blink = `<g fill-opacity="0">${[5, 12].map(i => `<rect x="${x + i * pw}" y="${y + ph}" width="${pw}" height="${ph}"/>`).join('')}<animate attributeName="fill-opacity" values="0;1" keyTimes="0;0.95" calcMode="discrete" dur="4s" begin="${at}s" repeatCount="indefinite"/></g>`;
  return `<g fill="${C.acc}" shape-rendering="crispEdges">${px.join('')}${blink}</g>`;
}

// --- screens ---
function intro(d) {
  const t = term();
  const { user, repos } = d, stars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const recent = [...repos].sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at)).slice(0, 2);
  const since = new Date(user.created_at).getUTCFullYear();
  const knowl = repos.find(r => r.name === 'knowl');

  // welcome box, rows 0..7
  const bx = PAD, by = t.y(0) - 8, bw = W - 2 * PAD, bh = 7 * LH + 8, dx = bx + 330, cx = bx + 165, rx = dx + 22;
  t.parts.push(
    `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="none" stroke="${C.acc}"/>`,
    `<rect x="${bx + 14}" y="${by - 8}" width="${13 * CW}" height="16" fill="${C.bg}"/><text x="${bx + 14 + CW}" y="${by + 5}" class="acc">Claude Code</text>`,
    `<path d="M${dx} ${by + 14}V${by + bh - 14}" stroke="${C.acc}" stroke-opacity="0.45"/>`,
    `<text x="${cx}" y="${t.y(1)}" text-anchor="middle" class="fg b">Welcome back, ${esc(user.login)}!</text>`,
    clawd(cx - 54, t.y(1) + 12, 1),
    `<text x="${cx}" y="${t.y(5) + 4}" text-anchor="middle" class="dim">${esc(user.bio || '')}</text>`,
    `<text x="${cx}" y="${t.y(6) + 4}" text-anchor="middle" class="dim">~/${esc(user.login)}</text>`,
    `<text x="${rx}" y="${t.y(1)}" class="acc b">Recent activity</text>`,
    ...recent.map((r, i) => `<text x="${rx}" y="${t.y(2 + i)}"><tspan class="fg">${esc(r.name)}</tspan><tspan class="dim"> · pushed ${ago(r.pushed_at, d.now)}</tspan></text>`),
    `<path d="M${rx} ${t.y(4) - 6}H${bx + bw - 22}" stroke="${C.line}"/>`,
    `<text x="${rx}" y="${t.y(5) - 2}" class="acc b">Stats</text>`,
    `<text x="${rx}" y="${t.y(6) - 2}" class="fg">★ ${stars} stars · ${repos.length} public repos · since ${since}</text>`,
  );

  t.skip(9).wait(0.6)
    .prompt(`who is ${user.login}?`)
    .spin(1.4, d.verb(0))
    .tool('Bash', `gh api users/${user.login}`, [seg(5, `"${user.bio || '…'}" · ${repos.length} public repos · on GitHub since ${since}`, 'dim')])
    .spin(0.7, d.verb(1))
    .say([`I tried to summarize ${user.login}, but they're too human for AI.`, `Closest I got: ${TAGLINE},`, `best known for knowl${knowl ? ` (★${knowl.stargazers_count})` : ''}.`])
    .line(seg(2, '↓ pick a prompt below to keep going', 'acc')).skip().wait(0.4)
    .idle();
  return frame(t.y() + 10, `claude — ~/${user.login}`, t.parts.join(''));
}

const HOLD = 10; // seconds an answer screen rests on its final frame before replaying
function screen(cmd, build) {
  loop = true;
  const t = term().skip().prompt(cmd);
  build(t);
  const anchor = `<rect width="0" height="0"><animate id="L" attributeName="x" from="0" to="0" dur="${(t.at + HOLD).toFixed(2)}s" begin="0s;L.end"/></rect>`;
  loop = false;
  return frame(t.y() - LH + 18, `claude — ${cmd}`, t.parts.join('') + anchor);
}

const projects = d => screen('/projects', t => {
  const list = [...d.repos].sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  t.spin(0.9, d.verb(2))
    .tool('Bash', `gh repo list ${USER} --source`, list.map(r =>
      seg(5, r.name, 'fg b') + seg(30, `★ ${r.stargazers_count}`, 'acc') + seg(38, r.language || '—', 'dim') + seg(52, `pushed ${ago(r.pushed_at, d.now)}`, 'dim')))
    .say([`${list.length} public repos. The cards below open each one ↓`]);
});

const stack = d => screen('/stack', t => {
  const total = Object.values(d.langs).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(d.langs).sort((a, b) => b[1] - a[1]);
  const shown = top.slice(0, 5), rest = top.slice(5).reduce((s, [, v]) => s + v, 0);
  if (rest) shown.push(['other', rest]);
  const bx = +X(20), max = 420;
  t.spin(0.9, d.verb(3)).line(`${seg(0, '●', 'ok')}${seg(2, 'Bash', 'fg b')}<tspan class="fg">(gh api "repos/${USER}/*/languages")</tspan>`);
  shown.forEach(([name, bytes], i) => {
    t.wait(0.12);
    const pct = bytes / total * 100, w = Math.max(2, pct / 100 * max).toFixed(1), y = t.y() - 10;
    t.parts.push(appear(t.at, `<rect x="${bx}" y="${y}" width="0" height="11" rx="2" fill="${LANG[name] || C.dim}"><animate attributeName="width" from="0" to="${w}" begin="${begin(t.at)}" dur="0.7s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/></rect>`));
    t.line((i ? '' : seg(2, '⎿', 'dim')) + seg(5, name, 'fg') + `<tspan x="${(bx + max + 14).toFixed(1)}" class="dim">${esc(pct < 1 ? '<1' : Math.round(pct))}%</tspan>`);
  });
  t.skip().wait(0.9).say([`Mostly ${shown[0]?.[0] ?? 'code'}${shown[1] ? `, with ${shown.slice(1, 3).map(s => s[0]).join(' and ')} on the side` : ''}.`]);
});

const now = d => screen('/now', t => {
  const recent = [...d.repos].sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at)).slice(0, 3);
  t.spin(0.9, d.verb(4))
    .tool('Bash', `gh repo list ${USER} --json name,pushedAt`, recent.map(r => seg(5, r.name, 'fg b') + seg(30, `pushed ${ago(r.pushed_at, d.now)}`, 'dim')))
    .line(`${seg(0, '●', 'ok')}${seg(2, 'Update Todos', 'fg b')}`);
  const tick = t.at + 0.6;
  TODOS.forEach(([done, text], i) => {
    const at = tick + i * 0.5, pre = i ? '' : seg(2, '⎿', 'dim');
    t.wait(0.09);
    if (!done) return t.line(pre + seg(5, '☐', 'fg') + seg(7, text, 'fg'));
    t.line(seg(5, '☐', 'fg') + seg(7, text, 'fg'), at);
    t.parts.push(appear(t.at, `<text y="${t.y(t.row - 1)}">${pre}</text>`), appear(at, `<text y="${t.y(t.row - 1)}">${seg(5, '☒', 'ok')}${seg(7, text, 'done')}</text>`));
  });
});

const contributions = d => screen('/contributions', t => {
  t.spin(0.9, d.verb(5)).line(`${seg(0, '●', 'ok')}${seg(2, 'Bash', 'fg b')}<tspan class="fg">(snake --eat ~/contributions)</tspan>`);
  const [, vb = '0 0 880 192'] = d.snake.match(/viewBox="([^"]+)"/) || [];
  const [, , vw, vh] = vb.split(/\s+/).map(Number), w = W - 2 * PAD - 20, h = Math.round(w * vh / vw);
  const inner = d.snake.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  t.parts.push(appear(t.at + 0.2, `<svg x="${PAD + 10}" y="${t.y() - 6}" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`));
  t.skip(Math.ceil(h / LH)).wait(0.4).line(seg(2, '⎿', 'dim') + seg(5, 'runs daily · still hungry', 'dim'));
});

function card(r, nowMs) {
  const w = 420, h = 144, x = 18;
  const desc = wrap(r.description || 'no description yet', 42, 3);
  return svgDoc(w, h, `${r.name}: ${r.description || ''}`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>` +
    `<text x="${x}" y="32"><tspan class="ok">●</tspan><tspan x="${x + 2 * CW}" class="fg b">${esc(r.name)}</tspan></text>` +
    `<text x="${w - x}" y="32" text-anchor="end" class="acc">★ ${r.stargazers_count}</text>` +
    `<text x="${x + 2 * CW}" y="57" class="dim">⎿</text>` +
    desc.map((l, i) => `<text x="${x + 5 * CW}" y="${57 + i * 19}" class="${r.description ? 'fg' : 'dim'}">${esc(l)}</text>`).join('') +
    `<circle cx="${x + 5}" cy="${h - 23}" r="5" fill="${LANG[r.language] || C.dim}"/>` +
    `<text x="${x + 16}" y="${h - 18}" class="dim">${esc(r.language || '—')} · pushed ${ago(r.pushed_at, nowMs)}</text>` +
    `<text x="${w - x}" y="${h - 18}" text-anchor="end" class="acc">open ↗</text>`);
}

// Pure: data in, { filename: svg } out.
export function build({ user, repos, langs, snake, now: nowMs }) {
  repos = repos.filter(r => !r.fork && !r.private && r.name !== user.login);
  const day = Math.floor(nowMs / 864e5);
  const d = { user, repos, langs, snake, now: nowMs, verb: k => VERBS[(day + k) % VERBS.length] };
  const files = { 'terminal.svg': intro(d), 'projects.svg': projects(d), 'stack.svg': stack(d), 'now.svg': now(d) };
  if (snake) files['contributions.svg'] = contributions(d);
  for (const r of repos) if (FEATURED.includes(r.name)) files[`card-${r.name}.svg`] = card(r, nowMs);
  return files;
}

async function main() {
  const headers = { 'User-Agent': USER, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const gh = async path => {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const user = await gh(`/users/${USER}`);
  const repos = (await gh(`/users/${USER}/repos?per_page=100`)).filter(r => !r.fork && !r.private && r.name !== USER);
  const langs = {};
  for (const l of await Promise.all(repos.map(r => gh(`/repos/${USER}/${r.name}/languages`))))
    for (const [k, v] of Object.entries(l)) langs[k] = (langs[k] || 0) + v;
  const snake = await readFile('dist/snake-raw.svg', 'utf8').catch(() => null);
  await mkdir('dist', { recursive: true });
  const files = build({ user, repos, langs, snake, now: Date.now() });
  for (const [name, svg] of Object.entries(files)) await writeFile(`dist/${name}`, svg);
  console.log('wrote', Object.keys(files).join(', '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
