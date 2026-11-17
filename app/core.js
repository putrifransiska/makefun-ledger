// make.fun ledger core: cached requests, HTTP-cache revalidation, request tally, routes; views come by import().

export function cachedGet(path, onData) {
  const hit = cache.get(path);
  if (hit) onData(hit.data), tallied(2);
  if (hit && Date.now() - hit.at < 3e4) return Promise.resolve();
  const next = revalidate(path).then((data) => data !== hit?.data && onData(data));
  return hit ? next.catch(() => {}) : next;
}

// Repeats go through the HTTP cache (make.fun's 304s lack CORS); an identical answer counts as unchanged.
export function revalidate(path) {
  if (inflight.has(path)) return inflight.get(path);
  const hit = cache.get(path);
  const p = fetch('https://make.fun/api' + path, hit ? { cache: 'no-cache' } : {})
    .then(async (res) => {
      if (!res.ok) throw Object.assign(Error(`make.fun answered ${res.status}`), { status: res.status });
      const text = await res.text(), same = text === hit?.text;
      cache.set(path, { text, data: same ? hit.data : JSON.parse(text), at: (stats.at = Date.now()) });
      tallied(+same);
      return cache.get(path).data;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

const ROUTES = [
  [/^#\/bounty\/([^/]+)$/, () => import('./bounty.js'), 'renderBounty', (s) => `/competitions/${s}?submissions=summary`],
  [/^#\/bounty\/([^/]+)\/leaderboard$/, () => import('./leaderboard.js'), 'renderLeaderboard', (s) => `/competitions/${s}/leaderboard?rows=first`],
  [/^#\/u\/@?([^/]+)$/, () => import('./profile.js'), 'renderProfile', (h) => `/profiles/${h}`],
  [/^#(?:\/\?(.*))?/, () => import('./board.js'), 'renderBoard', () => BOARD],
];

async function route() {
  const mine = ++seq, hash = location.hash.replace(/\/+$/, '') || '#';
  let m, arg, mod;
  const r = ROUTES.find(([re]) => (m = re.exec(hash)));
  window.__shotReady = false;
  stats.n.fill(0);
  try {
    arg = decodeURIComponent(m[1] || '');
    const path = r[3](encodeURIComponent(arg));
    if (!cache.has(path)) revalidate(path).catch(() => {});
    [mod] = await Promise.all([r[1](), import('./rows.js')]);
    if (mine === seq) await mod[r[2]](view, arg, path);
  } catch (err) {
    if (mine === seq) err.status === 404 && mod?.notFound ? notice(...mod.notFound(arg)) : notice('Could not load this page', err.message);
  }
  if (mine === seq) window.__shotReady = true;
}

function notice(title, text) {
  document.title = `${title} · make.fun ledger`;
  view.innerHTML = `<section class="card note"><h1>${esc(title)}</h1><p>${esc(text)}<p><a href="#/">← Board</a></section>`;
}

export const BOARD = '/competitions?status=open&activity=times';
export const isCached = (path) => cache.has(path);
export const stats = { n: [0, 0, 0], at: 0 }; // n: fetched, unchanged, from memory
const tallied = (i) => (stats.n[i]++, stats.draw?.());
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const view = document.querySelector('main');
const cache = new Map();
const inflight = new Map();
let seq = 0;

addEventListener('hashchange', () => (route(), scrollTo(0, 0)));
route();
