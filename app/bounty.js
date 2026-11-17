// make.fun ledger, bounty view (#/bounty/<slug>): the pot ledger (base reward + entry fees = live pot), time left and
// entries, a UTC timeline, rewards at the live pot, the standings now, description and rules (rendered when opened).
// On wide screens the live board stays in a rail on the right. Refreshed every minute, updated part by part.

import { BOARD, esc, revalidate } from './core.js';
import { count, live, money, patchList } from './rows.js';
import { avatarImg, crumbs, day, feeTile, formatScore, leaderboardEntries, ordinal, scoreColumn, setHtml, statTile, utc } from './viewkit.js';

export function renderBounty(view, slug, path) {
  const lb = `#/bounty/${encodeURIComponent(slug)}/leaderboard`, wide = matchMedia('(min-width: 1100px)').matches;
  view.innerHTML = `<div class="bpage${wide ? ' wide' : ''}"><article class="bounty">
${crumbs(`<span id="b-cat">Bounty</span>`)}
<header class="vhead"><div><h1 id="b-title">${esc(slug)}</h1><p id="b-by">Loading the bounty…</p></div><span id="b-status"></span></header>
${wide ? '' : '<p id="b-summary" class="summary"></p>'}
<section class="ledger card" aria-label="Pot ledger"><div id="b-sum" class="sum"></div><div><div id="b-facts" class="facts"></div><dl id="b-dates" class="timeline"></dl></div></section>
<div class="split">
<section class="card"><h2>Rewards at the live pot</h2><div id="b-rewards"></div></section>
<section class="card"><div class="chead"><h2 id="b-top-h">Top 5 now</h2><a class="cta" href="${lb}">Full leaderboard →</a></div><ol id="b-top" class="top"></ol></section>
</div>
${wide ? '<p id="b-summary" class="summary card"></p>' : ''}
<section class="card"><h2>Description</h2><div id="b-desc" class="prose"></div></section>
<details id="b-rules" class="card"><summary>Rules <small id="b-rules-size"></small></summary><div id="b-rules-body" class="prose"></div></details>
</article>${wide ? '<aside class="rail" aria-label="Live board"><h2 id="r-head">Live board</h2><div class="rcols" aria-hidden="true"><span>Pot</span><span>Fee</span><span>Left</span><span>Entries</span></div><ol id="r-list"></ol><a href="#/">Open the full board →</a></aside>' : ''}</div>`;
  const $ = document.getElementById.bind(document);
  const rules = $('b-rules');
  rules.addEventListener('toggle', () => renderRules(rules));
  const draw = (b) => {
    if (!rules.isConnected) return;
    rules.bounty = b;
    document.title = `${b.title} · make.fun ledger`;
    setHtml($('b-title'), esc(b.title));
    setHtml($('b-cat'), esc(b.category || 'Bounty'));
    setHtml($('b-by'), `${esc(b.category)} · by ${esc(b.sponsor?.name || 'make.fun')}${b.skills?.length ? ' · ' + b.skills.map(esc).join(', ') : ''}`);
    setHtml($('b-status'), bountyStatus(b));
    setHtml($('b-summary'), esc(b.summary || ''));
    setHtml($('b-sum'), potLedger(b));
    setHtml($('b-facts'), bountyFacts(b, lb));
    setHtml($('b-rewards'), rewardsTable(b));
    setHtml($('b-dates'), bountyDates(b));
    setHtml($('b-desc'), renderMarkdown(b.description || 'No description.'));
    setHtml($('b-rules-size'), b.rules ? `${Math.max(1, Math.round(b.rules.length / 1024))} KB · open to read` : 'none');
    renderRules(rules);
    drawStandings($, rules);
    drawRail($, rules, slug);
  };
  const bounty = live(path, draw).catch((err) => fromBoard(slug, draw, err));
  // The standings use the leaderboard view's own request (compact rows), so opening the full leaderboard costs nothing.
  const standings = live(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`, (data) => ((rules.lb = data), drawStandings($, rules)), 12e4);
  const rail = wide && live(BOARD, (data) => ((rules.board = data), drawRail($, rules, slug)));
  return Promise.all([bounty, standings.catch(() => {}), rail && rail.catch(() => {})]);
}

// make.fun lists some new bounties (live races) on the board before their own page answers: draw the board's copy
// (title, pot, fee, deadline, rewards, description) with a note; the bounty's own request keeps retrying every minute.
function fromBoard(slug, draw, err) {
  return revalidate(BOARD).then((board) => {
    const b = board.items?.find((x) => x.slug === slug);
    if (!b) throw err;
    draw({ ...b, summary: `${b.summary || ''} (make.fun's page for this bounty is not answering yet; shown from the live board.)` });
  });
}

