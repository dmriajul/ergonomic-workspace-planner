/**
 * tests/step2.test.js — Step 2 engine: Ergo Budget Ratio™, CPCH, Posture Risk
 * ---------------------------------------------------------------------------
 * Two layers:
 *   1. Pure-function tests, driven directly through window.RT_Calculator.
 *      No DOM assumptions, no logging noise.
 *   2. Integration tests: boot index.html in jsdom and confirm the engine
 *      reacts to real control changes and publishes rt:step2update.
 *
 *   npm i --no-save jsdom
 *   node tests/step2.test.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sumOf = obj => Object.keys(obj).reduce((t, k) => t + obj[k], 0);

(async function main() {
  /* ---------------- boot ---------------- */
  let html = fs.readFileSync(ROOT + 'index.html', 'utf8');
  const js = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  html = html.replace('<script src="assets/js/rt-calc.js" defer></script>',
                      '<script>' + js + '</script>');

  const logs = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;

  // Silence + capture the Step 2 console output.
  const capture = (...a) => logs.push(a.map(x => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
  window.console.log = capture;
  window.console.groupCollapsed = capture;
  window.console.group = capture;
  window.console.groupEnd = () => {};
  window.console.warn = capture;

  await new Promise(res => {
    if (doc.readyState === 'complete') return res();
    window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));

  const RT = window.RT_Calculator;
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const $ = s => doc.querySelector(s);

  /* ================= 1. Baseline allocation ================= */
  console.log('\n1. Baseline allocation');
  const base = RT.calculateAllocation({});
  ok(JSON.stringify(base) === JSON.stringify({
    chair: 0.35, desk: 0.25, monitor: 0.2, keyboard: 0.1, lighting: 0.05, cables: 0.05
  }), 'unmodified state returns the 35/25/20/10/5/5 baseline', base);
  ok(near(sumOf(base), 1), 'baseline sums to 1.0', sumOf(base));
  ok(Object.keys(base).join() === 'chair,desk,monitor,keyboard,lighting,cables',
     'keys returned in documented order', Object.keys(base).join());
  ok(near(sumOf(RT.allocationBase), 1), 'configuration baseline itself sums to 1.0',
     sumOf(RT.allocationBase));

  /* ================= 2. Single-modifier arithmetic ================= */
  console.log('\n2. Individual modifiers (exact arithmetic)');
  const lb = RT.calculateAllocation({ pains: ['lower-back'] });
  ok(near(lb.chair, 0.40) && near(lb.desk, 0.27) && near(lb.keyboard, 0.08) &&
     near(lb.lighting, 0.03) && near(lb.cables, 0.02),
     'lower-back: chair .40, desk .27, keyboard .08, lighting .03, cables .02', lb);
  ok(near(sumOf(lb), 1), 'lower-back still sums to 1.0', sumOf(lb));

  const ns = RT.calculateAllocation({ pains: ['neck-shoulder'] });
  ok(near(ns.monitor, 0.26) && near(ns.chair, 0.37) && near(ns.desk, 0.22) &&
     near(ns.keyboard, 0.08) && near(ns.cables, 0.02),
     'neck-shoulder: monitor .26, chair .37, desk .22, keyboard .08, cables .02', ns);

  const wh = RT.calculateAllocation({ pains: ['wrist-hand'] });
  ok(near(wh.keyboard, 0.16) && near(wh.desk, 0.26) && near(wh.chair, 0.33) &&
     near(wh.lighting, 0.03) && near(wh.cables, 0.02),
     'wrist-hand: keyboard .16, desk .26, chair .33, lighting .03, cables .02', wh);

  const ve = RT.calculateAllocation({ work: 'video-editing' });
  ok(near(ve.monitor, 0.26) && near(ve.lighting, 0.07) && near(ve.cables, 0.01) &&
     near(ve.desk, 0.21), 'video-editing: monitor .26, lighting .07, cables .01, desk .21', ve);
  ok(near(sumOf(ve), 1), 'video-editing sums to 1.0', sumOf(ve));

  /* ================= 3. Floor + normalisation ================= */
  console.log('\n3. 1% floor and renormalisation (water-filling)');
  const eight = RT.calculateAllocation({ hours: '8+' });
  ok(eight.cables === 0.01, 'cables driven to 0.00 is floored at 0.01', eight.cables);
  ok(near(sumOf(eight), 1), 'floored result still sums to exactly 1.0', sumOf(eight));
  ok(eight.chair > 0.35 && eight.chair < 0.38, 'chair absorbs redistributed weight (.376)', eight.chair);
  ok(Object.keys(eight).every(k => eight[k] >= 0.01), 'no category below the 1% floor', eight);

  const eightAlias = RT.calculateAllocation({ hours: '8plus' });
  ok(JSON.stringify(eightAlias) === JSON.stringify(eight),
     "Step 1 value \"8plus\" equals spec value \"8+\"", eightAlias);

  const stack = RT.calculateAllocation({
    pains: ['lower-back', 'neck-shoulder', 'wrist-hand'],
    hours: '8+',
    work: 'video-editing'
  });
  ok(near(sumOf(stack), 1), 'all modifiers stacked still sum to 1.0', sumOf(stack));
  ok(Object.keys(stack).every(k => stack[k] >= 0.01),
     'every category survives three pains + 8h + video with >= 1%', stack);
  ok(stack.cables === 0.01, 'deep negative cables pinned exactly at the floor', stack.cables);

  console.log('\n3b. Invariants over 300 randomised states (fuzz)');
  const painPool = ['lower-back', 'neck-shoulder', 'wrist-hand', 'no-pain'];
  const hoursPool = [null, 'lt4', '4to6', '6to8', '8plus', '8+', 'under-4', '4-6', '6-8'];
  const workPool = [null, 'software-dev', 'video-editing', 'design', 'general-office'];
  let fuzzSumOk = true, fuzzFloorOk = true, fuzzTypeOk = true, worstSum = 0;
  for (let i = 0; i < 300; i++) {
    const pains = painPool.filter(() => Math.random() < 0.45);
    const hours = hoursPool[Math.floor(Math.random() * hoursPool.length)];
    const work = workPool[Math.floor(Math.random() * workPool.length)];
    const out = RT.calculateAllocation({ pains, hours, work });
    const s = sumOf(out);
    if (!near(s, 1, 1e-9)) { fuzzSumOk = false; worstSum = Math.max(worstSum, Math.abs(s - 1)); }
    if (Object.keys(out).some(k => out[k] < 0.01 - 1e-12)) fuzzFloorOk = false;
    if (Object.keys(out).length !== 6 || !Object.keys(out).every(k => typeof out[k] === 'number')) fuzzTypeOk = false;
  }
  ok(fuzzSumOk, 'fuzz: every allocation sums to 1.0 (±1e-9)', worstSum);
  ok(fuzzFloorOk, 'fuzz: every category respects the 1% floor');
  ok(fuzzTypeOk, 'fuzz: always exactly six numeric categories');

  /* ================= 4. Pain semantics ================= */
  console.log('\n4. Pain semantics');
  const noPain = RT.calculateAllocation({ pains: ['no-pain'] });
  ok(JSON.stringify(noPain) === JSON.stringify(base),
     '"no-pain" (preventive) applies zero modifiers', noPain);
  const orderA = RT.calculateAllocation({ pains: ['lower-back', 'neck-shoulder'] });
  const orderB = RT.calculateAllocation({ pains: ['neck-shoulder', 'lower-back'] });
  ok(JSON.stringify(orderA) === JSON.stringify(orderB),
     'modifier order does not matter (additive)', [orderA, orderB]);
  // Stacking the same pain twice drives cables to -0.01 and lighting to exactly
  // 0.01 — both lock at the floor — so the remaining four renormalise by 0.98
  // and chair lands at 0.441, not 0.45.
  const dupes = RT.calculateAllocation({ pains: ['lower-back', 'lower-back'] });
  ok(dupes.chair > lb.chair, 'duplicate pain entries stack (chair rises past single-pain)', [dupes.chair, lb.chair]);
  ok(near(dupes.chair, 0.441, 1e-4), 'stacked duplicate renormalises to 0.441', dupes.chair);
  ok(near(dupes.lighting, 0.01) && near(dupes.cables, 0.01),
     'exact-floor lighting and negative cables both lock at 1%', [dupes.lighting, dupes.cables]);
  ok(near(sumOf(dupes), 1), 'stacked duplicate still sums to 1.0', sumOf(dupes));

  /* ================= 5. Amounts ================= */
  console.log('\n5. Money allocation');
  const amounts = RT.allocateAmounts(1000, base);
  ok(amounts.chair === 350 && amounts.desk === 250 && amounts.monitor === 200 &&
     amounts.keyboard === 100 && amounts.lighting === 50 && amounts.cables === 50,
     'USD 1000 baseline splits 350/250/200/100/50/50', amounts);
  ok(sumOf(amounts) === 1000, 'amounts sum to the budget exactly', sumOf(amounts));
  const odd = RT.allocateAmounts(1234, base);
  ok(sumOf(odd) === 1234, 'rounding drift absorbed: 1234 still sums exactly', sumOf(odd));

  /* ================= 6. CPCH ================= */
  console.log('\n6. CPCH — Cost-Per-Comfort-Hour™');
  ok(RT.calculateCPCH(1000, '6-8') === '$0.08', 'spec example: 1000 @ 6-8h -> "$0.08"',
     RT.calculateCPCH(1000, '6-8'));
  ok(RT.calculateCPCH(1000, '6to8') === '$0.08', 'Step 1 vocabulary "6to8" gives the same result',
     RT.calculateCPCH(1000, '6to8'));
  ok(RT.calculateCPCH(1000, 'under-4') === '$0.18', 'under-4 (3h) -> "$0.18"',
     RT.calculateCPCH(1000, 'under-4'));
  ok(RT.calculateCPCH(1000, '4-6') === '$0.11', '4-6 (5h) -> "$0.11"', RT.calculateCPCH(1000, '4-6'));
  ok(RT.calculateCPCH(1000, '8+') === '$0.06', '8+ (9h) -> "$0.06"', RT.calculateCPCH(1000, '8+'));
  ok(near(RT.calculateCPCHValue(1000, '6-8'), 1000 / (7 * 365 * 5)),
     'raw value = budget / (hours × 365 × 5)', RT.calculateCPCHValue(1000, '6-8'));
  ok(RT.calculateCPCH(1000, '6-8', 'GBP') === '£0.08', 'GBP uses the £ symbol',
     RT.calculateCPCH(1000, '6-8', 'GBP'));
  ok(RT.calculateCPCH(1000, '6-8', 'CAD') === 'C$0.08', 'CAD uses the C$ symbol',
     RT.calculateCPCH(1000, '6-8', 'CAD'));
  ok(RT.calculateCPCH(1000, null) === null, 'no hours chosen -> null (not a fake number)');
  ok(RT.calculateCPCH(1000, 'bogus') === null, 'unknown hours value -> null');
  ok(RT.calculateCPCH(0, '6-8') === null, 'zero budget -> null');
  ok(RT.calculateCPCH(200, '8+') === '$0.01', '0.0122 still renders at 2dp (>= $0.01)',
     RT.calculateCPCH(200, '8+'));
  ok(RT.calculateCPCH(100, '8+') === '$0.006', 'true sub-cent (0.0061) falls back to 3 decimals',
     RT.calculateCPCH(100, '8+'));
  const money = RT.calculateCPCH(2000, '4to6');
  ok(/^[$£C]{1,2}\d/.test(money) || /^C\$/.test(money), 'always returns symbol + digits', money);

  /* ================= 7. Posture risk ================= */
  console.log('\n7. Posture risk');
  let r = RT.calculatePostureRisk(500, 'under-4', []);
  ok(r.level === 'low' && r.label.includes('Low'), 'expensive chair, low hours, no pain -> Low', r);
  ok(Object.keys(r).join() === 'level,label', 'returns exactly { level, label }', Object.keys(r).join());
  r = RT.calculatePostureRisk(200, '6-8', ['no-pain']);
  ok(r.level === 'moderate' && r.label.includes('Moderate'),
     'chair 200 + 6-8h + preventive -> Moderate', r);
  r = RT.calculatePostureRisk(100, '8+', ['lower-back', 'neck-shoulder']);
  ok(r.level === 'high' && r.label.includes('High'), 'cheap chair + 8h + 2 pains -> High', r);
  ok(r.label.includes('\uD83D\uDD34'), 'High uses the red circle emoji', r.label);
  ok(RT.calculatePostureRisk(500, 'under-4', []).label.includes('\uD83D\uDFE2'),
     'Low uses the green circle emoji');
  ok(RT.calculatePostureRisk(500, '6-8', ['lower-back']).label.includes('\uD83D\uDFE1'),
     'Moderate uses the yellow circle emoji (score 3)');
  ok(RT.calculatePostureRisk(500, '6-8', []).level === 'low',
     'score 2 sits at the top of the Low band', RT.calculatePostureRisk(500, '6-8', []));

  console.log('\n7b. Chair tiers (first match wins)');
  const pts = (chair, hours = 'under-4', pains = []) =>
    RT.calculatePostureRiskScore(chair, hours, pains).chairPoints;
  ok(pts(149) === 4 && pts(150) === 2, 'tier boundary 150: 149 -> 4 pts, 150 -> 2', [pts(149), pts(150)]);
  ok(pts(249) === 2 && pts(250) === 1, 'tier boundary 250: 249 -> 2, 250 -> 1', [pts(249), pts(250)]);
  ok(pts(399) === 1 && pts(400) === 0, 'tier boundary 400: 399 -> 1, 400 -> 0', [pts(399), pts(400)]);
  ok(pts(5000) === 0, 'a generous chair adds no points', pts(5000));

  console.log('\n7c. Hours + pain penalties');
  const score = (h, pains) => RT.calculatePostureRiskScore(500, h, pains).score;
  ok(score('under-4', []) === 0 && score('4-6', []) === 1 &&
     score('6-8', []) === 2 && score('8+', []) === 3,
     'hours penalty 0/1/2/3', [score('under-4', []), score('4-6', []), score('6-8', []), score('8+', [])]);
  ok(score('lt4', []) === 0 && score('8plus', []) === 3, 'aliases score identically');
  ok(score('under-4', ['no-pain']) === 0, '"no-pain" adds nothing', score('under-4', ['no-pain']));
  ok(score('under-4', ['lower-back', 'wrist-hand']) === 2, 'each pain adds 1', score('under-4', ['lower-back', 'wrist-hand']));
  ok(score('under-4', ['lower-back', 'lower-back']) === 1, 'duplicate pains counted once');
  ok(score('8+', ['lower-back', 'neck-shoulder', 'wrist-hand']) === 6,
     'maximum score = 3 hours + 3 pains = 6', score('8+', ['lower-back', 'neck-shoulder', 'wrist-hand']));
  const detail = RT.calculatePostureRiskScore(100, '6-8', ['lower-back']);
  ok(detail.chairPoints === 4 && detail.hoursPoints === 2 && detail.painPoints === 1 && detail.score === 7,
     'score breakdown exposes each component', detail);

  /* ================= 8. computeStep2 aggregation ================= */
  console.log('\n8. computeStep2 aggregation (pure)');
  const snap = RT.computeStep2({ budget: 2000, currency: 'GBP', hours: '6to8', work: 'design',
                                pains: ['lower-back'], height: 68 });
  ok(snap.budget === 2000 && snap.currency === 'GBP', 'echoes budget/currency', [snap.budget, snap.currency]);
  ok(near(sumOf(snap.allocation), 1), 'aggregate allocation sums to 1', sumOf(snap.allocation));
  ok(sumOf(snap.amounts) === 2000, 'aggregate amounts sum to the budget', sumOf(snap.amounts));
  ok(snap.chairAmount === snap.amounts.chair, 'chairAmount mirrors amounts.chair');
  ok(snap.cpch.startsWith('£'), 'CPCH formatted in the state currency', snap.cpch);
  ok(typeof snap.risk.level === 'string' && typeof snap.risk.label === 'string', 'risk object present');
  ok(snap.riskScore.score === snap.riskScore.chairPoints + snap.riskScore.hoursPoints + snap.riskScore.painPoints,
     'riskScore parts add up');
  const risky = RT.computeStep2({ budget: 400, currency: 'USD', hours: '8plus', pains: ['lower-back', 'wrist-hand'] });
  ok(risky.risk.level === 'high', 'small budget + long days + pain -> High', risky.risk);
  ok(risky.cpch !== null, 'CPCH still computed for a small budget');

  /* ================= 9. Integration: UI hook ================= */
  console.log('\n9. updateStep2UI() integration');
  logs.length = 0;
  const updates = [];
  $('.rt-calc').addEventListener('rt:step2update', e => updates.push(e.detail));

  const out = RT.updateStep2UI();
  ok(updates.length === 1, 'updateStep2UI emits exactly one rt:step2update', updates.length);
  ok(out && out.allocation && out.amounts, 'returns the computed snapshot');
  ok(logs.some(l => l.includes('Step 2')), 'logs a Step 2 block to the console', logs.slice(0, 3));
  ok(logs.some(l => l.includes('Allocation')), 'logs the allocation');
  ok(logs.some(l => l.includes('Amounts')), 'logs the amounts');
  ok(logs.some(l => l.includes('CPCH')), 'logs the CPCH line');
  ok(logs.some(l => l.includes('Posture risk')), 'logs the posture risk line');

  // Boot-time invocation happened during init.
  ok(updates.length === 1, 'no duplicate boot-time logging (idempotent init)');

  console.log('\n9b. Reactive wiring: Step 1 changes recompute Step 2');
  const range = $('#rt-budget-range');
  range.value = '3000'; fire(range, 'input');
  ok(updates.length === 2, 'slider move triggers a recompute', updates.length);
  ok(updates[1].budget === 3000, 'recompute saw the new budget', updates[1].budget);
  ok(updates[1].amounts.chair === Math.round(3000 * updates[1].allocation.chair),
     'chair amount matches allocation × new budget');

  const height = $('#rt-height');
  height.value = '183'; fire(height, 'change');
  ok(updates.length === 3, 'profile change triggers a recompute', updates.length);

  const hours = $('#rt-hours');
  hours.value = '6to8'; fire(hours, 'change');
  ok(updates.length === 4, 'hours change triggers a recompute', updates.length);
  ok(updates[4 - 1].cpch === RT.calculateCPCH(3000, '6to8'),
     'CPCH reflects the newly chosen hours', updates[3].cpch);

  const painBox = doc.querySelector('#rt-slot-inputs input[value="lower-back"]');
  painBox.checked = true; fire(painBox, 'change');
  ok(updates.length === 5, 'pain change triggers a recompute', updates.length);
  ok(updates[4].allocation.chair > base.chair, 'lower-back lifts the chair share', updates[4].allocation.chair);

  const cad = $('#rt-cur-cad');
  cad.checked = true; $('#rt-cur-usd').checked = false; fire(cad, 'change');
  ok(updates.length === 6, 'currency change triggers a recompute', updates.length);
  ok(updates[5].currency === 'CAD' && updates[5].cpch.startsWith('C$'),
     'step 2 output follows the currency', [updates[5].currency, updates[5].cpch]);

  console.log('\n9c. No hours selected yet');
  const fresh = RT.computeStep2({ budget: 1000, currency: 'USD', hours: null, work: null, pains: [] });
  ok(fresh.cpch === null, 'CPCH is null before hours are chosen');
  ok(fresh.risk.label.includes('Low'), 'risk still resolves without hours', fresh.risk);
  // Live state now has hours chosen, so boot a clean instance for this check.
  const freshDom = new JSDOM(
    html.replace('<!-- x -->', ''),
    { runScripts: 'dangerously', pretendToBeVisual: true }
  );
  const freshLogs = [];
  freshDom.window.console.log = (...a) =>
    freshLogs.push(a.map(x => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
  freshDom.window.console.groupCollapsed = freshDom.window.console.log;
  freshDom.window.console.groupEnd = () => {};
  await new Promise(res => {
    if (freshDom.window.document.readyState === 'complete') return res();
    freshDom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));
  freshDom.window.RT_Calculator.updateStep2UI();
  ok(freshLogs.some(l => l.includes('pick daily hours')),
     'logs a prompt instead of "null" before hours are chosen', freshLogs.slice(2, 6));
  ok(freshDom.window.RT_Calculator.getState().budget === 1000,
     'fresh instance still starts at the documented default');

  /* ================= 10. Scope discipline ================= */
  console.log('\n10. Scope discipline');
  const src = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok(!/\baeo\b|answer box|affiliate|amazon|product link/i.test(code),
     'no AEO copy / affiliate logic yet (Step 3 scope)');
  ok(!/document\.(body|head)|innerHTML/.test(code), 'engine never touches body/head/innerHTML');
  ok(/function calculateAllocation/.test(code) && /function calculateCPCH/.test(code) &&
     /function calculatePostureRisk/.test(code), 'core functions present');
  const fnBodies = ['calculateAllocation', 'calculateCPCH', 'calculatePostureRisk', 'computeStep2'];
  ok(fnBodies.every(name => {
    const start = code.indexOf('function ' + name + '(');
    if (start === -1) return false;
    const body = code.slice(start, start + 1400);
    return !/document\.|querySelector|\.style\./.test(body);
  }), 'core functions are DOM-free (pure)');
  ok(RT.version === '0.4.0', 'version bumped to 0.4.0', RT.version);

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} \u2014 ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
