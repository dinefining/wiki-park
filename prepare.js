#!/usr/bin/env node
// Wiki Park world builder.
// Run once with Node 18+:  node prepare.js
// Collects Wikipedia articles from three seed sets (Nature, Technology,
// Human individuality), finds articles that bridge them, lays everything out
// as three overlapping circular biomes with terraced ground, a stream, ponds
// and thickets, and writes world.json.
'use strict';

const fs = require('fs');
const path = require('path');

const API = 'https://en.wikipedia.org/w/api.php';
// Wikimedia requires a User-Agent with contact info (a URL or email) or it rate-limits hard.
// Set WIKIPARK_CONTACT to your repo URL or email, e.g. WIKIPARK_CONTACT=https://github.com/you/wiki-park
const CONTACT = process.env.WIKIPARK_CONTACT || 'https://maybemachines.com';
const UA = `WikiPark/1.0 (${CONTACT}) world-builder node/${process.versions.node}`;
const REQUEST_GAP_MS = 250; // stay well under Wikimedia's rate limits

const N = 1, T = 2, H = 4; // set bits
const SET_NAMES = ['nature', 'technology', 'human'];

// ---------------------------------------------------------------- seeds ----

const SEEDS = {
  [N]: [
    'Ecology', 'Biodiversity', 'Botany', 'Mycology', 'Rivers', 'Fluvial landforms',
    'Forests', 'Ethology', 'Pollination', 'Trees', 'Wetlands', 'Soil biology',
    'Bioluminescence', 'Ornithology', 'Bryophytes', 'Lichenology',
  ],
  [T]: [
    'Computing', 'Robotics', 'Renewable energy', 'Internet culture', 'Sensors',
    'Artificial intelligence', 'Human–computer interaction', 'Wearable computers',
    'Open-source hardware', 'Computer graphics', 'Electronic musical instruments',
    'Telecommunications',
  ],
  [H]: [
    'Identity (social science)', 'Perception', 'Memory', 'Crafts', 'Play (activity)',
    'Emotions', 'Creativity', 'Personality', 'Senses', 'Self', 'Imagination',
    'Handicrafts', 'Hobbies',
  ],
};

// Articles known to sit across two or three sets.
const BRIDGES = [
  ['Biomimicry', N | T], ['Bioacoustics', N | T], ['Quantified self', T | H],
  ['Solarpunk', N | T | H], ['Biophilic design', N | H], ['Citizen science', N | T | H],
  ['Cyborg', T | H], ['Ecopsychology', N | H], ['Forest bathing', N | H],
  ['Biophilia hypothesis', N | H], ['Permaculture', N | T | H], ['Camera trap', N | T],
  ['Remote sensing', N | T], ['Precision agriculture', N | T], ['Artificial life', N | T | H],
  ['Swarm robotics', N | T], ['Bio-inspired robotics', N | T], ['Soundscape ecology', N | T],
  ['Acoustic ecology', N | H], ['Ethnobotany', N | H], ['Gardening', N | H],
  ['Bonsai', N | H], ['Ikebana', N | H], ['Wearable technology', T | H],
  ['Brain–computer interface', T | H], ['Human–computer interaction', T | H],
  ['Extended mind thesis', T | H], ['Generative art', T | H], ['Maker culture', T | H],
  ['Hacker culture', T | H], ['Telepresence', T | H], ['Prosthesis', T | H],
  ['Augmented reality', T | H], ['Bioart', N | T | H], ['Do-it-yourself biology', N | T | H],
  ['Synthetic biology', N | T], ['Genetic algorithm', N | T], ['Land art', N | H],
  ['Nature writing', N | H], ['Animal cognition', N | H], ['Interspecies communication', N | T | H],
  ['Phenology', N | H], ['Green roof', N | T], ['Vertical farming', N | T],
  ['Sustainable design', N | T | H], ['Ecovillage', N | H], ['iNaturalist', N | T | H],
  ['eBird', N | T | H], ['Biosphere 2', N | T], ['Earthship', N | T | H],
  ['Calm technology', T | H], ['Haptic technology', T | H], ['Sonification', T | H],
  ['Wildlife photography', N | T | H], ['Nature documentary', N | T | H], ['Tamagotchi', N | T | H],
  ['Digital pet', T | H], ['Plant cognition', N | H], ['Mycorrhizal network', N | T],
  ['Cybernetics', N | T | H], ['Gaia hypothesis', N | H], ['Deep ecology', N | H],
  ['Posthumanism', T | H], ['Transhumanism', T | H], ['Biofeedback', T | H],
  ['Circadian rhythm', N | H], ['Light pollution', N | T], ['Dark-sky movement', N | T | H],
  ['Neural network (biology)', N | T], ['Embodied cognition', N | H], ['Synesthesia', N | H],
  ['Wildlife tracking', N | T], ['Animal-borne camera', N | T], ['Biosensor', N | T],
  ['Ecological design', N | T | H], ['Agroforestry', N | H], ['Urban forest', N | H],
  ['Bird feeder', N | H], ['Birdwatching', N | H], ['Japanese garden', N | H],
  ['Woodworking', N | H], ['Basket weaving', N | H], ['Natural dye', N | H],
  ['Sloyd', N | H], ['Digital humanities', T | H], ['Electronic textile', T | H],
  ['Interactive art', T | H], ['Algorithmic composition', T | H], ['Kinetic art', T | H],
  ['Neurodiversity', H | T], ['Lifelogging', T | H], ['Digital detox', N | T | H],
  ['Smart garden', N | T], ['Hydroponics', N | T], ['Aquaponics', N | T],
  ['Environmental monitoring', N | T], ['Wildlife radio telemetry', N | T],
  ['Bionics', N | T | H], ['Morphogenesis', N | T], ['Fractal', N | T | H],
  ['L-system', N | T], ['Conway\'s Game of Life', T | H], ['Emergence', N | T | H],
  ['Self-organization', N | T], ['Stigmergy', N | T], ['Ant colony optimization algorithms', N | T],
  ['Biological computing', N | T], ['Slime mold', N | T], ['Physarum polycephalum', N | T],
  ['Soundwalk', N | H], ['Field recording', N | T | H], ['Psychogeography', N | H],
  ['Flâneur', H | N], ['Walking', N | H], ['Geocaching', N | T | H],
  ['Proteus (video game)', N | T | H], ['Walden, a game', N | T | H], ['Firewatch', N | T | H],
  ['Pokémon Go', N | T | H], ['Herbarium', N | H], ['Seed library', N | H],
];