// The live pot written as a sum: base reward plus entry fees (payers x fee), ruled off under a double rule.
function potLedger(b) {
  const pot = Number(b.potUsd ?? b.rewardAmount), fees = Number(b.entryFeesUsd) || 0, fee = Number(b.entryFeeUsd) || 0;
  const payers = fee > 0 ? Math.round(fees / fee) : 0;
  return `<h2>Pot ledger</h2>
<p><span>Base reward<small>set by ${esc(b.sponsor?.name || 'make.fun')}</small></span><b>${cents(pot - fees)}</b></p>
<p><span>Entry fees<small>${fee > 0 ? `${count(payers)} accounts × ${money(fee)}` : 'none: free to enter'}</small></span><b>+ ${cents(fees)}</b></p>
<p class="total"><span>Live pot<small>to ${b.rewardsNow?.length || 1} places</small></span><b>${cents(pot)}</b></p>`;
}

function bountyFacts(b, lb) {
  return feeTile(b.entryFeeUsd) + statTile('Time left', timeLeftEl(b), utc(b.deadline)) + statTile('Entries', `<a href="${lb}">${count(b.submissionCount)}</a>`, `<a href="${lb}">see who leads →</a>`);
}

function drawStandings($, holder) {
  const data = holder.lb, b = holder.bounty, list = $('b-top');
  if (!data || !list?.isConnected) return;
  const all = leaderboardEntries(data), col = scoreColumn(data), prizes = new Map((b?.rewardsNow || []).map((r) => [r.place, r.amountUsd]));
  setHtml($('b-top-h'), `Top 5 · ${count(all.length)} ranked`);
  if (!all.length) return setHtml(list, '<li class="none">No entries yet: be the first.</li>');
  patchList(list, all.slice(0, 5), (e) => e.submission_id || e.handle, (e) => standingRow(e, col, prizes));
}

function standingRow(e, col, prizes) {
  const prize = e.prize_rank && prizes.get(e.prize_rank);
  return `<b class="rank">${e.rank}</b>${avatarImg(e.image, e.handle, 24)}<span class="who"><a href="#/u/${encodeURIComponent(e.handle)}">@${esc(e.handle)}</a><small>${esc(e.title || 'Untitled entry')}</small></span><span class="sc">${formatScore(col, e.values?.[col?.key], e.display?.[col?.key])}</span><b class="pz">${prize ? money(prize) : '—'}</b>`;
}

// The board's bounties still taking entries, soonest deadline first; the open one marked. Same request as the board;
// the open bounty's row takes the pot and entries of its own (fresher) answer, so the rail and the page agree.
function drawRail($, holder, slug) {
  const list = $('r-list'), data = holder.board, own = holder.bounty;
  if (!data || !list?.isConnected) return;
  const now = Date.now(), open = (data.items || []).map((x) => (x.slug === slug && own ? { ...x, potUsd: own.potUsd, submissionCount: own.submissionCount } : x)).filter((b) => Date.parse(b.deadline) > now).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const head = $('r-head');
  setHtml(head, `Live board · ${open.length} taking entries`);
  patchList(list, open, (b) => b.slug, (b) => railRow(b, b.slug === slug));
}

function railRow(b, here) {
  const fee = Number(b.entryFeeUsd) > 0 ? `<b class="paid">${money(b.entryFeeUsd)}</b>` : '<span class="free">Free</span>';
  return `<a class="rt"${here ? ' aria-current="page"' : ''} href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a><b class="rp">${money(b.potUsd ?? b.rewardAmount)}</b>${fee}${timeLeftEl(b)}<span class="rn">${count(b.submissionCount)}</span>`;
}

// The rules (~45 KB of markdown) are rendered only once their <details> is open, and again only when they change.
function renderRules(details) {
  const b = details.bounty;
  if (!details.open || !b || details.shown === b.rules) return;
  details.shown = b.rules;
  const note = b.rulesNote?.text ? `<p class="note-rules">${esc(b.rulesNote.text)}</p>` : '';
  details.lastElementChild.innerHTML = note + renderMarkdown(b.rules || 'No rules published.');
}

