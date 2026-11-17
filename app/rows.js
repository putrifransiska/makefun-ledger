// make.fun ledger rows, shared by every view (loaded with the first one): keyed list patching, the open view's refresh
// schedule, the request tally with its answer clock and countdown, the page navigation, time-left labels updated in
// place, money and count formatting, the @handle lookup, and the shared styles.

import { cachedGet, revalidate, stats } from './core.js';

export function patchList(list, items, keyOf, html) {
  const old = new Map([...list.children].map((el) => [el.dataset.key, el]));
  items.forEach((item, i) => {
    const key = String(keyOf(item)), h = html(item);
    let el = old.get(key);
    old.delete(key);
    if (el?.html !== h) {
      el?.remove();
      el = Object.assign(document.createElement('li'), { innerHTML: h, html: h });
      el.dataset.key = key;
    }
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
  });
  old.forEach((el) => el.remove());
  tick(list);
}

// The open view's data, refreshed every 60 s (side data may ask for longer) while the tab is visible; the view redraws
// only when make.fun's answer changed. A route change drops the schedule.
export function live(path, onData, every = 6e4) {
  const job = { path, every, due: Date.now() + every, data: null };
  job.onData = (data) => data !== job.data && onData((job.data = data));
  jobs.push(job);
  return cachedGet(path, job.onData);
}

// Once a second: start the refreshes that are due, then move the tally's answer clock and countdown in place.
function refreshDue() {
  const now = Date.now();
  for (const job of jobs) if (job.due <= now && !document.hidden) (job.due = now + job.every), revalidate(job.path).then(job.onData, () => {});
  drawClock(now);
}

function drawClock(now = Date.now()) {
  const next = Math.min(...jobs.map((job) => job.due)) - now;
  clock.textContent = (stats.at ? `make.fun answered ${new Date(stats.at).toISOString().slice(11, 19)} UTC` : 'asking make.fun…') +
    (next < 1e9 ? ` · next refresh in ${Math.max(0, Math.ceil(next / 1e3))} s` : '');
}

function drawTally() {
  const [fetched, unchanged, memory] = stats.n;
  counts.innerHTML = `API this page: <b>${fetched}</b> fetched · <b>${memory}</b> from cache · <b>${unchanged}</b> unchanged · `;
  drawClock();
}

// Navigation: the open page marked; Bounty and Leaderboard lead to the bounty last viewed, Profile to the handle last viewed.
function markNav() {
  const bounty = /^#\/bounty\/([^/]+)(\/leaderboard)?\/?$/.exec(location.hash), user = /^#\/u\/@?([^/]+?)\/?$/.exec(location.hash);
  const [toBoard, toBounty, toBoardOf, toProfile] = nav.children;
  if (bounty) last.slug = bounty[1];
  if (user) last.handle = user[1];
  try { localStorage.ledgerLast = JSON.stringify(last); } catch {}
  toBounty.href = `#/bounty/${last.slug}`;
  toBoardOf.href = `#/bounty/${last.slug}/leaderboard`;
  toProfile.href = `#/u/${last.handle}`;
  const open = user ? toProfile : bounty ? (bounty[2] ? toBoardOf : toBounty) : toBoard;
  for (const a of nav.children) a === open ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
}

export function tick(root = document.querySelector('main')) {
  const now = Date.now();
  for (const el of root.querySelectorAll('[data-left]')) {
    const end = Date.parse(el.dataset.left), from = Date.parse(el.dataset.from);
    el.firstChild.textContent = timeLeft(end, now);
    el.className = 'left ' + (end <= now ? 'over' : end - now < 864e5 ? 'soon' : 'ok');
    if (from < end) el.lastChild.style.width = Math.min(100, (now - from) / (end - from) * 100) + '%';
  }
}

