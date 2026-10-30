/**
 * tests/affiliate.test.js — the centralised affiliate database
 * ---------------------------------------------------------------------------
 * This suite exists to protect the site owner while bulk-editing links. A typo
 * in one of the 9 URLs is hard to spot by eye and impossible to notice until a
 * visitor hits a 404, so every link is checked for:
 *
 *   • a single link per product (no USD / GBP / CAD variants)
 *   • a full https:// URL on amzn.to or an amazon.* storefront
 *   • an associate tag when a full amazon.* product URL is used
 *   • a numeric price and a 0–5 rating
 *
 * It also proves the runtime path: allocation -> tier -> that product's link,
 * and that switching currency changes the money formatting WITHOUT touching
 * the affiliate URL.
 *
 *   npm i --no-save jsdom
 *   node tests/affiliate.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + '/';
const JS = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

const boot = async () => {
  const html = fs.readFileSync(ROOT + 'index.html', 'utf8')
    .replace('<script src="assets/js/rt-calc.js" defer></script>',
             '<script>' + JS + '</script>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.console.log = () => {};
  dom.window.console.groupCollapsed = () => {};
  dom.window.console.groupEnd = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  await new Promise(res => {
    if (dom.window.document.readyState === 'complete') return res();
    dom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));
  return dom.window;
};

const CATEGORIES = ['chair', 'desk', 'monitor'];
const TIERS = ['budget', 'mid', 'premium'];

/** A link is acceptable if it is https on amzn.to or an amazon.* storefront. */
const isAmznShort = url => /^https:\/\/amzn\.to\/[^\s]+$/i.test(url);
const isAmazonProduct = url => /^https:\/\/www\.amazon\.[a-z.]+\/dp\//i.test(url);

