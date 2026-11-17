// make.fun ledger, shared by the bounty, leaderboard and profile views (loaded with the first of them by import()):
// windowed and paginated keyed lists, in-place part updates, avatars, score formatting, UTC dates, and these views' styles.

import { esc } from './core.js';
import { count, money, patchList, tick } from './rows.js';

// Windowed list for leaderboards of thousands: the list keeps its full height (rows x --row px) but only the rows near
// the screen exist as nodes; scrolling patches which rows exist, a refresh patches them in place.
export function virtualRows(list, keyOf, rowHtml, onWindow) {
  const win = { list, keyOf, rowHtml, onWindow, items: [] };
  const redraw = () => (list.isConnected ? drawWindow(win) : (removeEventListener('scroll', redraw), removeEventListener('resize', redraw)));
  addEventListener('scroll', redraw, { passive: true });
  addEventListener('resize', redraw);
  return (items) => ((win.items = items), drawWindow(win));
}

function drawWindow({ list, keyOf, rowHtml, onWindow, items }) {
  const h = parseFloat(getComputedStyle(list).getPropertyValue('--row')) || 60;
  const top = -list.getBoundingClientRect().top, n = items.length;
  const from = Math.max(0, Math.floor(top / h) - 6), to = Math.min(n, Math.ceil((top + innerHeight) / h) + 6);
  list.style.height = n * h + 'px';
  patchList(list, items.slice(from, to), keyOf, rowHtml);
  [...list.children].forEach((el, i) => (el.style.top = (from + i) * h + 'px'));
  onWindow?.(Math.min(n, Math.max(1, Math.floor(top / h) + 1)), Math.min(n, Math.floor((top + innerHeight) / h)), list.children.length, n);
}

// Long lists show one page and grow by "Show more"; a refresh patches the shown rows in place and keeps the count.
export function paginate(list, more, keyOf, rowHtml, page = 50) {
  const pager = { list, more, keyOf, rowHtml, page, items: [], shown: page };
  more.addEventListener('click', () => ((pager.shown += page), showPage(pager)));
  return (items) => ((pager.items = items), showPage(pager));
}

function showPage({ list, more, keyOf, rowHtml, page, items, shown }) {
  patchList(list, items.slice(0, shown), keyOf, rowHtml);
  more.hidden = shown >= items.length;
  more.textContent = `Show ${Math.min(page, items.length - shown)} more · ${count(Math.min(shown, items.length))} of ${count(items.length)} shown`;
}

// Update one part of a view only when its HTML changed (so a refresh with the same data touches nothing).
export function setHtml(el, html) {
  if (el && el.html !== html) (el.innerHTML = el.html = html), tick(el);
}

// Avatars load from wherever the API points (absolute URL or a make.fun /api/avatars path), CORS mode set before src.
export function avatarImg(url, handle, size = 28) {
  if (!url || typeof url !== 'string') return `<span class="av" style="--s:${size}px" aria-hidden="true">${esc((handle || '?')[0].toUpperCase())}</span>`;
  const src = url.startsWith('/') ? 'https://make.fun' + url : url;
  return `<img class="av" crossorigin="anonymous" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" style="--s:${size}px">`;
}

// A leaderboard value as people read it: micro-unit rates as percents, byte counts in KB, anything else as displayed.
export function formatScore(column, value, display) {
  if (value == null || value === '') return display ?? '—';
  if (/_micro$/.test(column?.source || '')) return `${(value / 1e4).toFixed(1)}%`;
  if (column?.key === 'bytes') return kilobytes(+value);
  return display ?? String(value);
}

export function statTile(label, value, sub = '', cls = '') {
  return `<div class="stat ${cls}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

// The entry fee is paid once per account, never per entry (an account that paid it may keep up to 10 entries).
export function feeTile(fee) {
  return Number(fee) > 0
    ? statTile('Entry fee', `<i class="paid">${money(fee)}</i>`, 'once per account', 'fee')
    : statTile('Entry fee', '<i class="free">Free</i>', 'no fee to enter', 'fee');
}

export function crumbs(...links) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Board</a>${links.map((l) => ` <i>›</i> ${l}`).join('')}</nav>`;
}