function timeLeft(when, now) {
  const s = (when - now) / 1e3, d = s / 86400 | 0, h = s % 86400 / 3600 | 0, m = s % 3600 / 60 | 0;
  return !(s > 0) ? 'ended' : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m || '<1'}m`;
}

export const count = (n) => (+n || 0).toLocaleString('en-US');
export const money = (v) => '$' + (+v || 0).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });

const ROWS_CSS = `
:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
.bar form { margin-left: auto; }
.bar input { width: 7rem; font: inherit; padding: .25rem .55rem; border: 1px solid #3c4f7a; border-radius: 5px; background: #0f1b36; color: #fff; }
.bar nav [aria-current] { color: #fff; font-weight: 700; box-shadow: inset 0 -2px #8fe3b9; }
#tally { order: 9; flex-basis: 100%; margin: 0; font-size: .75rem; color: #b7c3dc; }
#tally b { color: #fff; }
:root { --card: #fff; --muted: #586174; --line: #dde2ea; --money: #08704a; --fee: #6e3600; --fee-bg: #ffd88a; --soon: #c0262d; }
h1 { font: 700 1.6rem/1.15 var(--serif); margin: 0; }
h2 { font-size: .74rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 1.4rem 0 .5rem; }
small { display: block; color: var(--muted); font-size: .8rem; }
button { font: inherit; padding: .35rem .9rem; border: 1px solid var(--line); border-radius: 6px; background: var(--card); cursor: pointer; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
.note { padding: 1.4rem; max-width: 36rem; }
.note p { color: var(--muted); }
.cols { display: none; }
.rows { list-style: none; margin: 0; padding: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.rows:empty { display: none; }
.rows li { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem .6rem; padding: .7rem .9rem; border-top: 1px solid var(--line); }
.rows li:first-child { border-top: 0; }
.rows .title { grid-column: 1 / -1; color: var(--ink); }
.title b { font-weight: 600; }
.rows [data-l]::before { content: attr(data-l); display: block; font-size: .68rem; font-weight: 400; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.paid { display: inline-block; background: var(--fee-bg); color: var(--fee); font-weight: 700; padding: 0 .45rem; border-radius: 4px; }
.free { color: var(--muted); font-weight: 400; font-size: .9rem; }
.left { display: block; padding-bottom: 6px; background: linear-gradient(var(--line), var(--line)) 0 100% / 100% 3px no-repeat; }
.left b { font-weight: 600; }
.left i { display: block; height: 3px; margin: 3px 0 -6px; border-radius: 2px; background: var(--money); }
.left.soon { color: var(--soon); }
.left.soon i { background: var(--soon); }
.left.over { color: var(--muted); }
.left.over i { background: #b9bcc3; }
@media (min-width: 760px) {
  .bar input { width: 8.5rem; }
  .cols, .rows li { display: grid; grid-template-columns: minmax(0, 1fr) 9.5rem 7rem 8rem 5.5rem; gap: 1rem; align-items: center; }
  .cols { padding: 0 .9rem .35rem; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .cols span:nth-child(n+2), .rows li > :nth-child(n+2) { text-align: right; }
  .rows .title { grid-column: auto; }
  .rows [data-l]::before { display: none; }
  .rows li { padding: .5rem .9rem; }
}
`;

const jobs = [];
const nav = document.querySelector('.bar nav');
const tallyEl = document.getElementById('tally');
const counts = tallyEl.appendChild(document.createElement('span'));
const clock = tallyEl.appendChild(document.createElement('span'));
const last = (() => { try { return JSON.parse(localStorage.ledgerLast); } catch {} })() || { slug: 'makefun-frontend-01', handle: 'putrifransiska' };
addEventListener('hashchange', () => ((jobs.length = 0), markNav()));
stats.draw = drawTally;
drawTally();
markNav();
setInterval(refreshDue, 1e3);

// The @handle lookup in the header: opens that profile.
const lookup = Object.assign(document.createElement('form'), {
  innerHTML: '<input name="who" placeholder="@handle" aria-label="Open a profile by handle" autocomplete="off" spellcheck="false">' });
lookup.setAttribute('role', 'search');
tallyEl.after(lookup);
lookup.addEventListener('submit', (e) => {
  e.preventDefault();
  const who = lookup.elements.who, handle = who.value.trim().replace(/^@/, '');
  if (handle) location.hash = `#/u/${encodeURIComponent(handle)}`;
  who.value = '';
});

const sheet = new CSSStyleSheet();
sheet.replaceSync(ROWS_CSS);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
setInterval(() => document.hidden || tick(), 3e4);