// Search phrases that tend to surface bridge articles, with the sets they span.
const BRIDGE_SEARCHES = [
  ['bio-inspired design engineering', N | T], ['ecological sensor network', N | T],
  ['animal tracking technology', N | T], ['nature connectedness wellbeing', N | H],
  ['traditional craft natural materials', N | H], ['self-tracking wearable', T | H],
  ['digital identity self', T | H], ['art technology nature installation', N | T | H],
  ['human perception of nature', N | H], ['plant robot', N | T],
  ['computer music generative', T | H],
];

const SKIP_TITLE = /^(List|Lists|Index|Outline|Glossary|Timeline|Bibliography) of|\(disambiguation\)|:/i;
const SKIP_CAT = /by (country|continent|year|decade|century|region|state|city|location|nationality)|lists|people|stubs|templates|organi[sz]ations|companies|images|wikipedia|works|books|films|journals|museums|awards|events|conferences|websites|software by|fictional|in (fiction|popular culture)/i;

const PER_SET_CAP = 6000;   // candidates per set, before the quality rules
const TOTAL_CAP = 18000;    // candidates in all
const FOREST_SIZE = 12000;  // articles that grow, after the rules
const PAGES_PER_CAT = 400;
const SUBCATS_PER_CAT = 35;
const PAGES_PER_SUBCAT = 80;

// ------------------------------------------------------------ fetching -----

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await sleep(REQUEST_GAP_MS);
      const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 10 * (attempt + 1);
        console.log(`  rate limited, waiting ${wait}s…`);
        await sleep(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function categoryMembers(cat, limit) {
  const out = { pages: [], subcats: [] };
  let cont = {};
  for (let page = 0; page < 2 && out.pages.length < limit; page++) {
    const data = await api({
      action: 'query', list: 'categorymembers', cmtitle: `Category:${cat}`,
      cmtype: 'page|subcat', cmlimit: '500', cmprop: 'title', ...cont,
    });
    const members = (data && data.query && data.query.categorymembers) || [];
    for (const m of members) {
      if (m.ns === 0 && !SKIP_TITLE.test(m.title)) out.pages.push(m.title);
      else if (m.ns === 14) out.subcats.push(m.title.replace(/^Category:/, ''));
    }
    if (!data || !data.continue) break;
    cont = data.continue;
  }
  out.pages = out.pages.slice(0, limit);
  return out;
}

async function resolveTitles(titles) {
  const map = new Map(); // requested -> canonical
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({ action: 'query', titles: batch.join('|'), redirects: '1' });
    const q = (data && data.query) || {};
    const alias = new Map();
    for (const n of q.normalized || []) alias.set(n.from, n.to);
    for (const r of q.redirects || []) alias.set(r.from, r.to);
    const exists = new Set((q.pages || []).filter(p => !p.missing && !p.invalid && p.ns === 0).map(p => p.title));
    for (const t of batch) {
      let c = t;
      for (let k = 0; k < 3 && alias.has(c); k++) c = alias.get(c);
      if (exists.has(c)) map.set(t, c);
    }
  }
  return map;
}