// Dates are shown in UTC, the zone make.fun's deadlines are set in, never in the viewer's machine zone.
export function day(v) {
  return v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export function utc(v) {
  return v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—';
}

// The ranking column of a leaderboard (rank_key), else its first visible column.
export function scoreColumn(lb) {
  const cols = (lb.columns || []).filter((c) => !c.hidden);
  return cols.find((c) => c.key === lb.rank_key) || cols[0];
}

// rows=first answers the top entries in full and the rest as compact rows (rank, handle, title, value, interval):
// one list in the full shape.
export function leaderboardEntries(lb) {
  const k = lb.rank_key;
  return [...(lb.entries || []), ...(lb.rest || []).map((r) => ({ ...r, values: { [k]: r.value }, display: { [k]: r.display } }))];
}

export function ordinal(n) {
  return n + ((n % 100 > 10 && n % 100 < 14) || !(n % 10 < 4) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10]);
}

export function kilobytes(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

const VIEW_CSS = `
[hidden] { display: none !important; }
.crumbs { font-size: .85rem; color: var(--muted); margin-bottom: .6rem; }
.crumbs i { font-style: normal; margin: 0 .25rem; }
.vhead { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: flex-start; justify-content: space-between; margin-bottom: .9rem; }
.vhead p { margin: .3rem 0 0; color: var(--muted); }
.chip { display: inline-block; font-size: .8rem; font-weight: 600; padding: .2rem .65rem; border-radius: 99px; white-space: nowrap; }
.chip.open { background: #d8f3e4; color: #075c37; }
.chip.closed { background: #fdecc8; color: #7a4100; }
.chip.done { background: #e6e7ea; color: #3c414b; }
.stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: 0 0 1rem; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .65rem .8rem; min-width: 0; }
.stat > span { display: block; font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.stat > b { display: block; font-size: 1.35rem; line-height: 1.3; }
.stat.pot > b { color: var(--money); }
.stat i { font-style: normal; }
.stat .paid { font-size: 1.1rem; }
.stat .free { color: var(--muted); font-weight: 500; }
.stat a { color: inherit; }
.stat .left { padding-bottom: 7px; }
.card { padding: .9rem 1rem; margin-bottom: 1rem; }
.card > h2 { margin-top: 0; }
.cta { display: inline-block; background: var(--navy); color: #fff; font-weight: 600; padding: .5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.cta:hover { text-decoration: none; background: #23396b; }
.split { display: grid; gap: 0 1rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .35rem .4rem; text-align: right; border-top: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; }
thead th { border-top: 0; font-size: .7rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
td.now { color: var(--money); font-weight: 600; }
tfoot td { font-weight: 700; border-top: 0; border-bottom: 3px double var(--ink); }
thead th { border-bottom: 2px solid var(--ink); }
.prose { overflow-wrap: anywhere; }
.prose h3, .prose h4 { font-size: 1rem; margin: 1.1rem 0 .3rem; }
.prose p, .prose ul, .prose ol { margin: .4rem 0; }
.prose ul, .prose ol { padding-left: 1.3rem; }
.prose code { font-size: .85em; background: #f0efe9; padding: 0 .25rem; border-radius: 4px; }
.prose pre { overflow: auto; background: #f0efe9; padding: .6rem; border-radius: 6px; }
details.card { padding: 0; }
details > summary { cursor: pointer; padding: .9rem 1rem; font-weight: 600; }
details > summary small { display: inline; font-weight: 400; margin-left: .4rem; }
details > .prose { padding: 0 1rem 1rem; border-top: 1px solid var(--line); }
.note-rules { background: #fff7e6; border-radius: 6px; padding: .5rem .7rem; color: #6b4a00; }
.av { width: var(--s); height: var(--s); border-radius: 50%; flex: none; object-fit: cover; background: #dfe3ea; display: inline-grid; place-items: center; font-size: calc(var(--s) * .45); font-weight: 600; color: #4a5160; vertical-align: middle; }
.lbtools { display: flex; flex-wrap: wrap; gap: .4rem 1rem; align-items: center; margin: 0 0 .6rem; font-size: .85rem; color: var(--muted); }
.lbtools input { font: inherit; font-size: .95rem; padding: .3rem .7rem; border: 1px solid var(--line); border-radius: 6px; width: 15rem; max-width: 100%; }
.lbtools b { color: var(--ink); }
.vlist { position: relative; --row: 84px; }
.rows.vlist:empty { display: block; }
.vlist > li { position: absolute; left: 0; right: 0; height: var(--row); box-sizing: border-box; overflow: hidden; border-top: 1px solid var(--line); }
.lb li { grid-template-columns: 2.4rem minmax(0, 1fr); align-items: center; }
.lb .rank { font-weight: 700; color: var(--muted); font-size: 1.05rem; }
.lb .who { display: flex; gap: .55rem; align-items: center; min-width: 0; }
.lb .who > span { min-width: 0; }
.lb .who a { font-weight: 600; }
.lb .who small, .entries .title small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb .score b { font-size: 1.05rem; }
.lb .score small { display: inline; margin-left: .35rem; font-size: .72rem; }
.lb .score { white-space: nowrap; }
.lb li { padding: .55rem .8rem; }
.lb .metrics { grid-column: 2; display: flex; justify-content: space-between; gap: 1rem; }
.lb .metrics [data-l]::before { display: none; }
.lb li > .who { text-align: left; }
.lb .prize b { color: var(--money); }
.lb li:has(.place) { box-shadow: inset 3px 0 var(--money); }
.lb li:has(.place) .rank { color: var(--money); }
.lb .none { color: var(--muted); }
.prizebar { margin: 0 0 .6rem; padding: .4rem .75rem; border-radius: 6px; background: #e1f4ea; color: #0b4d31; }
.lb .vhead { align-items: center; margin-bottom: .6rem; }
.lb .vhead > div { min-width: 0; }
.lb h1 { font-size: 1.4rem; }
.lb .vhead .cta { margin: 0; padding: .35rem .85rem; font-size: .9rem; white-space: nowrap; }
.more { display: block; margin: .8rem auto 0; padding: .5rem 1.2rem; }
.phead { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; padding: 1rem; margin-bottom: 1rem; }
.phead > div:nth-child(2) { flex: 1; min-width: 10rem; }
.hero span { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.hero b { display: block; font: 700 2.3rem/1.1 var(--serif); color: var(--money); }
.payouts td { white-space: nowrap; }
.payouts td:first-child { max-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; }
.payouts a { color: inherit; }
.phead h1 { overflow-wrap: anywhere; }
.phead p { margin: .2rem 0 0; color: var(--muted); }
.links { display: flex; flex-wrap: wrap; gap: .3rem 1rem; }
.entries li { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.entries .result b { font-weight: 600; }
.entries .won { color: var(--money); }
@media (min-width: 760px) {
  .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .split { grid-template-columns: 3fr 2fr; align-items: start; }
  .lb li, .lb .cols { grid-template-columns: 3rem minmax(0, 1fr) 9rem 7rem; }
  .vlist { --row: 58px; }
  .lb .metrics { display: contents; }
  .lb .score small { display: block; margin: 0; }
  .entries li, .cols.entries { grid-template-columns: minmax(0, 1fr) 8rem 9rem 6rem; }
  .lb .cols span:nth-child(2) { text-align: left; }
  .hero { text-align: right; }
  .lb .vhead { flex-wrap: nowrap; }
  .lb h1, .lb .vhead p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(VIEW_CSS);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
