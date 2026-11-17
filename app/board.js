// make.fun ledger, board view (#/, #/?q=chess&cat=Games&sort=pot&fee=paid): every live bounty, taking entries first,
// with the board's totals, a search box and category chips with counts, sort and fee filters (all kept in the address,
// applied in place), and beside it a live feed of the newest entries across make.fun. Refreshed every minute.

import { BOARD, esc } from './core.js';
import { count, live, money, patchList, tick } from './rows.js';

export function renderBoard(view, query) {
  document.title = 'Live bounties · make.fun ledger';
  const pick = Object.fromEntries(new URLSearchParams(query));
  view.innerHTML = `<section class="board">
<header class="head"><h1>Live bounties</h1><p>Every make.fun bounty with money on it, read live from the public API.</p></header>
<dl id="totals" class="totals"></dl>
<div class="primary">
<div class="find"><label for="q">Search bounties <kbd>/</kbd></label><input id="q" type="search" placeholder="Title or category, e.g. chess" autocomplete="off" spellcheck="false"></div>
<div id="cats" class="cats" role="group" aria-label="Category"></div>
<div class="listhead"><p id="found" class="found"></p><div id="tools" class="tools"></div></div>
<div class="cols" aria-hidden="true"><span>Bounty</span><span>Reward · live pot</span><span>Entry fee</span><span>Time left</span><span>Entries</span></div>
<ol id="open" class="rows"></ol>
<p id="none" class="card note" hidden>No bounty taking entries matches this search. <a href="#/">Show them all</a></p>
<h2 id="closed-head" hidden>Entries closed · awaiting results</h2>
<ol id="closed" class="rows closed"></ol>
</div>
<aside id="feed" class="feed" aria-label="Latest entries"></aside>
</section>`;
  const $ = document.getElementById.bind(document);
  const board = { $, pick: { q: pick.q || '', cat: pick.cat || 'all', sort: pick.sort || 'soon', fee: pick.fee || 'any' }, items: [] };
  const find = $('q');
  find.value = board.pick.q;
  find.addEventListener('input', () => pickBoard(board, 'q', find.value));
  find.addEventListener('keydown', (e) => e.key === 'Escape' && find.value && ((find.value = ''), pickBoard(board, 'q', '')));
  for (const id of ['cats', 'tools']) $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) pickBoard(board, b.dataset.k, b.dataset.v);
  });
  return Promise.all([live(BOARD, (data) => ((board.items = data.items || []), drawBoard(board))), renderFeed($('feed'))]);
}

// The side column: the entries made across make.fun in the last hour, newest first (public GET /api/activity/entries,
// cached 15 s by make.fun), on the board's 60 s refresh; new entries are patched in at the top and marked for a moment.
export function renderFeed(box) {
  box.innerHTML = `<header><h2><i class="dot"></i>Latest entries</h2><p id="feed-n">Entries made in the last hour, newest first</p></header><ol id="feed-list"></ol><p id="feed-none" hidden>No new entries in the last hour.</p>`;
  const seen = new Set();
  const timer = setInterval(() => (box.isConnected ? sinceAll(box) : clearInterval(timer)), 15e3);
  return live(FEED, (data) => drawFeed(box, data, seen)).catch(() => {
    box.querySelector('#feed-n').textContent = 'The feed could not be read just now; it retries on the next refresh.';
  });
}

// Patch the list by entry id; ids not seen before (after the first answer) get the "fresh" mark that fades out.
function drawFeed(box, data, seen) {
  const list = box.querySelector('#feed-list'), rows = data.entries || [];
  if (!list) return;
  patchList(list, rows, (e) => e.id, feedRow);
  const first = !seen.size;
  for (const li of list.children) {
    li.classList.toggle('fresh', !first && !seen.has(li.dataset.key));
    seen.add(li.dataset.key);
  }
  const total = +data.total || 0, minutes = data.window_minutes || 60;
  box.querySelector('#feed-n').innerHTML = `<b>${total >= 100 ? '100+' : total}</b> entries in the last ${minutes === 60 ? 'hour' : `${minutes} min`} · ${rows.length} newest shown`;
  box.querySelector('#feed-none').hidden = !!rows.length;
  sinceAll(box);
}

// The row's HTML holds no clock text (so a refresh with the same entries touches nothing); "4 min ago" is filled in here.
function feedRow(e) {
  const c = e.competition || {}, h = encodeURIComponent(e.handle);
  return `${entrantPicture(e)}<span class="what"><a class="who" href="#/u/${h}">@${esc(e.handle)}</a><time datetime="${esc(e.created_at)}"></time></span><span class="into"><a href="#/bounty/${encodeURIComponent(c.slug)}" title="${esc(c.title)}">${esc(c.title)}</a></span>`;
}