async function search(q, limit) {
  const data = await api({ action: 'query', list: 'search', srsearch: q, srlimit: String(limit), srnamespace: '0' });
  return ((data && data.query && data.query.search) || []).map(s => s.title).filter(t => !SKIP_TITLE.test(t));
}

async function pool(items, size, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }));
  return results;
}

// ------------------------------------------------------------- random ------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261018);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------- collect -----

async function collect() {
  const entries = new Map(); // title -> { mask, group }
  const add = (title, bit, group) => {
    const e = entries.get(title);
    if (e) e.mask |= bit;
    else entries.set(title, { mask: bit, group });
  };

  for (const bit of [N, T, H]) {
    const name = SET_NAMES[Math.log2(bit)];
    const seen = new Set();
    const cats = SEEDS[bit];
    const tops = await pool(cats, 1, cat => categoryMembers(cat, PAGES_PER_CAT).catch(() => ({ pages: [], subcats: [] })));
    const subJobs = [];
    tops.forEach((res, i) => {
      for (const p of res.pages) if (!seen.has(p)) { seen.add(p); add(p, bit, cats[i]); }
      res.subcats.filter(s => !SKIP_CAT.test(s)).slice(0, SUBCATS_PER_CAT).forEach(s => subJobs.push(s));
    });
    const subs = await pool(subJobs, 1, s => categoryMembers(s, PAGES_PER_SUBCAT).catch(() => ({ pages: [] })));
    subs.forEach((res, i) => {
      for (const p of res.pages) {
        if (seen.size >= PER_SET_CAP) break;
        if (!seen.has(p)) { seen.add(p); add(p, bit, subJobs[i]); }
      }
    });
    console.log(`  ${name}: ${seen.size} articles from ${cats.length} seed categories, ${subJobs.length} subcategories`);
  }

  // Curated bridges.
  const resolved = await resolveTitles(BRIDGES.map(b => b[0]));
  let bridgeCount = 0;
  for (const [title, mask] of BRIDGES) {
    const c = resolved.get(title);
    if (!c) { console.log(`  (skipped missing bridge "${title}")`); continue; }
    const e = entries.get(c);
    if (e) e.mask |= mask; else entries.set(c, { mask, group: 'bridge' });
    bridgeCount++;
  }
  console.log(`  curated bridges: ${bridgeCount}`);

  // Search-based bridges.
  const found = await pool(BRIDGE_SEARCHES, 1, ([q]) => search(q, 10).catch(() => []));
  let searched = 0;
  found.forEach((titles, i) => {
    const mask = BRIDGE_SEARCHES[i][1];
    for (const t of titles) {
      const e = entries.get(t);
      if (e) e.mask |= mask; else entries.set(t, { mask, group: `search:${BRIDGE_SEARCHES[i][0]}` });
      searched++;
    }
  });
  console.log(`  search bridges: ${searched}`);

  // Trim to cap, dropping single-set articles first.
  let list = [...entries.entries()].map(([title, e]) => ({ title, ...e }));
  if (list.length > TOTAL_CAP) {
    const multi = list.filter(e => popcount(e.mask) > 1);
    const single = shuffle(list.filter(e => popcount(e.mask) === 1));
    list = multi.concat(single.slice(0, TOTAL_CAP - multi.length));
  }
  return list;
}

const popcount = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

// ------------------------------------------------------- colour mix --------
// How much of each set an article carries, from its own Wikipedia categories.
// Stored as quarters (n + t + h = 4) and used for the article's colour.

