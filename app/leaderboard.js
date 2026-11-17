// make.fun ledger, leaderboard view (#/bounty/<slug>/leaderboard): rank, entrant, entry, score with its interval and
// the prize places with their live amounts. One compact request (rows=first), a windowed list of every entry, a find box.

import { BOARD, esc, isCached } from './core.js';
import { count, live, money } from './rows.js';
import { avatarImg, crumbs, day, formatScore, leaderboardEntries, ordinal, scoreColumn, setHtml, utc, virtualRows } from './viewkit.js';

export function renderLeaderboard(view, slug, path) {
  const s = encodeURIComponent(slug);
  view.innerHTML = `<section class="lb">
${crumbs(`<a href="#/bounty/${s}">Bounty</a>`, '<span>Leaderboard</span>')}
<header class="vhead"><div><h1 id="lb-title">${esc(slug)}</h1><p id="lb-summary">Loading the leaderboard…</p></div><a class="cta" href="#/bounty/${s}">Rules and rewards</a></header>
<p id="lb-prizes" class="prizebar" hidden></p>
<div class="lbtools"><input id="lb-find" type="search" placeholder="Find @handle or entry" aria-label="Find an entrant or entry" autocomplete="off"><span id="lb-window"></span></div>
<div class="cols" aria-hidden="true"><span>#</span><span>Entrant · entry</span><span id="lb-score-h">Score</span><span>Prize now</span></div>
<ol id="lb-rows" class="rows vlist"></ol>
<p id="lb-none" class="card note" hidden></p>
</section>`;
  const $ = document.getElementById.bind(document);
  const st = { slug, $, rows: $('lb-rows'), lb: null, all: [], prizes: null, bounty: null, col: null, askedBounty: false };
  st.show = virtualRows(st.rows, (e) => e.submission_id || e.handle, (e) => leaderboardRow(e, st.col, st.prizes), (a, b, built, n) =>
    setHtml($('lb-window'), n ? `Windowed list · places <b>${count(a)}–${count(b)}</b> on screen · <b>${built}</b> of ${count(n)} rows built` : ''));
  $('lb-find').addEventListener('input', () => drawLeaderboard(st));
  live(prizeSource(slug), (data) => usePrizes(st, data), 12e4).catch(() => {});
  return live(path, (data) => {
    st.lb = data;
    st.all = leaderboardEntries(data);
    document.title = `Leaderboard: ${data.competition?.title || slug} · make.fun ledger`;
    if (data.competition?.title) setHtml($('lb-title'), esc(data.competition.title));
    drawLeaderboard(st);
  });
}

// Summary, prize bar, score title and the window of rows (all entries, or those the find box matches).
function drawLeaderboard(st) {
  const { lb, $, rows } = st;
  if (!lb || !rows.isConnected) return;
  st.col = scoreColumn(lb);
  setHtml($('lb-summary'), leaderboardSummary(lb, st.col, st.all.length, st.bounty));
  setHtml($('lb-score-h'), esc(st.col?.title || 'Score'));
  const bar = $('lb-prizes');
  setHtml(bar, prizeBar(st.prizes));
  bar.hidden = !bar.innerHTML;
  const q = $('lb-find').value.trim().replace(/^@/, '').toLowerCase();
  const shown = q ? st.all.filter((e) => `${e.handle} ${e.title}`.toLowerCase().includes(q)) : st.all;
  const none = $('lb-none');
  none.hidden = !!shown.length;
  none.textContent = q ? `No entrant or entry matches “${q}”.` : 'No entries yet: be the first.';
  st.show(shown);
}

// Prize amounts from the bounty or its board item; a bounty missing from the board is asked for once.
function usePrizes(st, data) {
  const b = data?.items ? data.items.find((i) => i.slug === st.slug) : data;
  if (b?.title) setHtml(st.$('lb-title'), esc(b.title));
  if (b) (st.bounty = b), (st.prizes = livePrizes(b)), drawLeaderboard(st);
  else if (!st.askedBounty) (st.askedBounty = true), live(bountyPath(st.slug), (d) => usePrizes(st, d), 12e4).catch(() => {});
}

function leaderboardRow(e, col, prizes) {
  const iv = e.interval, k = col?.key;
  const interval = iv?.low != null ? `<small title="${Math.round(iv.level * 100)}% interval">${formatScore(col, +iv.low).replace('%', '')}–${formatScore(col, +iv.high)}</small>` : '';
  const prize = e.prize_rank && prizes?.get(e.prize_rank);
  return `<span class="rank${prize ? ' place' : ''}">${e.rank ?? '—'}</span>
<span class="who">${avatarImg(e.image, e.handle)}<span><a href="#/u/${encodeURIComponent(e.handle)}">@${esc(e.handle)}</a><small>${esc(e.title || 'Untitled entry')}</small></span></span>
<span class="metrics"><span class="score" data-l="${esc(col?.title || 'Score')}"><b>${formatScore(col, e.values?.[k], e.display?.[k])}</b>${interval}</span><span class="prize" data-l="Prize now">${prize ? `<b>${money(prize)}</b>` : '<span class="none">—</span>'}</span></span>`;
}

// Place -> live amount, from the bounty or its board item (both carry rewardsNow).
export const livePrizes = (b) => new Map((b.rewardsNow || []).map((r) => [r.place, r.amountUsd]));

// The bounty's rewards at the live pot, places paying the same amount joined ("4th–10th $40 each").
function prizeBar(prizes) {
  if (!prizes?.size) return '';
  const groups = [];
  for (const [place, usd] of prizes) {
    const g = groups.at(-1);
    if (g && +g.usd === +usd && g.to + 1 === place) g.to = place;
    else groups.push({ from: place, to: place, usd });
  }
  const total = [...prizes.values()].reduce((s, v) => s + +v, 0);
  const shown = groups.slice(0, 4).map((g) => `${g.from === g.to ? ordinal(g.from) : `${ordinal(g.from)}–${ordinal(g.to)}`} <b>${money(g.usd)}</b>${g.from === g.to ? '' : ' each'}`);
  return `Rewards now: ${shown.join(' · ')}${groups.length > 4 ? ' · …' : ''} · <b>${money(total)}</b> in ${prizes.size} places`;
}

// Entries, ranking, the bounty's dates (UTC), phase and tie-break.
function leaderboardSummary(lb, col, n, b) {
  const dates = b?.deadline ? ` · opened ${day(b.opensAt || b.publishedAt).slice(0, -5)} · deadline ${utc(b.deadline)}` : '';
  const tie = lb.tie_break ? ` · ties: ${esc(lb.tie_break.title)} (${lb.tie_break.better === 'lower' ? 'lower' : 'higher'} wins)` : '';
  const phase = lb.phase?.title ? ` · ${esc(lb.phase.title)} phase${lb.phase.placements_held ? ', places provisional' : ''}` : '';
  return `<b>${count(n)}</b> entries${dates}${phase} · ranked by <b>${esc(col?.title || lb.rank_key)}</b>${tie}`;
}

export const notFound = (slug) => [`No leaderboard for “${slug}”`, 'make.fun has no bounty at this address, so there is no leaderboard to show.'];

const bountyPath = (slug) => `/competitions/${encodeURIComponent(slug)}?submissions=summary`; // as core's route builds it

// Live prize amounts (rewardsNow) come with the bounty and with each board item: read whichever is already cached.
const prizeSource = (slug) => (isCached(bountyPath(slug)) ? bountyPath(slug) : BOARD);