function sinceAll(box) {
  const now = Date.now();
  for (const t of box.querySelectorAll('time')) {
    const s = (now - Date.parse(t.dateTime)) / 1e3;
    t.textContent = s < 60 ? 'just now' : s < 3600 ? `${s / 60 | 0} min ago` : `${s / 3600 | 0} h ago`;
  }
}

// The entrant's picture where make.fun points to one (crossorigin set before src), else a tinted initial.
function entrantPicture(e) {
  const url = typeof e.image === 'string' ? e.image : e.image?.url;
  if (url) return `<img crossorigin="anonymous" src="${esc(url.startsWith('/') ? 'https://make.fun' + url : url)}" alt="" width="32" height="32" loading="lazy">`;
  let hue = 0;
  for (const ch of e.handle || '?') hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="ini" style="--h:${hue}" aria-hidden="true">${esc((e.handle || '?')[0].toUpperCase())}</span>`;
}

const FEED = '/activity/entries';

// A search letter, chip or button: write the choice to the address (linkable, no route change) and redraw in place.
function pickBoard(board, k, v) {
  board.pick[k] = v;
  const q = new URLSearchParams(Object.entries(board.pick).filter(([k, v]) => v.trim() && v !== DEFAULTS[k]));
  history.replaceState(null, '', q.size ? `#/?${q}` : '#/');
  drawBoard(board);
}

const DEFAULTS = { q: '', cat: 'all', sort: 'soon', fee: 'any' };

// Totals, chips, buttons and both lists, from the last answer and the picked search, sort and filters. Rows are patched
// by key, so typing or re-sorting moves the existing row nodes instead of rebuilding them.
function drawBoard(board) {
  const { $, pick, items } = board, open = $('open');
  if (!open.isConnected) return;
  const now = Date.now(), taking = items.filter((b) => Date.parse(b.deadline) > now);
  const words = pick.q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (b) => words.every((w) => `${b.title} ${b.category} ${b.sponsor?.name || ''} ${b.slug}`.toLowerCase().includes(w));
  const fits = (b) => hits(b) && (pick.fee === 'any' || (pick.fee === 'paid') === Number(b.entryFeeUsd) > 0);
  put($('totals'), boardTotals(taking));
  put($('cats'), categoryChips(pick, taking.filter(fits)));
  put($('tools'), boardTools(pick));
  const shown = items.filter((b) => fits(b) && (pick.cat === 'all' || b.category === pick.cat));
  const mine = shown.filter((b) => Date.parse(b.deadline) > now).sort(SORTS[pick.sort] || SORTS.soon);
  const ended = shown.filter((b) => Date.parse(b.deadline) <= now).sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
  patchList(open, mine, (b) => b.slug, bountyRow);
  patchList($('closed'), ended, (b) => b.slug, bountyRow);
  const narrowed = mine.length < taking.length;
  const what = [pick.q.trim() && `matching “${esc(pick.q.trim())}”`, pick.cat !== 'all' && `in ${esc(pick.cat)}`, pick.fee !== 'any' && (pick.fee === 'paid' ? 'with an entry fee' : 'free to enter')].filter(Boolean).join(' · ');
  put($('found'), narrowed ? `<b>${mine.length}</b> of ${taking.length} taking entries · ${what}` : `<b>${taking.length}</b> bounties taking entries`);
  $('none').hidden = !!mine.length;
  $('closed-head').hidden = !ended.length;
}

// Replace a part only when its HTML changed (keeps focus on a button), then label its time-left cells.
function put(el, html) {
  if (el.html !== html) (el.innerHTML = el.html = html), tick(el);
}

const pot = (b) => Number(b.potUsd ?? b.rewardAmount);
const SORTS = {
  soon: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
  pot: (a, b) => pot(b) - pot(a),
  entries: (a, b) => b.submissionCount - a.submissionCount,
};

function bountyRow(b) {
  const slug = encodeURIComponent(b.slug);
  return `<a class="title" href="#/bounty/${slug}"><b>${esc(b.title)}</b><small><span class="tag">${esc(b.category)}</span> ${esc(b.sponsor?.name || 'make.fun')}</small></a>${potCell(b)}${feeCell(b)}<span class="when" data-l="Time left"><span class="left" data-left="${esc(b.deadline)}" data-from="${esc(b.publishedAt || b.opensAt || '')}"><b></b><i></i></span></span><a class="n" data-l="Entries" href="#/bounty/${slug}/leaderboard">${count(b.submissionCount)}</a>`;
}

function potCell(b) {
  const fees = Number(b.entryFeesUsd) || 0;
  const sub = fees > 0 ? `<small>${money(pot(b) - fees)} + ${money(fees)} fees</small>` : '';
  return `<span class="pot" data-l="${fees > 0 ? 'Live pot' : 'Reward'}"><b>${money(pot(b))}</b>${sub}</span>`;
}