const KEYWORDS = [
  /ecolog|biolog|botan|plant|flower|animal|species|fung|myco|lichen|moss|tree|forest|river|lake|wetland|soil|bird|insect|etholog|zoolog|flora|fauna|habitat|conservation|biodiversity|evolution|organism|pollinat|marine|ocean|nature|natural|environment|climate|geolog|landform|weather|agricultur|garden/i,
  /comput|software|technolog|robot|electronic|engineer|internet|online|digital|energy|sensor|algorithm|artificial intelligence|machine|programm|network|data|device|video game|telecommunic|hardware|web|electric|solar|wind power|invent|synthesi[sz]er|graphics|cyber|virtual|information/i,
  /psycholog|emotion|identity|memory|perception|cognit|personality|self|craft|\bart|artist|play|hobb|creativ|imagination|sense|philosoph|culture|social|music|mind|conscious|aesthetic|design|toy|sport|textile|folk|human|wellbeing|well-being|spiritual|literature|writing/i,
];

// Each article's categories (for its colour) and length (for its size).
async function fetchMeta(titles) {
  const meta = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont = {};
    for (let page = 0; page < 6; page++) {
      const data = await api({ action: 'query', prop: 'categories|info|pageprops', ppprop: 'disambiguation', titles: batch.join('|'), cllimit: 'max', clshow: '!hidden', ...cont });
      for (const p of (data && data.query && data.query.pages) || []) {
        const m = meta[p.title] = meta[p.title] || { c: [], l: 0, v: 2 };
        if (p.length) m.l = p.length;
        if (p.redirect) m.r = 1;
        if (p.pageprops && 'disambiguation' in p.pageprops) m.d = 1;
        if (p.missing) m.missing = 1;
        if (p.categories) m.c.push(...p.categories.map(c => c.title.replace(/^Category:/, '')));
      }
      if (!data || !data.continue) break;
      cont = data.continue;
    }
    if ((i / 50) % 20 === 0) console.log(`  categories ${Math.min(i + 50, titles.length)}/${titles.length}`);
  }
  return meta;
}

// ------------------------------------------------------- what may grow -----
// Rules for an article to grow in the forest (the browser applies the same
// ones to planting):
//   1. a real article: not a redirect, disambiguation or set-index page, list,
//      outline, glossary, index or timeline;
//   2. substantial: at least MIN_BYTES long and not tagged as a stub;
//   3. people and companies only when they bridge the themes: their own
//      categories place them in at least two of nature, technology and human
//      individuality (an ethologist who built robots, a company making
//      wearables for wellbeing). Everyone else in those categories stays out.
const MIN_BYTES = 4000;
const STUB = /stubs?$|stub articles/i;
const MANY_MEANINGS = /set index|disambiguation/i;
const PERSON = /\b(births|deaths)$|^living people$|^people from/i;
const COMPANY = /companies|^brands$/i;
// Narrower than the colour keywords: what makes a person or company belong here.
const THEMES = [
  /ecolog|botan|zoolog|ornitholog|entomolog|mycolog|herpetolog|biolog|naturalist|conservation|environmental|etholog|wildlife|forestry|bioacoustic|evolutionary|primatolog|marine scien|ecosystem|biodiversity/i,
  /comput|robot|artificial intelligence|engineer|software|electronic|internet|digital|sensor|cybernetic|programm|hardware|wearable|information technolog|human–computer|virtual reality/i,
  /psycholog|cognitiv|neuroscien|philosoph|perception|consciousness|emotion|identity|crafts|craftspeople|artists|new media|installation art|sound art|designers|creativity/i,
];
// Categories that name-check a theme without meaning it (label rosters, fame).
const NOISE = /records artists|internet memes|internet[- ]related controversies|internet culture|internet characters|internet properties|internet celebrities|youtubers|streamers|vtubers|retailers/i;

function bridgesThemes(cats) {
  const own = cats.filter(c => !PERSON.test(c) && !COMPANY.test(c) && !NOISE.test(c));
  return [0, 1, 2].filter(k => own.some(c => THEMES[k].test(c))).length >= 2;
}

function whyNot(title, m) {
  if (!m || m.missing) return 'missing';
  if (m.r) return 'redirect';
  if (m.d) return 'disambiguation';
  if (SKIP_TITLE.test(title) || /\bin popular culture\b/i.test(title)) return 'list';
  if ((m.l || 0) < MIN_BYTES) return 'short';
  const cats = m.c || [];
  if (cats.some(c => STUB.test(c))) return 'stub';
  if (cats.some(c => MANY_MEANINGS.test(c))) return 'disambiguation';
  const person = cats.some(c => PERSON.test(c)), company = cats.some(c => COMPANY.test(c));
  if ((person || company) && !bridgesThemes(cats)) return person ? 'person outside the themes' : 'company outside the themes';
  return null;
}

