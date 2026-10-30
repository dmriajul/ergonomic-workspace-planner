/**
 * tests/step3.test.js — AEO answer box, gear shortlist, reveal flow
 * ---------------------------------------------------------------------------
 * Boots the real index.html in jsdom and drives the widget the way a user does:
 * fill in the profile, press "Calculate my plan", inspect the answer + cards.
 *
 *   npm i --no-save jsdom
 *   node tests/step3.test.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

const boot = async (htmlOverride) => {
  let html = htmlOverride || fs.readFileSync(ROOT + 'index.html', 'utf8');
  const js = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  html = html.replace('<script src="assets/js/rt-calc.js" defer></script>',
                      '<script>' + js + '</script>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.console.log = () => {};
  dom.window.console.groupCollapsed = () => {};
  dom.window.console.groupEnd = () => {};
  if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  }
  await new Promise(res => {
    if (dom.window.document.readyState === 'complete') return res();
    dom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));
  return dom.window;
};

const fillValid = (doc, fire, w) => {
  const height = doc.querySelector('#rt-height');
  height.value = '178'; fire(height, 'change');
  const hours = doc.querySelector('#rt-hours');
  hours.value = '8plus'; fire(hours, 'change');
  const work = doc.querySelector('#rt-work');
  work.value = 'software-dev'; fire(work, 'change');
  return w.RT_Calculator.getState();
};

(async function main() {
  const window = await boot();
  const doc = window.document;
  const RT = window.RT_Calculator;
  const $ = s => doc.querySelector(s);
  const $$ = s => [...doc.querySelectorAll(s)];
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  /* ================= 1. Initial hidden state ================= */
  console.log('\n1. Step 3 starts hidden');
  const section = $('#rt-step-3');
  ok(section.hasAttribute('hidden'), 'results section carries [hidden]');
  ok(!section.classList.contains('is-open'), 'no stale open class');
  ok($('#rt-calculate').disabled === true, 'Calculate button disabled with empty profile');
  ok($('#rt-calculate-hint').textContent.includes('height'),
     'hint names the first missing input', $('#rt-calculate-hint').textContent);

  /* ================= 2. Readiness gate ================= */
  console.log('\n2. Readiness gate');
  let ready = RT.checkPlanReadiness({ height: null, hours: null, work: null });
  ok(ready.ready === false && ready.missing.length === 3,
     'all three fields reported missing', ready);
  const height = $('#rt-height');
  height.value = '178'; fire(height, 'change');
  ok($('#rt-calculate').disabled === true, 'still disabled after only height');
  ok($('#rt-calculate-hint').textContent.includes('daily hours'),
     'hint now names daily hours', $('#rt-calculate-hint').textContent);
  const hours = $('#rt-hours');
  hours.value = '8plus'; fire(hours, 'change');
  ok($('#rt-calculate').disabled === true, 'still disabled after height + hours');
  const work = $('#rt-work');
  work.value = 'software-dev'; fire(work, 'change');
  ok($('#rt-calculate').disabled === false, 'enabled once all three are chosen');
  ok($('#rt-calculate-hint').textContent.includes('Ready'),
     'hint switches to a ready state', $('#rt-calculate-hint').textContent);

  console.log('\n2b. Disabling again when an input is cleared');
  const hours2 = $('#rt-hours');
  hours2.value = ''; fire(hours2, 'change');
  ok($('#rt-calculate').disabled === true, 'clearing hours re-disables the button');
  ok(RT.checkPlanReadiness().ready === false, 'readiness reflects the cleared field');
  hours2.value = '8plus'; fire(hours2, 'change');

  /* ================= 3. Click reveals ================= */
  console.log('\n3. Calculate reveals the panel');
  const planEvents = [];
  $('.rt-calc').addEventListener('rt:planready', e => planEvents.push(e.detail));
  click($('#rt-calculate'));
  ok(!section.hasAttribute('hidden'), 'section is revealed after clicking');
  ok(planEvents.length === 1, 'rt:planready emitted once', planEvents.length);
  ok($('#rt-slot-results').getAttribute('data-empty') === null, 'slot no longer flagged empty');

  /* ================= 4. AEO text ================= */
  console.log('\n4. AEO answer text');
  const aeo = $('#rt-aeo-answer-text');
  const text = aeo.textContent.replace(/\s+/g, ' ').trim();
  ok($('#rt-aeo-answer-box') !== null, 'answer box exists');
  ok(text.length > 100, 'answer is a substantive paragraph', text.length);
  ok(!text.startsWith('Complete your profile above'),
     'personalised answer replaced the static SEO fallback', text.slice(0, 60));
  ok(text.startsWith('For a software developer working 8+ hours daily'),
     'opens with role + hours', text.slice(0, 60));
  ok(text.includes('$1,000'), 'includes the budget in the active currency', text);
  ok(text.includes('Ergo Budget Ratio'), 'names the methodology');
  ok(text.includes('ergonomic chair') && text.includes('to a desk') && text.includes('to a monitor'),
     'names chair, desk and monitor with their allocations');
  ok(/\$3\d\d \(\d\d%\) to an ergonomic chair/.test(text),
     'chair amount and percentage are derived, not hardcoded', text.match(/\$\d+ \(\d+%\) to an ergonomic chair/));
  ok(/goes to your keyboard, lighting and cables/.test(text),
     'accounts for the remaining categories');
  ok(!/[<>]/.test(text), 'contains no markup characters');
  ok(aeo.getAttribute('data-aeo-answer') !== null, 'paragraph is flagged for scrapers');

  console.log('\n4b. Amounts inside the prose reconcile with the allocation');
  const snap = RT.computeStep2();
  const money = s => Number(s.replace(/[^0-9]/g, ''));
  const chairMatch = text.match(/\$([\d,]+) \((\d+)%\) to an ergonomic chair/);
  ok(money(chairMatch[1]) === snap.amounts.chair,
     'prose chair amount equals the allocation', [money(chairMatch[1]), snap.amounts.chair]);
  ok(Number(chairMatch[2]) === RT.toDisplayPercentages(snap.allocation).chair,
     'prose chair percentage equals the displayed percentage');

  console.log('\n4c. Text varies with state');
  const lb = doc.querySelector('#rt-slot-inputs input[value="lower-back"]');
  lb.checked = true; fire(lb, 'change');
  const withPain = $('#rt-aeo-answer-text').textContent.replace(/\s+/g, ' ');
  ok(withPain.includes('with lower back pain'), 'pain point appears in the prose',
     withPain.slice(0, 90));
  ok(withPain.match(/\(\d+%\) to an ergonomic chair/)[0] !== chairMatch[2] + '%',
     'chair percentage rose with the lower-back modifier');
  lb.checked = false; fire(lb, 'change');
  const np = doc.querySelector('#rt-slot-inputs input[value="no-pain"]');
  np.checked = true; fire(np, 'change');
  ok($('#rt-aeo-answer-text').textContent.includes('preventively'),
     'preventive choice is described in the prose');
  np.checked = false; fire(np, 'change');

  console.log('\n4d. buildAEOText is pure');
  const a = RT.buildAEOText(
    { budget: 2000, currency: 'GBP', hours: '6to8', work: 'design', pains: [] },
    RT.calculateAllocation({}));
  const b = RT.buildAEOText(
    { budget: 2000, currency: 'GBP', hours: '6to8', work: 'design', pains: [] },
    RT.calculateAllocation({}));
  ok(a === b, 'same input gives the same text');
  ok(a.includes('£2,000'), 'GBP symbol and grouping used', a.slice(0, 80));
  ok(a.includes('designer') && a.includes('6 to 8 hours'), 'work and hours phrases inserted');
  ok(!a.includes('undefined') && !a.includes('NaN'), 'no undefined/NaN leaks into prose');
  const zero = RT.buildAEOText({ budget: 0, currency: 'USD', hours: null, work: null, pains: [] },
                               RT.calculateAllocation({}));
  ok(!/NaN|undefined/.test(zero), 'degenerate state still produces clean text');

  console.log('\n4e. Prose grammar without optional inputs');
  const noHours = RT.buildAEOText({ budget: 600, currency: 'CAD', hours: null, work: null, pains: [] },
                                  RT.calculateAllocation({}));
  ok(!/a full day daily/.test(noHours), 'never says "a full day daily"', noHours.slice(0, 60));
  ok(noHours.startsWith('For a professional working full-time,'),
     'falls back to "working full-time"', noHours.slice(0, 60));
  const preventive = RT.buildAEOText(
    { budget: 3500, currency: 'GBP', hours: '4to6', work: 'design', pains: ['no-pain'] },
    RT.calculateAllocation({ pains: ['no-pain'] }));
  ok(preventive.includes('(upgrading preventively)'),
     'preventive clause is parenthetical, not a comma splice',
     preventive.slice(0, 110));
  ok(!/pain, upgrading/.test(preventive), 'no comma splice before "upgrading"');
  // Mirrors the example in the spec for the lead sentence.
  ok(preventive.startsWith('For a designer working 4 to 6 hours daily'),
     'working clause reads naturally');

  /* ================= 5. Product cards ================= */
  console.log('\n5. Product cards');
  const cards = $$('#rt-product-list .rt-product');
  ok(cards.length === 3, 'three product cards rendered', cards.length);
  ok(cards.map(c => c.getAttribute('data-category')).join() === 'chair,desk,monitor',
     'cards in chair/desk/monitor order', cards.map(c => c.getAttribute('data-category')).join());
  ok(cards.every(c => c.querySelector('.rt-product__name').textContent.length > 0),
     'every card has a product name');
  ok(cards.every(c => c.querySelector('.rt-product__price') !== null), 'every card has a price');
  ok(cards.every(c => c.querySelector('.rt-product__rating').getAttribute('aria-label').includes('out of 5')),
     'ratings are announced accessibly');
  ok(cards.every(c => c.querySelector('.rt-product__cta').textContent === 'Check price on Amazon'),
     'every card has the Amazon CTA');
  ok(cards.every(c => c.querySelector('.rt-product__cta').tagName === 'A'),
     'CTAs are real links');
  ok(cards.every(c => {
    const rel = c.querySelector('.rt-product__cta').getAttribute('rel') || '';
    return ['sponsored', 'nofollow', 'noopener', 'noreferrer'].every(t => rel.includes(t));
  }), 'CTA rel includes sponsored + nofollow + noopener + noreferrer');
  ok(cards.every(c => c.querySelector('.rt-product__cta').getAttribute('target') === '_blank'),
     'CTAs open in a new tab');
  ok(cards.every(c => c.querySelector('data') !== null), 'prices use machine-readable <data value>');

  console.log('\n5b. Tier selection');
  const tierFor = amt => RT.selectProductTier(amt).key;
  ok(tierFor(0) === 'budget' && tierFor(249) === 'budget', '< 250 -> budget', tierFor(249));
  ok(tierFor(250) === 'mid' && tierFor(700) === 'mid', '250-700 -> mid', [tierFor(250), tierFor(700)]);
  ok(tierFor(701) === 'premium' && tierFor(5000) === 'premium', '> 700 -> premium', tierFor(701));
  ok(RT.selectProductTier(NaN).key === 'budget', 'invalid amount falls back to budget');

  console.log('\n5c. Cards follow the allocation');
  const chairCard = () => $('#rt-product-list [data-category="chair"]');
  const range = $('#rt-budget-range');
  range.value = '5000'; fire(range, 'input');
  ok(chairCard().getAttribute('data-tier') === 'premium',
     'big chair budget upgrades the chair to premium', chairCard().getAttribute('data-tier'));
  ok(chairCard().querySelector('.rt-product__name').textContent === 'Steelcase Gesture',
     'premium chair product shown', chairCard().querySelector('.rt-product__name').textContent);
  ok(chairCard().querySelector('.rt-product__fit').getAttribute('data-fit') === 'yes',
     'premium chair fits the big allocation', chairCard().querySelector('.rt-product__fit').textContent);

  // $200 total -> chair slice well under the $150 budget chair: honest "over" flag.
  range.value = '200'; fire(range, 'input');
  ok(chairCard().getAttribute('data-tier') === 'budget',
     'small chair budget drops to the budget tier', chairCard().getAttribute('data-tier'));
  ok(chairCard().querySelector('.rt-product__fit').getAttribute('data-fit') === 'no',
     'card admits the product exceeds the allocation',
     chairCard().querySelector('.rt-product__fit').textContent);
  ok(chairCard().querySelector('.rt-product__fit').textContent.startsWith('Over by'),
     'over-allocation copy is explicit', chairCard().querySelector('.rt-product__fit').textContent);
  range.value = '1000'; fire(range, 'input');

  console.log('\n5d. No stale cards accumulate');
  for (let i = 0; i < 5; i++) {
    range.value = String(1000 + i * 500); fire(range, 'input');
  }
  ok($$('#rt-product-list .rt-product').length === 3, 're-renders replace rather than append',
     $$('#rt-product-list .rt-product').length);

  /* ================= 6. Currency drives prices, not links ================= */
  console.log('\n6. Currency: prices reformat, affiliate link is fixed');
  const linkBeforeCurrency = chairCard().querySelector('.rt-product__cta').getAttribute('href');
  const gbp = $('#rt-cur-gbp');
  gbp.checked = true; $('#rt-cur-usd').checked = false; fire(gbp, 'change');
  ok(chairCard().querySelector('.rt-product__price').textContent.startsWith('£'),
     'prices reformat to £', chairCard().querySelector('.rt-product__price').textContent);
  ok(chairCard().querySelector('.rt-product__cta').getAttribute('href') === linkBeforeCurrency,
     'GBP leaves the affiliate link unchanged (OneLink resolves the region)',
     chairCard().querySelector('.rt-product__cta').getAttribute('href'));
  ok($('#rt-aeo-answer-text').textContent.includes('£'),
     'AEO prose reformats to £ too');

  const cad = $('#rt-cur-cad');
  cad.checked = true; gbp.checked = false; fire(cad, 'change');
  ok(chairCard().querySelector('.rt-product__price').textContent.startsWith('C$'),
     'prices reformat to C$', chairCard().querySelector('.rt-product__price').textContent);
  ok(chairCard().querySelector('.rt-product__cta').getAttribute('href') === linkBeforeCurrency,
     'CAD leaves the affiliate link unchanged',
     chairCard().querySelector('.rt-product__cta').getAttribute('href'));

  const usd = $('#rt-cur-usd');
  usd.checked = true; cad.checked = false; fire(usd, 'change');
  ok(chairCard().querySelector('.rt-product__cta').getAttribute('href') === linkBeforeCurrency,
     'USD leaves the affiliate link unchanged',
     chairCard().querySelector('.rt-product__cta').getAttribute('href'));

  console.log('\n6b. Database shape');
  ok(typeof RT.affiliateLinks.chair.budget.link === 'string',
     'each product carries ONE link', RT.affiliateLinks.chair.budget.link);
  ok(!('links' in RT.affiliateLinks.chair.budget),
     'no per-currency .links object remains');
  ok(RT.products === RT.affiliateLinks, 'legacy .products alias still points at the DB');

  /* ================= 7. Disclosure ================= */
  console.log('\n7. Affiliate disclosure');
  const disclosure = $('#rt-affiliate-disclosure');
  ok(disclosure !== null, 'disclosure exists');
  ok(disclosure.textContent.includes('As an Amazon Associate'),
     'states the Amazon Associate relationship');
  ok(disclosure.textContent.includes('Riajul Tech'), 'names the beneficiary');
  ok(disclosure.textContent.replace(/\s+/g, ' ').includes('qualifying purchases'),
     'uses the standard wording',
     disclosure.textContent.replace(/\s+/g, ' ').trim());
  const disclosureAfter = disclosure.compareDocumentPosition($('#rt-product-list')) &
                          window.Node.DOCUMENT_POSITION_PRECEDING;
  ok(!!disclosureAfter, 'disclosure sits below the product cards');

  /* ================= 8. Re-render after reveal ================= */
  console.log('\n8. Live updates after reveal');
  const before = $('#rt-aeo-answer-text').textContent;
  range.value = '2600'; fire(range, 'input');
  const after = $('#rt-aeo-answer-text').textContent;
  ok(before !== after, 'AEO text updates when the budget changes');
  ok(after.includes('$2,600'), 'new budget appears in the prose', after.slice(0, 90));
  ok(!section.hasAttribute('hidden'), 'section stays revealed after updates');

  console.log('\n8b. Fuzz: prose never leaks NaN/undefined');
  const painPool = ['lower-back', 'neck-shoulder', 'wrist-hand', 'no-pain'];
  const workPool = ['software-dev', 'video-editing', 'design', 'general-office', null];
  const hoursPool = ['lt4', '4to6', '6to8', '8plus', null];
  let clean = true;
  for (let i = 0; i < 150; i++) {
    const state = {
      budget: 200 + Math.floor(Math.random() * 4800),
      currency: ['USD', 'GBP', 'CAD'][Math.floor(Math.random() * 3)],
      hours: hoursPool[Math.floor(Math.random() * hoursPool.length)],
      work: workPool[Math.floor(Math.random() * workPool.length)],
      pains: painPool.filter(() => Math.random() < 0.4)
    };
    const out = RT.buildAEOText(state, RT.calculateAllocation(state));
    if (/NaN|undefined|null/.test(out)) clean = false;
  }
  ok(clean, 'fuzz: 150 random states produce clean prose');

  /* ================= 9. Accessibility / semantics ================= */
  console.log('\n9. Semantics');
  ok($('#rt-step-3 h3.rt-products__title') !== null, 'shortlist has its own heading');
  ok($$('#rt-product-list .rt-product__name').every(n => n.tagName === 'H4'),
     'product names are headings');
  ok($('#rt-product-list').tagName === 'UL', 'cards live in a list');
  ok($('#rt-calculate').getAttribute('aria-controls') === 'rt-step-3',
     'button declares what it controls');
  ok($('#rt-aeo-answer-box').getAttribute('tabindex') === '-1',
     'answer box receives focus after reveal');

  /* ================= 10. No-innerHTML discipline ================= */
  console.log('\n10. Safety');
  const src = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code),
     'no HTML-string injection anywhere');
  ok(!/api[_-]?key|secret|password|access[_-]?token/i.test(code),
     'no credentials in the bundle');
  ok((code.match(/https:\/\/amzn\.to\//g) || []).length === 9,
     'exactly 9 single affiliate URLs (one per product)',
     (code.match(/https:\/\/amzn\.to\//g) || []).length);
  ok(!/links\.(USD|GBP|CAD)/.test(code), 'no per-currency link lookups remain');
  ok(RT.version === '0.10.0', 'version bumped to 0.10.0', RT.version);

  /* ================= 11. Degrades without Step 3 markup ================= */
  console.log('\n11. Robustness');
  const strippedHtml = fs.readFileSync(ROOT + 'index.html', 'utf8')
    .replace(/<div class="rt-results" id="rt-results">[\s\S]*?<\/div>\s*<\/div>/, '<div></div>');
  const w2 = await boot(strippedHtml);
  let survived = true;
  try {
    w2.RT_Calculator.calculatePlan();
    w2.RT_Calculator.updateStep2UI();
  } catch (e) { survived = false; }
  ok(survived, 'missing Step 3 markup does not throw');
  ok(w2.RT_Calculator.getState().budget === 1000, 'widget still initialises');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} \u2014 ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