// A set fee is paid once per account (not per entry): an amber badge, so it stands out from "Free".
function feeCell(b) {
  return Number(b.entryFeeUsd) > 0
    ? `<span class="fee" data-l="Entry fee"><b class="paid">${money(b.entryFeeUsd)}</b><small>once per account</small></span>`
    : '<span class="fee" data-l="Entry fee"><b class="free">Free</b></span>';
}

// The board's headline figures: how many take entries, the money in their pots, the entries so far, the next deadline.
function boardTotals(open) {
  const next = open.reduce((a, b) => (!a || Date.parse(b.deadline) < Date.parse(a.deadline) ? b : a), null);
  const cell = (k, v, sub = '') => `<div><dt>${k}</dt><dd>${v}</dd>${sub}</div>`;
  return [
    cell('Taking entries', `${open.length} bounties`),
    cell('In live pots', `<b class="m">${money(open.reduce((s, b) => s + pot(b), 0))}</b>`),
    cell('Entries so far', count(open.reduce((s, b) => s + (+b.submissionCount || 0), 0))),
    next ? cell('Next to close', `<span class="left" data-left="${esc(next.deadline)}" data-from="${esc(next.publishedAt || '')}"><b></b><i></i></span>`, `<dd class="sub"><a href="#/bounty/${encodeURIComponent(next.slug)}">${esc(next.title)}</a></dd>`) : '',
  ].join('');
}

// One chip per category in the live data, with how many bounties taking entries (and matching the search) it holds.
function categoryChips(pick, open) {
  const n = new Map();
  for (const b of open) if (b.category) n.set(b.category, (n.get(b.category) || 0) + 1);
  const chips = [['all', 'All', open.length], ...[...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, k]) => [c, c, k])];
  if (pick.cat !== 'all' && !n.has(pick.cat)) chips.push([pick.cat, pick.cat, 0]);
  return chips.map(([v, t, k]) => `<button data-k="cat" data-v="${esc(v)}" aria-pressed="${pick.cat === v}">${esc(t)} <span>${k}</span></button>`).join('');
}

function boardTools(pick) {
  const group = (label, k, opts) =>
    `<div role="group" aria-label="${label}"><span>${label}</span>${opts.map(([v, t]) => `<button data-k="${k}" data-v="${v}" aria-pressed="${pick[k] === v}">${t}</button>`).join('')}</div>`;
  return group('Sort', 'sort', [['soon', 'Closing soon'], ['pot', 'Biggest pot'], ['entries', 'Most entries']]) +
    group('Entry fee', 'fee', [['any', 'Any'], ['free', 'Free'], ['paid', 'With a fee']]);
}

