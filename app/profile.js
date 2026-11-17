// make.fun ledger, profile view (#/u/<handle>): avatar, handle and links with the prize total as the headline, the
// record, a prize ledger of every payout (each linked to its on-chain transaction), then every entry, 50 a page.

import { esc } from './core.js';
import { live, money } from './rows.js';
import { avatarImg, crumbs, day, formatScore, ordinal, paginate, setHtml, statTile } from './viewkit.js';

export function renderProfile(view, handle, path) {
  view.innerHTML = `<section class="profile">
${crumbs(`<span>@${esc(handle)}</span>`)}
<header id="p-head" class="card phead">${avatarImg(null, handle, 64)}<div><h1>@${esc(handle)}</h1><p>Loading the profile…</p></div></header>
<div id="p-record" class="stats"></div>
<section id="p-payouts" class="card" hidden></section>
<h2 id="p-entries-h">Entries</h2>
<div class="cols entries" aria-hidden="true"><span>Bounty · entry</span><span>Result</span><span>Score</span><span>Prize</span></div>
<ol id="p-entries" class="rows entries"></ol>
<button id="p-more" class="more" hidden></button>
</section>`;
  const $ = document.getElementById.bind(document);
  const entries = $('p-entries');
  const showEntries = paginate(entries, $('p-more'), (s) => s.submission_id, profileEntryRow);
  return live(path, (p) => {
    if (!entries.isConnected) return;
    const name = p.display_name && p.display_name !== p.handle ? esc(p.display_name) : '';
    const pays = p.payouts || [], sols = p.solutions || [];
    document.title = `@${p.handle} · make.fun ledger`;
    setHtml($('p-head'), `${avatarImg(p.avatar?.url || p.image || p.avatar?.url_small, p.handle, 64)}<div><h1>@${esc(p.handle)}</h1>
<p>${name ? `${name} · ` : ''}joined ${day(p.joined_at)}${p.house ? ' · make.fun house account' : ''}</p>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}<p class="links">${profileLinks(p)}</p></div>
<div class="hero"><span>Prizes won</span><b>${money(p.record?.prize_usd)}</b><small>${pays.length ? `${pays.length} payouts on make.fun` : 'no payouts yet'}</small></div>`);
    setHtml($('p-record'), profileRecord(p.record));
    const ledger = $('p-payouts');
    ledger.hidden = !pays.length;
    setHtml(ledger, pays.length ? prizeLedger(pays) : '');
    setHtml($('p-entries-h'), sols.length ? `Entries · ${sols.length}` : 'No entries yet');
    entries.previousElementSibling.hidden = !sols.length;
    showEntries(sols);
  });
}

// Every payout as a ledger line (bounty, place, date paid, amount with its transaction), totalled under a double rule.
function prizeLedger(pays) {
  const total = pays.reduce((s, x) => s + +x.amount_usd, 0);
  const line = (x) => `<tr><td><a href="#/bounty/${encodeURIComponent(x.competition?.slug)}">${esc(x.competition?.title || x.competition?.slug)}</a></td><td>${x.place ? ordinal(x.place) : '—'}</td><td>${day(x.paid_at).slice(0, -5)}</td><td class="now">${
    x.explorer_url ? `<a href="${esc(x.explorer_url)}" target="_blank" rel="noopener" title="The payment on-chain">${money(x.amount_usd)} ↗</a>` : money(x.amount_usd)
  }</td></tr>`;
  return `<h2>Prize ledger · ${pays.length} payouts</h2><table class="payouts"><thead><tr><th>Bounty</th><th>Place</th><th>Paid</th><th>Amount</th></tr></thead>
<tbody>${pays.map(line).join('')}</tbody><tfoot><tr><td>Total paid</td><td></td><td></td><td class="now">${money(total)}</td></tr></tfoot></table>`;
}

function profileEntryRow(s) {
  const c = s.competition || {}, slug = encodeURIComponent(c.slug);
  const score = s.score ? `${formatScore(s.score.column, s.score.value, s.score.display)}<small>${esc(s.score.column?.title || 'Score')}</small>` : '<span class="none">no score yet</span>';
  return `<a class="title" href="#/bounty/${slug}"><b>${esc(c.title || c.slug)}</b><small>${esc(s.title || 'Untitled entry')} · entered ${day(s.entered_at)}</small></a>
<span class="result" data-l="Result">${entryResult(s)}</span>
<span class="score" data-l="Score">${score}</span>
<span class="prize" data-l="Prize">${Number(s.prize_usd) > 0 ? `<b class="won">${money(s.prize_usd)}</b>` : '<span class="none">—</span>'}</span>`;
}

function profileRecord(r = {}) {
  return [
    statTile('Entered', r.competitions_entered ?? 0, 'bounties'),
    statTile('Won', r.competitions_won ?? 0, 'first places'),
    statTile('Placed', r.competitions_placed ?? 0, `${r.podium_finishes ?? 0} on the podium`),
    statTile('Best place', r.best_placement ? ordinal(r.best_placement) : '—', 'in any bounty'),
  ].join('');
}

function entryResult(s) {
  const c = s.competition || {};
  if (s.placement) return `<b class="${s.prize_usd > 0 ? 'won' : ''}">${ordinal(s.placement)} place</b>`;
  if (c.status === 'open' && Date.parse(c.deadline) > Date.now()) return '<b>In progress</b>';
  return c.status === 'resolved' ? 'Not placed' : 'Awaiting results';
}

export function profileLinks(p) {
  const out = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;
  const links = [out(`https://make.fun/u/${encodeURIComponent(p.handle)}`, 'make.fun profile ↗')];
  if (p.github_login) links.push(out(`https://github.com/${encodeURIComponent(p.github_login)}`, `GitHub ${esc(p.github_login)} ↗`));
  if (p.x) links.push(out(`https://x.com/${encodeURIComponent(String(p.x).replace(/^@/, ''))}`, `X @${esc(String(p.x).replace(/^@/, ''))} ↗`));
  const d = p.discord;
  if (d?.url) links.push(out(d.url, `Discord ${esc(d.username || d.global_name || '')} ↗`));
  else if (typeof d == 'string') links.push(`<span>Discord ${esc(d)}</span>`);
  if (p.wallet?.explorer_url) links.push(out(p.wallet.explorer_url, 'Wallet ↗'));
  return links.join('');
}

export const notFound = (handle) => [`No profile @${handle}`, 'Nobody on make.fun uses this handle. Check the spelling, or find people on a leaderboard.'];