(async function main() {
  const window = await boot();
  const doc = window.document;
  const RT = window.RT_Calculator;
  const DB = RT.affiliateLinks;
  const $ = s => doc.querySelector(s);
  const fire = (el, t) => el.dispatchEvent(new window.Event(t, { bubbles: true }));

  /* ================= 1. Placement & shape ================= */
  console.log('\n1. One centralised object, at the top');
  ok(typeof DB === 'object' && DB !== null, 'RT_AFFILIATE_LINKS is exposed');
  ok(DB === RT.products, 'legacy .products alias points at the same object');

  const jsLines = JS.split('\n');
  const dbLine = jsLines.findIndex(l => /var RT_AFFILIATE_LINKS = \{/.test(l));
  const iifeLine = jsLines.findIndex(l => /^\(function \(window, document\)/.test(l));
  const firstFunction = jsLines.findIndex(l => /^  function \w+\(/.test(l));
  ok(dbLine > iifeLine && dbLine < firstFunction,
     'database is declared before any function in the file', [iifeLine, dbLine, firstFunction]);
  ok(dbLine - iifeLine < 120,
     'database sits within the first ~120 lines (easy to find)', dbLine - iifeLine);

  const banner = jsLines.slice(0, dbLine).join('\n');
  ok(/RIAJUL'S AFFILIATE DATABASE/.test(banner), 'banner: RIAJUL\'S AFFILIATE DATABASE');
  ok(/PASTE ALL YOUR AMAZON LINKS HERE/.test(banner), 'banner: PASTE ALL YOUR AMAZON LINKS HERE');
  ok(/\uD83D\uDEA8/.test(banner), 'banner uses the siren emoji');

  console.log('\n1b. Exactly the requested three levels');
  ok(Object.keys(DB).sort().join() === CATEGORIES.slice().sort().join(),
     'categories are chair, desk, monitor', Object.keys(DB));
  CATEGORIES.forEach(cat => {
    ok(Object.keys(DB[cat]).sort().join() === TIERS.slice().sort().join(),
       `${cat} has budget/mid/premium directly (no wrapper level)`, Object.keys(DB[cat]));
  });
  ok(!('tiers' in DB.chair), 'no legacy .tiers wrapper remains');
  ok(Object.keys(DB.chair.budget).sort().join() === 'link,name,price,rating',
     'each tier has name, price, rating and ONE link', Object.keys(DB.chair.budget));
  ok(!('links' in DB.chair.budget), 'the multi-currency .links object is gone');

  /* ================= 2. Every one of the 27 links ================= */
  console.log('\n2. Link integrity (9 slots, one per product)');
  let slotCount = 0;
  const problems = [];
  CATEGORIES.forEach(cat => {
    TIERS.forEach(tier => {
      slotCount += 1;
      const product = DB[cat][tier];
      const where = `${cat}.${tier}.link`;
      const url = product.link;

      if (typeof url !== 'string' || !url.trim()) return problems.push(`${where}: missing`);
      if (!/^https:\/\//.test(url)) problems.push(`${where}: not https`);
      if (/\s/.test(url)) problems.push(`${where}: contains whitespace`);
      if (/your-single-link|example\.com/i.test(url)) problems.push(`${where}: placeholder text left in`);

      const shortOk = isAmznShort(url);
      const productOk = isAmazonProduct(url);
      if (!shortOk && !productOk) problems.push(`${where}: not an amzn.to or amazon.* URL`);

      // A bare product URL without a tag earns nothing, so require one.
      if (productOk && !/[?&]tag=/.test(url)) problems.push(`${where}: amazon.* URL with no ?tag=`);
    });
  });
  ok(slotCount === 9, 'exactly 9 link slots (3 categories x 3 tiers)', slotCount);
  ok(problems.length === 0, 'all 9 links are valid single https URLs', problems.slice(0, 6));

  const urls = CATEGORIES.flatMap(c => TIERS.map(t => DB[c][t].link));
  ok(new Set(urls).size === 9, 'all 9 links are distinct (no copy-paste duplicates)',
     urls.length - new Set(urls).size + ' duplicate(s)');

  console.log('\n2b. Product data');
  const badPrices = [];
  const badRatings = [];
  const badNames = [];
  CATEGORIES.forEach(cat => TIERS.forEach(tier => {
    const p = DB[cat][tier];
    if (typeof p.price !== 'number' || !isFinite(p.price) || p.price <= 0) badPrices.push(`${cat}.${tier}`);
    if (typeof p.rating !== 'number' || p.rating < 0 || p.rating > 5) badRatings.push(`${cat}.${tier}`);
    if (typeof p.name !== 'string' || !p.name.trim()) badNames.push(`${cat}.${tier}`);
  }));
  ok(badPrices.length === 0, 'every price is a positive number (no currency symbols)', badPrices);
  ok(badRatings.length === 0, 'every rating is 0–5', badRatings);
  ok(badNames.length === 0, 'every product has a name', badNames);
  ok(DB.chair.budget.price < DB.chair.mid.price &&
     DB.chair.mid.price < DB.chair.premium.price,
     'chair tiers ascend in price (budget < mid < premium)');

  /* ================= 3. Runtime: allocation -> tier -> link ================= */
  console.log('\n3. Auto-detect: allocation picks the tier');
  const tierFor = amount => RT.selectProductTier(amount).key;
  ok(tierFor(0) === 'budget' && tierFor(249) === 'budget', 'under 250 -> budget');
  ok(tierFor(250) === 'mid' && tierFor(700) === 'mid', '250–700 -> mid');
  ok(tierFor(701) === 'premium' && tierFor(99999) === 'premium', 'above 700 -> premium');
  TIERS.forEach(tier => {
    ok(DB.chair[tier] !== undefined, `tier "${tier}" is addressable in the DB`);
  });

  console.log('\n3b. Cards read from the DB, not from hardcoded strings');
  const h = $('#rt-height'); h.value = '178'; fire(h, 'change');
  const hrs = $('#rt-hours'); hrs.value = '6to8'; fire(hrs, 'change');
  const wk = $('#rt-work'); wk.value = 'design'; fire(wk, 'change');
  $('#rt-calculate').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const card = () => $('#rt-product-list [data-category="chair"]');
  const href = () => card().querySelector('.rt-product__cta').getAttribute('href');
  const tierKey = () => card().getAttribute('data-tier');
  const nameOf = () => card().querySelector('.rt-product__name').textContent;

  const snap = RT.computeStep2();
  const expectedTier = tierFor(snap.amounts.chair);
  ok(tierKey() === expectedTier, 'rendered tier matches the chair allocation', [tierKey(), expectedTier]);
  ok(nameOf() === DB.chair[expectedTier].name, 'rendered name comes from the DB',
     [nameOf(), DB.chair[expectedTier].name]);
  ok(href() === DB.chair[expectedTier].link, 'rendered href is DB.chair[tier].link',
     [href(), DB.chair[expectedTier].link]);

  console.log('\n3c. Mutating the DB changes the card (single source of truth)');
  const original = DB.chair[expectedTier].link;
  DB.chair[expectedTier].link = 'https://www.amazon.com/dp/TESTONLY?tag=test-20';
  RT.updateStep2UI();
  RT.calculatePlan();
  ok(href() === 'https://www.amazon.com/dp/TESTONLY?tag=test-20',
     'editing the object is enough — no code change needed', href());
  DB.chair[expectedTier].link = original;
  RT.calculatePlan();

  /* ================= 4. Currency switch re-renders ================= */
  console.log('\n4. Currency no longer affects the URL');
  const linkBefore = href();
  const gbp = $('#rt-cur-gbp');
  gbp.checked = true; $('#rt-cur-usd').checked = false; fire(gbp, 'change');
  ok(href() === linkBefore, 'GBP switch leaves the affiliate URL untouched', [href(), linkBefore]);
  ok(!/amazon\.co\.uk/.test(href()), 'no per-region URL is generated any more', href());
  ok(doc.querySelector('#rt-product-list .rt-product__price').textContent.startsWith('£'),
     'GBP still reformats the PRICE (currency keeps its money job)');

  const cad = $('#rt-cur-cad');
  cad.checked = true; gbp.checked = false; fire(cad, 'change');
  ok(href() === linkBefore, 'CAD switch leaves the affiliate URL untouched', [href(), linkBefore]);
  ok(doc.querySelector('#rt-product-list .rt-product__price').textContent.startsWith('C$'),
     'CAD still reformats the price');

  const usd = $('#rt-cur-usd');
  usd.checked = true; cad.checked = false; fire(usd, 'change');
  ok(href() === linkBefore, 'USD switch back leaves the affiliate URL untouched', href());
  ok(tierKey() === expectedTier, 'tier is unchanged by a currency switch');
  ok(doc.querySelector('#rt-product-list .rt-product__price').textContent.startsWith('$'),
     'USD restores the $ price format');

  console.log('\n4b. Every card keeps its own link across currencies');
  const all = [...doc.querySelectorAll('#rt-product-list .rt-product')];
  ok(all.length === 3, 'three cards present');
  const hrefsUsd = all.map(c => c.querySelector('.rt-product__cta').getAttribute('href'));
  const gbp2 = $('#rt-cur-gbp');
  gbp2.checked = true;
  $('#rt-cur-usd').checked = false;
  fire(gbp2, 'change');
  const hrefsGbp = [...doc.querySelectorAll('#rt-product-list .rt-product')]
    .map(c => c.querySelector('.rt-product__cta').getAttribute('href'));
  ok(hrefsGbp.join('|') === hrefsUsd.join('|'),
     'all three hrefs are identical before and after the toggle', [hrefsUsd, hrefsGbp]);
  ok(hrefsGbp.every((u, i) => u === DB[CATEGORIES[i]][
       doc.querySelectorAll('#rt-product-list .rt-product')[i].getAttribute('data-tier')].link),
     'each card still points at its own product link');
  const usd2 = $('#rt-cur-usd');
  usd2.checked = true;
  $('#rt-cur-gbp').checked = false;
  fire(usd2, 'change');

  console.log('\n4c. A tier change re-points the link');
  const range = $('#rt-budget-range');
  range.value = '5000'; fire(range, 'input');
  ok(tierKey() === 'premium', 'big budget promotes the chair to premium', tierKey());
  ok(href() === DB.chair.premium.link, 'premium link is used', href());
  range.value = '600'; fire(range, 'input');
  ok(href() === DB.chair[tierKey()].link, 'href always tracks the active tier');

  /* ================= 5. Guard rails ================= */
  console.log('\n5. Guard rails');
  // Count in executable code only: the banner comment shows an example URL.
  const jsCode = JS
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok((jsCode.match(/https:\/\/amzn\.to\//g) || []).length === 9,
     'code contains exactly 9 affiliate URLs (one per product)',
     (jsCode.match(/https:\/\/amzn\.to\//g) || []).length);
  ok(!/links:\s*\{/.test(jsCode), 'no multi-currency links: { ... } blocks in code');
  ok(!/links\.(USD|GBP|CAD)/.test(jsCode), 'no links.USD / .GBP / .CAD references in code');

  ok(typeof RT.categoryMeta === 'object' && RT.categoryMeta.chair.icon.length > 0,
     'icons/labels live in CATEGORY_META, outside the DB');
  ok(!('icon' in DB.chair) && !('label' in DB.chair),
     'the affiliate database holds no presentation metadata');
  ok(RT.version === '0.9.0', 'version bumped to 0.9.0', RT.version);

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} \u2014 ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