function colourMix(title, mask, cats) {
  const text = [title, ...(cats || [])];
  const score = [0, 1, 2].map(s => {
    let v = mask & (1 << s) ? 2.5 : 0;
    for (const t of text) if (KEYWORDS[s].test(t)) v += 1;
    return v;
  });
  const sum = score.reduce((a, b) => a + b, 0) || 1;
  // Largest-remainder rounding to quarters.
  const raw = score.map(v => (v / sum) * 4);
  const q = raw.map(Math.floor);
  let left = 4 - q.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - q[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { q[i]++; left--; } });
  return q;
}

// -------------------------------------------------------------- layout -----

const W = 2080, HGT = 2080;
const CX = W / 2, CY = HGT / 2 + 20;
const D = 380, R = 580;
const CIRCLES = [210, 330, 90].map(deg => {
  const a = deg * Math.PI / 180;
  return [Math.round(CX + Math.cos(a) * D), Math.round(CY + Math.sin(a) * D), R];
});
const BLOCK = 4;   // terrain is drawn in 4px blocks
const LONER_SHARE = 0.33; // share of single-theme articles that grow on their own, spread evenly
const GW = W / BLOCK, GH = HGT / BLOCK;

// Articles grow as flowers, bushes or trees, by how long their Wikipedia article is.
// Seen from above, flat colour, one pixel apart at least.
// Three shapes, seen from above:
//   0 cross   – the shorter articles
//   1 ring    – articles where the themes mix (hollow in the middle, still clickable)
//   2 diamond – long, substantial articles about one theme
const SPRITES = [
  ['.#.', '###', '.#.'],
  ['.###.', '#####', '##.##', '#####', '.###.'],
  ['..#..', '.###.', '#####', '.###.', '..#..'],
];
const SPRITE_PX = SPRITES.map(rows => {
  const half = (rows.length - 1) / 2, px = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px.push([x - half, y - half]); }));
  return px;
});

// Terrain features, stored per block.
const F_NONE = 0, F_VEG = 1, F_VEG_DEEP = 2, F_WATER = 3, F_WATER_LIGHT = 4, F_SAND = 5;
const BANDS = 6;

function regionAt(x, y) {
  let m = 0;
  CIRCLES.forEach(([cx, cy, r], i) => { if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m |= 1 << i; });
  return m;
}

function makeNoise(seed) {
  const r = mulberry32(seed);
  const table = new Float32Array(256 * 256).map(() => r());
  const at = (x, y) => table[((y & 255) << 8) | (x & 255)];
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = s(x - x0), fy = s(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbm(noise, x, y) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < 4; o++) { v += noise(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return v / tot;
}

// Elevation terraces, a river with two creeks, ponds and sandy banks.
function makeTerrain() {
  const band = new Uint8Array(GW * GH);
  const feat = new Uint8Array(GW * GH);
  const n = makeNoise(7);
  const hs = new Float32Array(GW * GH);
  let lo = 1, hi = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const h = fbm(n, x / 48, y / 48);
    hs[y * GW + x] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  for (let i = 0; i < hs.length; i++) band[i] = Math.min(BANDS - 1, Math.floor(((hs[i] - lo) / (hi - lo)) * BANDS));

  const stamp = (cx, cy, r) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) feat[y * GW + x] = F_WATER;
    }
  };
  const stream = (points, r) => {
    let [x, y] = points[0];
    let a = Math.atan2(points[1][1] - y, points[1][0] - x), turn = 0;
    for (let k = 1; k < points.length; k++) {
      const [tx, ty] = points[k];
      for (let step = 0; step < 1500 && Math.hypot(tx - x, ty - y) > 2; step++) {
        let da = Math.atan2(ty - y, tx - x) - a;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        turn = turn * 0.92 + (rand() - 0.5) * 0.1;
        a += turn + da * 0.05;
        x += Math.cos(a) * 0.7; y += Math.sin(a) * 0.7;
        stamp(x, y, r * (0.9 + rand() * 0.2));
      }
    }
  };
  const pond = (cx, cy, r) => {
    for (let k = 0; k < 9; k++) stamp(cx + (rand() - 0.5) * r * 1.4, cy + (rand() - 0.5) * r, r * (0.55 + rand() * 0.35));
  };

  // The river runs through the nature biome; creeks feed ponds in technology and human.
  stream([[216, -3], [192, 100], [150, 210], [132, 320], [80, 430], [36, GH + 3]], 2.4);
  stream([[428, -3], [404, 80], [352, 140]], 1.2);
  pond(344, 150, 9);
  stream([[GW + 3, 404], [430, 420], [330, 444]], 1.1);
  pond(318, 446, 7);
  for (const [x, y, r] of [[196, 452, 6], [428, 300, 6], [120, 150, 7], [262, 116, 5], [380, 250, 5], [90, 330, 6], [250, 300, 4], [460, 200, 5]]) pond(x, y, r);

  const isWater = f => f === F_WATER || f === F_WATER_LIGHT;
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x;
    if (feat[i] === F_WATER && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => isWater(feat[(y + dy) * GW + x + dx])) && rand() < 0.08) feat[i] = F_WATER_LIGHT;
  }
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x;
    if (feat[i] !== F_NONE) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWater(feat[(y + dy) * GW + x + dx])) && rand() < 0.32) feat[i] = F_SAND;
  }
  return { band, feat };
}