// Places paying the same base and fee share are one row ("4th–10th", each).
export function rewardsTable(b) {
  const now = b.rewardsNow?.length
    ? b.rewardsNow
    : Object.entries(b.rewards || {}).map(([place, usd]) => ({ place: +place, baseUsd: usd, feeShareUsd: 0, amountUsd: usd }));
  if (!now.length) return `<p>${money(b.potUsd ?? b.rewardAmount)} to the winner.</p>`;
  const groups = [];
  for (const r of now) {
    const g = groups.at(-1);
    if (g && +g.baseUsd === +r.baseUsd && +g.feeShareUsd === +r.feeShareUsd && g.to + 1 === r.place) g.to = r.place;
    else groups.push({ ...r, from: r.place, to: r.place });
  }
  const fees = now.some((r) => +r.feeShareUsd > 0);
  const total = now.reduce((s, r) => s + +r.amountUsd, 0);
  const row = (g) => `<tr><td>${g.from === g.to ? ordinal(g.from) : `${ordinal(g.from)}–${ordinal(g.to)} <small>each</small>`}</td><td>${money(g.baseUsd)}</td>${fees ? `<td>+${money(g.feeShareUsd)}</td>` : ''}<td class="now">${money(g.amountUsd)}</td></tr>`;
  return `<table><thead><tr><th>Place</th><th>Base</th>${fees ? '<th>Fee share</th>' : ''}<th>Now</th></tr></thead>
<tbody>${groups.map(row).join('')}</tbody><tfoot><tr><td>${now.length} places</td><td></td>${fees ? '<td></td>' : ''}<td class="now">${money(total)}</td></tr></tfoot></table>`;
}