// Board-only styles, adopted when this module loads (the shared row, fee and time-left styles are in rows.js).
const BOARD_CSS = `
.board { display: grid; gap: 1.4rem; }
.board > * { min-width: 0; }
.board .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem 1rem; }
.board .head h1 { font-size: 1.9rem; }
.board .head p { margin: 0; color: var(--muted); }
.totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 1.4rem; margin: 0; padding: 1rem 1.2rem; background: var(--card); border: 1px solid var(--line); border-bottom: 3px double var(--ink); border-radius: 10px 10px 0 0; }
.totals dt { font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.totals dd { margin: .15rem 0 0; font: 700 1.4rem var(--serif); }
.totals .m { color: var(--money); }
.totals .sub { max-width: 24rem; font: .8rem system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.totals .left { padding-bottom: 5px; max-width: 18rem; }
.primary { display: grid; gap: 1rem; align-content: start; }
.board .find { position: relative; }
.board .find label { display: block; font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-bottom: .35rem; }
.board .find kbd { margin-left: .3rem; padding: 0 .35rem; border: 1px solid #c3cad6; border-radius: 4px; font: .72rem ui-monospace, monospace; text-transform: none; }
.board .find input { box-sizing: border-box; width: 100%; font: inherit; font-size: 1.05rem; padding: .7rem 1rem .7rem 2.6rem; border: 1px solid #c3cad6; border-radius: 10px; background: var(--card) no-repeat .95rem 50% / 1.05rem; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23586174' stroke-width='2'%3E%3Ccircle cx='8.5' cy='8.5' r='6'/%3E%3Cpath d='m13 13 5 5'/%3E%3C/svg%3E"); }
.board .find input:focus { border-color: var(--link); outline: 3px solid #c9d8fb; }
.cats { display: flex; flex-wrap: wrap; gap: .5rem; }
.cats button { padding: .4rem .85rem; border-radius: 99px; font-size: .92rem; font-weight: 600; color: var(--ink); }
.cats button span { display: inline-block; min-width: 1.3em; margin-left: .3rem; padding: 0 .35rem; border-radius: 99px; background: #e8ecf3; color: var(--muted); font-size: .78rem; text-align: center; }
.cats [aria-pressed=true] { background: var(--navy); border-color: var(--navy); color: #fff; }
.cats [aria-pressed=true] span { background: #8fe3b9; color: var(--navy); }
.listhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem 1.2rem; margin-top: .3rem; }
.found { margin: 0; color: var(--muted); }
.found b { color: var(--ink); font-size: 1.1rem; }
.tools { display: flex; flex-wrap: wrap; gap: .5rem 1.2rem; }
.tools div { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; }
.tools span { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-right: .2rem; }
.tools button { padding: .2rem .65rem; font-size: .84rem; border-radius: 99px; }
.tools [aria-pressed=true] { background: #e6ecf8; border-color: var(--navy); color: var(--navy); font-weight: 600; }
.board .rows { border-radius: 10px; }
.board .rows li { padding: .95rem 1.1rem; }
.board .rows li:has(.paid) { background: #fff8e8; box-shadow: inset 4px 0 #e8a020; }
.board .title b { font-size: 1.03rem; line-height: 1.3; }
.board .title small { margin-top: .25rem; }
.tag { display: inline-block; padding: 0 .45rem; margin-right: .25rem; border-radius: 4px; background: #e8ecf3; color: var(--navy); font-size: .74rem; font-weight: 600; }
.board .pot b { color: var(--money); font: 700 1.2rem var(--serif); }
.board .pot small, .board .fee small { font-size: .72rem; }
.board .n { font-weight: 600; font-size: 1.02rem; }
.board .closed li { opacity: .72; }
.board h2 { margin: .6rem 0 0; }
.board .note { max-width: none; }
@media (max-width: 759px) {
  .board { gap: 1.1rem; }
  .board .head p { display: none; }
  .totals { padding: .85rem 1rem; gap: .7rem 1rem; }
  .board .find label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .cats { flex-wrap: nowrap; overflow-x: auto; margin: 0 -1rem; padding: 0 1rem 2px; scrollbar-width: none; }
  .cats button { flex: none; }
}
@media (min-width: 760px) {
  .totals { grid-template-columns: repeat(3, auto) minmax(0, 1.4fr); gap: 2.4rem; padding: 1.1rem 1.5rem; }
  .board .cols { padding: 0 1.1rem; margin-bottom: -.6rem; }
}
@media (min-width: 1100px) {
  .board { grid-template-columns: minmax(0, 1fr) 19.5rem; gap: 1.1rem 2.4rem; }
  .board .head, .totals { grid-column: 1 / -1; }
  .totals { padding: .85rem 1.5rem; }
  .primary { gap: .8rem; }
}
.feed { align-self: start; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem 1.2rem .6rem; }
.feed h2 { display: flex; align-items: center; gap: .5rem; margin: 0; color: var(--ink); font-size: .78rem; }
.feed header p { margin: .3rem 0 .6rem; color: var(--muted); font-size: .84rem; }
.feed header b { color: var(--ink); }
.dot { width: .55rem; height: .55rem; border-radius: 50%; background: #1fae6b; box-shadow: 0 0 0 3px #c9f0dc; }
.feed ol { list-style: none; margin: 0; padding: 0; }
.feed li { display: grid; grid-template-columns: 2.1rem minmax(0, 1fr); gap: .15rem .7rem; align-items: center; padding: .6rem .4rem; margin: 0 -.4rem; border-top: 1px solid var(--line); border-radius: 6px; font-size: .88rem; line-height: 1.3; }
.feed li > img, .feed .ini { grid-row: span 2; align-self: start; width: 2.1rem; height: 2.1rem; border-radius: 50%; object-fit: cover; background: #e8ecf3; }
.feed .ini { display: grid; place-items: center; background: hsl(var(--h) 55% 88%); color: hsl(var(--h) 45% 28%); font-weight: 700; font-size: .85rem; }
.feed .what, .feed .into { display: flex; align-items: baseline; gap: .45rem; min-width: 0; }
.feed .who { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed time { margin-left: auto; flex: none; color: var(--muted); font-size: .76rem; }
.feed .into a { color: var(--ink); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.feed .fresh { animation: fresh 4s ease-out; }
@keyframes fresh { from { background: #dcf5e8; } }
#feed-none { color: var(--muted); }
@media (max-width: 1099px) { .feed li:nth-child(n+9) { display: none; } }
`;

// "/" anywhere on the board (outside a text field) jumps to the search box.
addEventListener('keydown', (e) => {
  const find = document.getElementById('q');
  if (e.key === '/' && find && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) e.preventDefault(), find.focus();
});

const sheet = new CSSStyleSheet();
sheet.replaceSync(BOARD_CSS);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