function makeLayout(list, terrain) {
  const { feat } = terrain;
  const dry = (x, y) => {
    const bx = Math.floor(x / BLOCK), by = Math.floor(y / BLOCK);
    if (bx < 0 || by < 0 || bx >= GW || by >= GH) return false;
    return feat[by * GW + bx] === F_NONE;
  };
  // Pixels taken by a plant or the one-pixel gap around it.
  const taken = new Uint8Array(W * HGT);
  const fits = (cx, cy, size, mask) => {
    if (regionAt(cx, cy) !== mask) return false;
    for (const [dx, dy] of SPRITE_PX[size]) {
      const x = cx + dx, y = cy + dy;
      if (x < 2 || y < 2 || x >= W - 2 || y >= HGT - 2 || taken[y * W + x] || !dry(x, y)) return false;
    }
    return true;
  };
  const take = (cx, cy, size) => {
    for (const [dx, dy] of SPRITE_PX[size]) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      taken[(cy + dy + oy) * W + cx + dx + ox] = 1;
    }
  };

  const byMask = new Map();
  for (const e of list) {
    if (!byMask.has(e.mask)) byMask.set(e.mask, []);
    byMask.get(e.mask).push(e);
  }

  const groves = [];
  const articles = [];
  let dropped = 0;

  // About one single-set article in eight grows on its own out in the meadows,
  // so long stretches between groves aren't completely empty.
  const loners = [];
  for (const [mask, all] of [...byMask.entries()].sort((a, b) => a[0] - b[0])) {
    all.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.title < b.title ? -1 : 1));
    const items = [];
    for (const e of all) (popcount(mask) === 1 && rand() < LONER_SHARE ? loners : items).push(e);
    // Chunk into groves, preferring to break where the source category changes.
    const chunks = [];
    let cur = [];
    const maxSize = popcount(mask) === 3 ? 18 : 30;
    for (const e of items) {
      if (cur.length >= maxSize || (cur.length >= 12 && cur[cur.length - 1].group !== e.group)) {
        chunks.push(cur); cur = [];
      }
      cur.push(e);
    }
    if (cur.length) chunks.push(cur);

    let prev = null;
    for (const chunk of chunks) {
      const spread = 3.0 * Math.sqrt(chunk.length) + 3;
      const center = findGroveCenter(mask, spread, prev, groves, dry);
      prev = center;
      const grove = { x: center[0], y: center[1], r: 0 };
      // Trees first, so the big ones get room near the middle.
      chunk.sort((a, b) => b.size - a.size);
      for (const e of chunk) {
        let placed = false;
        for (let tries = 0, s = spread * 0.6; tries < 900 && !placed; tries++, s += 0.06) {
          const x = Math.round(grove.x + gauss() * s), y = Math.round(grove.y + gauss() * s);
          if (!fits(x, y, e.size, mask)) continue;
          take(x, y, e.size);
          articles.push([e.title, mask, x, y, ...e.mix, e.size]);
          grove.r = Math.max(grove.r, Math.hypot(x - grove.x, y - grove.y) + e.size + 1);
          placed = true;
        }
        if (!placed) dropped++;
      }
      grove.r += 3;
      groves.push(grove);
    }
  }
  // Loners: in their own region, each in the emptiest of a dozen candidate
  // spots (farthest from any plant so far), so they spread out evenly.
  const CELL = 32, cols = Math.ceil(W / CELL), cells = new Map();
  const remember = (x, y) => {
    const k = Math.floor(x / CELL) + Math.floor(y / CELL) * cols;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(x, y);
  };
  const nearestPlant = (x, y) => {
    let best = 1e9;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const list = cells.get(cx + ox + (cy + oy) * cols);
      if (list) for (let i = 0; i < list.length; i += 2) best = Math.min(best, Math.hypot(list[i] - x, list[i + 1] - y));
    }
    return best;
  };
  for (const a of articles) remember(a[2], a[3]);
  for (const e of loners) {
    let best = null, bestD = -1;
    for (let c = 0, tries = 0; c < 12 && tries < 4000; tries++) {
      const x = Math.round(30 + rand() * (W - 60)), y = Math.round(30 + rand() * (HGT - 60));
      if (!fits(x, y, e.size, e.mask)) continue;
      c++;
      const d = nearestPlant(x, y);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    if (!best) { dropped++; continue; }
    take(best[0], best[1], e.size);
    remember(best[0], best[1]);
    articles.push([e.title, e.mask, best[0], best[1], ...e.mix, e.size]);
  }
  console.log(`  ${loners.length} articles grow alone in the meadows`);
  if (dropped) console.log(`  (${dropped} articles found no room)`);
  return { articles, groves };
}