function bountyDates(b) {
  const rows = [['Opened', utc(b.opensAt || b.publishedAt)], ['Deadline', utc(b.deadline)]];
  for (const p of b.phases || []) rows.push([`${esc(p.title)} phase`, `${day(p.startsAt).slice(0, -5)} – ${day(p.endsAt).slice(0, -5)}`]);
  if (b.resolvedAt) rows.push(['Resolved', utc(b.resolvedAt)]);
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

// Markdown as the API writes it (headings, lists, paragraphs, code, bold, links), escaped first.
const inlineMarkdown = (t) =>
  t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

export function renderMarkdown(md) {
  const out = [];
  let para = [], list = '', code = null;
  const close = () => {
    if (para.length) out.push(`<p>${inlineMarkdown(para.join(' '))}</p>`), (para = []);
    if (list) out.push(`</li></${list}>`), (list = '');
  };
  for (const line of esc(md).split('\n')) {
    let m;
    if (code) /^\s*```/.test(line) ? (out.push(`<pre><code>${code.join('\n')}</code></pre>`), (code = null)) : code.push(line);
    else if (/^\s*```/.test(line)) close(), (code = []);
    else if (!line.trim()) close();
    else if ((m = /^(#{1,6})\s+(.*)/.exec(line))) {
      const h = Math.min(4, Math.max(3, m[1].length + 1));
      close(), out.push(`<h${h}>${inlineMarkdown(m[2])}</h${h}>`);
    } else if ((m = /^\s*(?:([-*+])|\d+[.)])\s+(.*)/.exec(line))) {
      const kind = m[1] ? 'ul' : 'ol';
      if (para.length || list !== kind) close(), out.push(`<${kind}>`), (list = kind);
      else out.push('</li>');
      out.push(`<li>${inlineMarkdown(m[2])}`);
    } else if (list) out.push(' ' + inlineMarkdown(line.trim()));
    else para.push(line.trim());
  }
  if (code) out.push(`<pre><code>${code.join('\n')}</code></pre>`);
  close();
  return out.join('');
}

export const notFound = (slug) => [`No bounty “${slug}”`, 'make.fun has no bounty at this address. It may have been renamed or removed.'];

export function bountyStatus(b) {
  if (b.resolvedAt || b.status === 'resolved') return '<span class="chip done">Resolved</span>';
  return Date.parse(b.deadline) > Date.now() ? '<span class="chip open">Taking entries</span>' : '<span class="chip closed">Entries closed · awaiting results</span>';
}

const cents = (v) => '$' + (+v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeLeftEl = (b) => `<span class="left" data-left="${esc(b.deadline)}" data-from="${esc(b.opensAt || b.publishedAt || '')}"><b></b><i></i></span>`;

// Bounty-page styles (pot ledger, timeline, standings, board rail), adopted when this module loads.
const BOUNTY_CSS = `
.summary { margin: 0 0 1rem; max-width: 60rem; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
.ledger { display: grid; gap: 1rem; padding: 1rem; margin-bottom: .9rem; }
.sum h2 { margin: 0 0 .3rem; }
.sum p { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin: 0; padding: .3rem 0; border-bottom: 1px solid var(--line); }
.sum p small { font-size: .74rem; }
.sum p b { font-weight: 600; font-size: 1.05rem; white-space: nowrap; }
.sum .total { border-bottom: 3px double var(--ink); padding-top: .45rem; }
.sum .total span { font-weight: 700; }
.sum .total b { font: 700 2rem/1.1 var(--serif); color: var(--money); }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; }
.facts .stat { border: 0; border-left: 1px solid var(--line); border-radius: 0; padding: .1rem 0 .1rem .7rem; }
.timeline { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem .8rem; margin: 1rem 0 0; padding-top: .8rem; border-top: 1px solid var(--line); }
.timeline dt { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.timeline dd { margin: 0; font-weight: 600; font-size: .9rem; }
.top { list-style: none; margin: 0 0 .8rem; padding: 0; }
.top li { display: grid; grid-template-columns: 1.6rem 24px minmax(0, 1fr) auto 4.4rem; gap: .5rem; align-items: center; padding: .35rem 0; border-top: 1px solid var(--line); }
.top li:first-child { border-top: 0; }
.top li.none { display: block; color: var(--muted); }
.top .rank { color: var(--muted); }
.top .who, .rail .rt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top .who small { overflow: hidden; text-overflow: ellipsis; }
.top .pz { text-align: right; color: var(--money); }
.split .cta { margin: 0; padding: .35rem .8rem; font-size: .9rem; white-space: nowrap; }
.chead { display: flex; flex-wrap: wrap; gap: .4rem 1rem; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
.chead h2 { margin: 0; }
td small { display: inline; margin-left: .3rem; }
.rail { align-self: start; position: sticky; top: .5rem; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .8rem .9rem; font-size: .85rem; }
.rail h2 { margin: 0 0 .4rem; color: var(--ink); }
.rail ol { list-style: none; margin: 0 0 .6rem; padding: 0; }
.rail li, .rcols { display: grid; grid-template-columns: 1.3fr 1fr 1.1fr .8fr; gap: .1rem .5rem; align-items: baseline; }
.rcols { font-size: .64rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding-bottom: .2rem; border-bottom: 2px solid var(--ink); }
.rail li { padding: .4rem .4rem; margin: 0 -.4rem; border-bottom: 1px solid var(--line); }
.rail li > :nth-child(n+2), .rcols span:nth-child(n+2) { text-align: right; }
.rail .rt { grid-column: 1 / -1; color: var(--ink); font-weight: 600; }
.rail .rp { color: var(--money); text-align: left !important; }
.rail .paid { font-size: .8rem; justify-self: end; }
.rail .left { font-weight: 600; padding-bottom: 4px; }
.rail li:has([aria-current]) { background: #e6ecf8; box-shadow: inset 3px 0 var(--navy); }
@media (min-width: 760px) {
  .ledger { grid-template-columns: minmax(17rem, 1fr) 1.6fr; align-items: start; gap: 1.4rem; }
  .summary { -webkit-line-clamp: 2; }
}
@media (min-width: 1100px) {
  .bpage.wide { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: 1.2rem; }
  .wide .split { grid-template-columns: 1fr 1fr; }
  .wide .vhead { margin-bottom: .7rem; }
  .wide .ledger { padding: .8rem 1rem; margin-bottom: .8rem; }
  .wide .timeline { margin-top: .7rem; padding-top: .6rem; }
  .wide .top li { padding: .2rem 0; line-height: 1.3; }
  .wide .top .who small { font-size: .76rem; }
  .wide .summary.card { padding: .9rem 1rem; -webkit-line-clamp: 6; }
}`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(BOUNTY_CSS);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
