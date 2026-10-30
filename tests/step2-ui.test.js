/**
 * tests/step2-ui.test.js: Step 2 budget-preview UI
 * ---------------------------------------------------------------------------
 * Boots the real index.html in jsdom and asserts what the user actually sees:
 * bar widths, percentage/amount columns, the three metric chips, and the
 * behaviour on currency change.
 *
 *   npm i --no-save jsdom
 *   node tests/step2-ui.test.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

const boot = async () => {
  let html = fs.readFileSync(ROOT + 'index.html', 'utf8');
  const js = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  html = html.replace('<script src="assets/js/rt-calc.js" defer></script>',
                      '<script>' + js + '</script>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.console.log = () => {};
  dom.window.console.groupCollapsed = () => {};
  dom.window.console.groupEnd = () => {};
  await new Promise(res => {
    if (dom.window.document.readyState === 'complete') return res();
    dom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));
  return dom.window;
};

(async function main() {
  const window = await boot();
  const doc = window.document;
  const RT = window.RT_Calculator;
  const $ = s => doc.querySelector(s);
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const row = key => $(`#rt-slot-budget [data-category="${key}"]`);
  const barWidth = key => row(key).querySelector('.rt-alloc__bar').style.getPropertyValue('--rt-alloc');
  const pctOf = key => row(key).querySelector('.rt-alloc__pct').textContent;
  const amountOf = key => row(key).querySelector('.rt-alloc__amount').textContent;

  /* ================= 1. Structure ================= */
  console.log('\n1. Markup');
  const rows = doc.querySelectorAll('#rt-slot-budget .rt-alloc__row');
  ok(rows.length === 6, 'six allocation rows rendered', rows.length);
  const order = [...rows].map(r => r.getAttribute('data-category')).join();
  ok(order === 'chair,desk,monitor,keyboard,lighting,cables',
     'rows in the specified order', order);
  ok([...rows].every(r => r.querySelector('.rt-alloc__icon').textContent.trim().length > 0),
     'every row has an icon');
  ok([...rows].every(r => r.querySelector('.rt-alloc__label').textContent.trim().length > 0),
     'every row has a text label');
  ok([...rows].every(r => r.querySelector('.rt-alloc__track').getAttribute('role') === 'progressbar'),
     'tracks expose role=progressbar');
  ok([...rows].every(r => {
    const t = r.querySelector('.rt-alloc__track');
    return t.getAttribute('aria-valuemin') === '0' && t.getAttribute('aria-valuemax') === '100' &&
           t.hasAttribute('aria-valuenow') && t.hasAttribute('aria-valuetext');
  }), 'progressbars carry full aria value attributes');
  ok($('#rt-slot-budget').getAttribute('data-empty') === null,
     'slot is no longer flagged empty');
  ok(doc.querySelectorAll('#rt-slot-budget .rt-chip').length === 3, 'three metric chips');

  /* ================= 2. Default paint (USD 1000, baseline) ================= */
  console.log('\n2. Default paint: USD 1,000, no hours chosen');
  ok(barWidth('chair') === '35.00%', 'chair bar at 35.00%', barWidth('chair'));
  ok(barWidth('desk') === '25.00%', 'desk bar at 25.00%', barWidth('desk'));
  ok(barWidth('monitor') === '20.00%', 'monitor bar at 20.00%', barWidth('monitor'));
  ok(barWidth('keyboard') === '10.00%', 'keyboard bar at 10.00%', barWidth('keyboard'));
  ok(barWidth('lighting') === '5.00%' && barWidth('cables') === '5.00%',
     'lighting and cables at 5.00%', [barWidth('lighting'), barWidth('cables')]);
  ok(pctOf('chair') === '35%' && pctOf('cables') === '5%', 'percent labels rendered',
     [pctOf('chair'), pctOf('cables')]);
  ok(amountOf('chair') === '$350', 'chair amount $350', amountOf('chair'));
  ok(amountOf('desk') === '$250' && amountOf('monitor') === '$200',
     'desk $250, monitor $200', [amountOf('desk'), amountOf('monitor')]);
  ok(amountOf('keyboard') === '$100' && amountOf('cables') === '$50',
     'keyboard $100, cables $50', [amountOf('keyboard'), amountOf('cables')]);
  ok($('#rt-alloc-total').textContent === '$1,000', 'total echoes the budget',
     $('#rt-alloc-total').textContent);

  console.log('\n2b. Chips at default state');
  ok($('#rt-metric-cpch').textContent.trim() === 'Not yet',
     'CPCH shows plain words before hours are chosen', $('#rt-metric-cpch').textContent);
  ok($('#rt-metric-cpch-note').textContent.includes('desk hours'),
     'CPCH note explains what is missing', $('#rt-metric-cpch-note').textContent);
  ok($('#rt-metric-risk').textContent.includes('Low'), 'risk chip Low at $350 chair',
     $('#rt-metric-risk').textContent);
  ok($('#rt-metric-tier').textContent.includes('Balanced'), 'tier chip Balanced at $1,000',
     $('#rt-metric-tier').textContent);
  ok($('#rt-metric-tier').textContent.includes('\u2696'), 'tier chip uses the balance emoji',
     $('#rt-metric-tier').textContent);

  console.log('\n2c. Amounts always reconcile with the percentages');
  const active = RT.computeStep2();
  const pcts = RT.toDisplayPercentages(active.allocation);
  ok(Object.values(pcts).reduce((a, b) => a + b, 0) === 100,
     'displayed percentages sum to exactly 100', pcts);
  const amountSum = ['chair', 'desk', 'monitor', 'keyboard', 'lighting', 'cables']
    .reduce((t, k) => t + Number(amountOf(k).replace(/[^0-9]/g, '')), 0);
  ok(amountSum === 1000, 'displayed amounts sum to the budget', amountSum);
  ok(Math.abs(Number(pctOf('chair').replace('%', '')) - (active.amounts.chair / 1000) * 100) <= 1,
     'chair % agrees with chair amount within rounding');

  /* ================= 3. Reactive updates ================= */
  console.log('\n3. Reactive: budget changes re-render');
  const range = $('#rt-budget-range');
  range.value = '2000'; fire(range, 'input');
  ok(amountOf('chair') === '$700', 'chair amount doubles to $700 at $2,000', amountOf('chair'));
  ok($('#rt-alloc-total').textContent === '$2,000', 'total updates to $2,000',
     $('#rt-alloc-total').textContent);
  ok(barWidth('chair') === '35.00%', 'percentage unchanged by a pure budget change', barWidth('chair'));
  ok($('#rt-metric-tier').textContent.includes('Pro'),
     'tier flips to Pro at $2,000', $('#rt-metric-tier').textContent);
  ok($('#rt-metric-tier').textContent.includes('\uD83D\uDE80'), 'Pro uses the rocket emoji');
  ok($('#rt-metric-risk').textContent.includes('Low'),
     'healthier chair spend keeps risk Low', $('#rt-metric-risk').textContent);

  console.log('\n3b. Reactive: pain points re-weight the bars');
  const lb = doc.querySelector('#rt-slot-inputs input[value="lower-back"]');
  lb.checked = true; fire(lb, 'change');
  ok(barWidth('chair') === '40.00%', 'chair bar grows to 40.00% with lower-back',
     barWidth('chair'));
  ok(amountOf('chair') === '$800', 'chair amount follows to $800', amountOf('chair'));
  ok(barWidth('cables') === '2.00%', 'cables bar shrinks to 2.00%', barWidth('cables'));
  ok(amountOf('cables') === '$40', 'cables amount follows to $40', amountOf('cables'));

  console.log('\n3c. Reactive: hours choose the CPCH');
  const hours = $('#rt-hours');
  hours.value = '6to8'; fire(hours, 'change');
  ok($('#rt-metric-cpch').textContent === '$0.16/hr',
     'CPCH renders with /hr suffix for 2000 @ 6-8h', $('#rt-metric-cpch').textContent);
  ok($('#rt-metric-cpch-note').textContent.includes('7 hrs/day'),
     'CPCH note states the hours assumption', $('#rt-metric-cpch-note').textContent);

  /* ================= 4. Currency switching ================= */
  console.log('\n4. Currency switching reformats everything');
  const gbp = $('#rt-cur-gbp');
  gbp.checked = true; $('#rt-cur-usd').checked = false; fire(gbp, 'change');
  ok(amountOf('chair') === '£800', 'chair amount uses £', amountOf('chair'));
  ok($('#rt-alloc-total').textContent === '£2,000', 'total uses £', $('#rt-alloc-total').textContent);
  ok($('#rt-metric-cpch').textContent === '£0.16/hr', 'CPCH uses £', $('#rt-metric-cpch').textContent);
  ok(amountOf('chair').indexOf('$') === -1, 'no dollar sign leaks into GBP mode');
  ok($('#rt-budget-preview').getAttribute('data-currency') === 'GBP',
     'preview exposes data-currency for styling');

  const cad = $('#rt-cur-cad');
  cad.checked = true; gbp.checked = false; fire(cad, 'change');
  ok(amountOf('chair') === 'C$800', 'chair amount uses C$', amountOf('chair'));
  ok($('#rt-alloc-total').textContent === 'C$2,000', 'total uses C$',
     $('#rt-alloc-total').textContent);
  ok($('#rt-metric-cpch').textContent === 'C$0.16/hr', 'CPCH uses C$',
     $('#rt-metric-cpch').textContent);

  console.log('\n4b. Amounts still reconcile after a currency round-trip');
  const cadAmounts = ['chair', 'desk', 'monitor', 'keyboard', 'lighting', 'cables']
    .reduce((t, k) => t + Number(amountOf(k).replace(/[^0-9]/g, '')), 0);
  ok(cadAmounts === 2000, 'CAD amounts still sum to the budget', cadAmounts);

  const usd = $('#rt-cur-usd');
  usd.checked = true; cad.checked = false; fire(usd, 'change');
  ok(amountOf('chair') === '$800', 'back to $ after the round-trip', amountOf('chair'));

  /* ================= 5. Extreme states ================= */
  console.log('\n5. Extremes');
  range.value = '200'; fire(range, 'input');
  ok(amountOf('chair') === '$80', 'minimum budget: chair $80', amountOf('chair'));
  ok($('#rt-metric-tier').textContent.includes('Starter'), 'minimum budget -> Starter tier',
     $('#rt-metric-tier').textContent);
  ok($('#rt-metric-risk').textContent.includes('High'),
     'tiny chair budget pushes risk to High', $('#rt-metric-risk').textContent);
  ok($('#rt-metric-risk').textContent.includes('\uD83D\uDD34'), 'High uses the red emoji');
  const chipTone = $('#rt-metric-risk').closest('.rt-chip').getAttribute('data-tone');
  ok(chipTone === 'danger', 'risk chip carries data-tone=danger', chipTone);

  range.value = '5000'; fire(range, 'input');
  ok($('#rt-metric-tier').textContent.includes('Studio'), 'maximum budget -> Studio tier',
     $('#rt-metric-tier').textContent);
  ok($('#rt-metric-tier').textContent.includes('\uD83C\uDFC6'), 'Studio uses the trophy emoji');
  ok(amountOf('chair') === '$2,000', 'max budget: chair $2,000', amountOf('chair'));

  console.log('\n5b. Tier boundaries');
  const tierAt = b => RT.calculateSetupTier(b);
  ok(tierAt(699).key === 'starter' && tierAt(700).key === 'balanced',
     '700 is the Starter/Balanced boundary', [tierAt(699).key, tierAt(700).key]);
  ok(tierAt(1599).key === 'balanced' && tierAt(1600).key === 'pro',
     '1600 is the Balanced/Pro boundary', [tierAt(1599).key, tierAt(1600).key]);
  ok(tierAt(2999).key === 'pro' && tierAt(3000).key === 'studio',
     '3000 lands in Studio (no gap at the ">" boundary)',
     [tierAt(2999).key, tierAt(3000).key]);
  ok(tierAt(0).key === 'starter' && tierAt(NaN).key === 'starter', 'degenerate budgets fall back to Starter');

  /* ================= 6. Percentage distribution ================= */
  console.log('\n6. Percentage display (largest remainder)');
  const thirds = RT.toDisplayPercentages(
    { chair: 1 / 3, desk: 1 / 3, monitor: 1 / 3, keyboard: 0, lighting: 0, cables: 0 });
  ok(Object.values(thirds).reduce((a, b) => a + b, 0) === 100,
     'thirds sum to 100 rather than 99', thirds);
  const sevenths = RT.toDisplayPercentages({
    chair: 1 / 7, desk: 1 / 7, monitor: 1 / 7, keyboard: 1 / 7, lighting: 1 / 7, cables: 2 / 7 });
  ok(Object.values(sevenths).reduce((a, b) => a + b, 0) === 100,
     'sevenths sum to 100 rather than 99/101', sevenths);
  ok(Object.values(sevenths).every(v => Number.isInteger(v)), 'all displayed values are integers');

  console.log('\n6b. Fuzz: displayed percentages always total 100');
  const painPool = ['lower-back', 'neck-shoulder', 'wrist-hand'];
  const hoursPool = [null, '6to8', '8plus'];
  let allHundred = true, allReconciled = true;
  for (let i = 0; i < 120; i++) {
    const pains = painPool.filter(() => Math.random() < 0.5);
    const hours = hoursPool[Math.floor(Math.random() * hoursPool.length)];
    const budget = 200 + Math.floor(Math.random() * 4800);
    const snap = RT.computeStep2({ budget, currency: 'USD', hours, work: 'design', pains });
    const p = RT.toDisplayPercentages(snap.allocation);
    if (Object.values(p).reduce((a, b) => a + b, 0) !== 100) allHundred = false;
    if (Object.keys(snap.amounts).reduce((t, k) => t + snap.amounts[k], 0) !== budget) allReconciled = false;
  }
  ok(allHundred, 'fuzz: integer percentages total 100 in all 120 cases');
  ok(allReconciled, 'fuzz: amounts total the budget in all 120 cases');

  /* ================= 7. Graceful degradation ================= */
  console.log('\n7. Robustness');
  let htmlNoUi = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  const stripped = fs.readFileSync(ROOT + 'index.html', 'utf8')
    .replace(/<div class="rt-preview"[\s\S]*?<\/div>\s*<\/div>/, '<div></div>')
    .replace('<script src="assets/js/rt-calc.js" defer></script>',
             '<script>' + htmlNoUi + '</script>');
  const dom2 = new JSDOM(stripped, { runScripts: 'dangerously', pretendToBeVisual: true });
  dom2.window.console.log = () => {};
  dom2.window.console.groupCollapsed = () => {};
  await new Promise(res => {
    if (dom2.window.document.readyState === 'complete') return res();
    dom2.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));
  let survived = true;
  try {
    dom2.window.RT_Calculator.updateStep2UI();
  } catch (e) { survived = false; }
  ok(survived, 'updateStep2UI() survives a page with the preview removed');
  ok(dom2.window.RT_Calculator.getState().budget === 1000,
     'widget still initialises without the Step 2 panel');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