function findGroveCenter(mask, spread, prev, groves, dry) {
  let minDist = 40 + spread * 2.2;
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0 && attempt % 400 === 0) minDist = Math.max(10, minDist - 5);
    let x, y;
    if (prev && attempt < 200) {
      const a = rand() * Math.PI * 2, d = minDist + rand() * 30;
      x = prev[0] + Math.cos(a) * d; y = prev[1] + Math.sin(a) * d;
    } else {
      x = 40 + rand() * (W - 80); y = 40 + rand() * (HGT - 80);
    }
    if (regionAt(x, y) !== mask || !dry(x, y)) continue;
    const ring = spread * 1.4 + 4;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) {
      const a = k * Math.PI / 4;
      const px = x + Math.cos(a) * ring, py = y + Math.sin(a) * ring;
      if (regionAt(px, py) !== mask || !dry(px, py)) ok = false;
    }
    if (!ok && attempt < 3000) continue;
    if (groves.some(g => Math.hypot(g.x - x, g.y - y) < minDist + g.r * 0.5) && attempt < 3000) continue;
    return [Math.round(x), Math.round(y)];
  }
}

// Thickets: blocky clumps of undergrowth in the meadows, thickest around the
// edges of groves, never right next to a plant so the groves stay clearings.
function addVegetation(terrain, articles, groves) {
  const { feat } = terrain;
  const near = new Uint8Array(GW * GH);
  for (const a of articles) {
    const reach = a[7] + 4;
    for (let y = Math.floor((a[3] - reach) / BLOCK); y <= Math.floor((a[3] + reach) / BLOCK); y++) {
      for (let x = Math.floor((a[2] - reach) / BLOCK); x <= Math.floor((a[2] + reach) / BLOCK); x++) {
        if (x >= 0 && y >= 0 && x < GW && y < GH) near[y * GW + x] = 1;
      }
    }
  }
  // Nearest-grove lookup on a coarse grid keeps this fast with hundreds of groves.
  const CELLB = 16;
  const buckets = new Map();
  groves.forEach(g => {
    const k = `${Math.floor(g.x / BLOCK / CELLB)},${Math.floor(g.y / BLOCK / CELLB)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(g);
  });
  const n = makeNoise(11);
  let count = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    if (feat[i] !== F_NONE || near[i]) continue;
    const px = x * BLOCK + 2, py = y * BLOCK + 2;
    let bonus = 0;
    const kx = Math.floor(x / CELLB), ky = Math.floor(y / CELLB);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      for (const g of buckets.get(`${kx + ox},${ky + oy}`) || []) {
        const d = Math.hypot(px - g.x, py - g.y) - g.r;
        if (d > 0 && d < 30) bonus = Math.max(bonus, 0.13 * (1 - d / 30));
      }
    }
    const v = fbm(n, x / 7, y / 7) + bonus;
    if (v > 0.6) { feat[i] = v > 0.67 ? F_VEG_DEEP : F_VEG; count++; }
  }
  return count / (GW * GH);
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function encodeTerrain({ band, feat }) {
  let s = '';
  for (let i = 0; i < band.length; i++) s += B36[band[i] + BANDS * feat[i]];
  return s;
}

// Sizes by article length: about half flowers, a third bushes, the longest sixth trees.
// Shapes: a ring where the themes mix (more than one colour), a diamond for
// the longest third of the rest, a cross for everything else.
function assignShapes(list) {
  const mixed = e => e.mix.filter(Boolean).length > 1;
  const lengths = list.filter(e => !mixed(e)).map(e => e.length || 0).sort((a, b) => a - b);
  const diamondBytes = lengths[Math.floor(0.66 * (lengths.length - 1))];
  for (const e of list) e.size = mixed(e) ? 1 : (e.length || 0) >= diamondBytes ? 2 : 0;
  return diamondBytes;
}

// ---------------------------------------------------------------- main -----

(async () => {
  // Fetched articles are cached so the layout can be tweaked without re-fetching.
  // Pass --refresh to fetch from Wikipedia again.
  const cacheFile = path.join(__dirname, '.wikipark-cache.json');
  const metaFile = path.join(__dirname, '.wikipark-meta.json');
  const refresh = process.argv.includes('--refresh');
  let list;
  if (!refresh && fs.existsSync(cacheFile)) {
    list = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    console.log(`Wiki Park: using ${list.length} cached articles (pass --refresh to fetch again)`);
  } else {
    console.log('Wiki Park: collecting articles from Wikipedia…');
    list = await collect();
    fs.writeFileSync(cacheFile, JSON.stringify(list));
  }
  // Search hits with a disambiguator are usually people or namesakes, not bridges.
  list = list.filter(e => !(String(e.group).startsWith('search:') && /\(/.test(e.title)));
  list.sort((a, b) => (a.title < b.title ? -1 : 1));

  // Metadata is cached per title and only fetched for titles not seen yet.
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const need = list.map(e => e.title).filter(t => !meta[t] || meta[t].v !== 2);
  if (need.length) {
    console.log(`Reading categories, length and page type for ${need.length} articles…`);
    Object.assign(meta, await fetchMeta(need));
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  }

  // The rules: what doesn't qualify doesn't grow.
  const dropped = {};
  list = list.filter(e => {
    const why = whyNot(e.title, meta[e.title]);
    if (why) dropped[why] = (dropped[why] || 0) + 1;
    return !why;
  });
  const bridgers = list.filter(e => meta[e.title].c.some(c => PERSON.test(c) || COMPANY.test(c)));
  console.log(`  ${list.length} articles qualify (${bridgers.length} of them people or companies bridging the themes); left out:`, dropped);
  if (list.length > FOREST_SIZE) {
    // Bridges first: articles in two or more sets, and the people and companies that bridge the themes.
    const keep = new Set(bridgers);
    const multi = list.filter(e => popcount(e.mask) > 1 || keep.has(e));
    const single = shuffle(list.filter(e => popcount(e.mask) === 1 && !keep.has(e)));
    list = multi.concat(single.slice(0, FOREST_SIZE - multi.length));
    list.sort((a, b) => (a.title < b.title ? -1 : 1));
  }

  for (const e of list) {
    const m = meta[e.title];
    e.mix = colourMix(e.title, e.mask, m.c);
    e.length = m.l;
  }
  if (process.argv.includes('--fetch-only')) { console.log('Fetched; stopping before layout.'); return; }

  const counts = {};
  for (const e of list) counts[e.mask] = (counts[e.mask] || 0) + 1;
  console.log(`  total: ${list.length}`, counts);
  const tinted = list.filter(e => e.mix.filter(Boolean).length > 1).length;
  console.log(`  ${tinted} articles carry a mix of more than one set`);

  console.log('Shaping the land…');
  const diamondBytes = assignShapes(list);
  const terrain = makeTerrain();
  const { articles, groves } = makeLayout(list, terrain);
  const cover = addVegetation(terrain, articles, groves);
  const sizes = [0, 1, 2].map(k => articles.filter(a => a[7] === k).length);
  console.log(`  ${articles.length} plants (${sizes[0]} crosses, ${sizes[1]} rings, ${sizes[2]} diamonds) in ${groves.length} groves, ${(cover * 100).toFixed(0)}% thicket`);

  const world = {
    version: 3,
    w: W, h: HGT,
    block: BLOCK, gw: GW, gh: GH, bands: BANDS,
    sets: SET_NAMES,
    circles: CIRCLES,
    terrain: encodeTerrain(terrain),
    sprites: SPRITES,
    diamondBytes, // article length (bytes) from which a single-theme article is a diamond
    articles, // [title, mask, centreX, centreY, n, t, h, size]
  };
  const out = path.join(__dirname, 'world.json');
  fs.writeFileSync(out, JSON.stringify(world));
  console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error(e); process.exit(1); });
