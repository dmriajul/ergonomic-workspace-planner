/**
 * tests/step1.test.js — behavioural tests for Step 1 (rt-calc.js)
 * ---------------------------------------------------------------------------
 * Runs the real index.html through jsdom with the controller inlined, then
 * drives the controls exactly as a user would (input/change events).
 *
 *   npm i --no-save jsdom csstree-validator
 *   node tests/step1.test.js
 *
 * Exits non-zero on failure, so it drops straight into CI later.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { validate } = require('csstree-validator');

const ROOT = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, cond === false ? '' : '', JSON.stringify(extra)); }
};

(async function main() {
  /* ---------- CSS validation ---------- */
  for (const f of ['rt-calc.css', 'rt-tokens.css', 'demo-page.css']) {
    const p = ROOT + 'assets/css/' + f;
    const errs = validate(fs.readFileSync(p, 'utf8'), p);
    ok(errs.length === 0, `CSS valid: ${f}`, errs.slice(0, 3).map(e => e.message));
  }

  /* ---------- Boot with the controller inlined ---------- */
  let html = fs.readFileSync(ROOT + 'index.html', 'utf8');
  const js = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  html = html.replace('<script src="assets/js/rt-calc.js" defer></script>',
                      '<script>' + js + '</script>');

  const logs = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;
  window.console.log = (...a) =>
    logs.push(a.map(x => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));

  /* Wait for DOMContentLoaded/load — the controller defers to it */
  await new Promise(res => {
    if (doc.readyState === 'complete') return res();
    window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const $ = s => doc.querySelector(s);
  const RT = window.RT_Calculator;

  console.log('\n1. Namespace & initial state');
  ok(typeof RT === 'object', 'window.RT_Calculator exists');
  let st = RT.getState();
  ok(st.budget === 1000, 'budget defaults to 1000', st.budget);
  ok(st.currency === 'USD', 'currency defaults to USD', st.currency);
  ok(st.height === null, 'height defaults to null', st.height);
  ok(st.hours === null, 'hours defaults to null', st.hours);
  ok(st.work === null, 'work defaults to null', st.work);
  ok(Array.isArray(st.pains) && st.pains.length === 0, 'pains defaults to []');
  ok($('.rt-calc').getAttribute('data-rt-ready') === 'true', 'root marked ready after DOMContentLoaded');
  st.pains.push('hacked');
  ok(RT.getState().pains.length === 0, 'getState() returns a defensive copy');

  console.log('\n2. Initial DOM paint');
  const range = $('#rt-budget-range'), amount = $('#rt-budget-amount');
  const out = $('#rt-budget-display .rt-budget__value');
  ok(range.value === '1000', 'range value 1000', range.value);
  ok(amount.value === '1000', 'number input value 1000', amount.value);
  ok(out.textContent === '1,000', 'output shows 1,000', out.textContent);
  ok(range.style.getPropertyValue('--rt-range-fill') === '16.7%',
     '--rt-range-fill 16.7%', range.style.getPropertyValue('--rt-range-fill'));
  ok($('.rt-calc').getAttribute('data-currency') === 'USD', 'data-currency=USD');
  ok(range.min === '200' && range.max === '5000', 'range window 200-5000', range.min + '/' + range.max);
  ok($('.rt-budget__scale-min').textContent === '200', 'scale min label 200');
  ok($('.rt-budget__scale-max').textContent === '5,000', 'scale max label 5,000');
  ok(range.getAttribute('aria-valuetext') === '$1,000 USD', 'aria-valuetext on load',
     range.getAttribute('aria-valuetext'));

  console.log('\n3. Slider -> number input + fill');
  range.value = '2600'; fire(range, 'input');
  ok(RT.getState().budget === 2600, 'state.budget 2600', RT.getState().budget);
  ok(amount.value === '2600', 'number input synced', amount.value);
  ok(out.textContent === '2,600', 'output 2,600', out.textContent);
  ok(range.style.getPropertyValue('--rt-range-fill') === '50%', 'fill 50%',
     range.style.getPropertyValue('--rt-range-fill'));
  ok(range.getAttribute('aria-valuetext') === '$2,600 USD', 'aria-valuetext updates',
     range.getAttribute('aria-valuetext'));

  console.log('\n4. Number input -> slider');
  amount.value = '3200'; fire(amount, 'input');
  ok(RT.getState().budget === 3200, 'state.budget 3200', RT.getState().budget);
  ok(range.value === '3200', 'range synced to 3200', range.value);
  ok(out.textContent === '3,200', 'output 3,200', out.textContent);

  console.log('\n5. Mid-typing guard');
  amount.value = '1'; fire(amount, 'input');
  ok(RT.getState().budget === 3200, 'typing "1" does not slam budget to min', RT.getState().budget);
  amount.value = ''; fire(amount, 'blur');
  ok(RT.getState().budget === 3200, 'empty blur keeps last valid budget', RT.getState().budget);

  console.log('\n6. Snap + clamp on commit');
  amount.value = '3271'; fire(amount, 'change');
  ok(RT.getState().budget === 3250, '3271 snaps to 3250 (step 50)', RT.getState().budget);
  amount.value = '99999'; fire(amount, 'change');
  ok(RT.getState().budget === 5000, '99999 clamps to max 5000', RT.getState().budget);
  ok(amount.value === '5000', 'input normalised back into range', amount.value);

  console.log('\n7. Currency switching');
  const gbp = $('#rt-cur-gbp'), cad = $('#rt-cur-cad'), usd = $('#rt-cur-usd');
  gbp.checked = true; fire(gbp, 'change');
  st = RT.getState();
  ok(st.currency === 'GBP', 'currency GBP', st.currency);
  ok(range.min === '150' && range.max === '4000', 'range 150-4000', range.min + '/' + range.max);
  ok(amount.min === '150' && amount.max === '4000', 'number input 150-4000', amount.min + '/' + amount.max);
  ok(st.budget === 4000, 'budget clamped 5000 -> 4000', st.budget);
  ok($('.rt-calc').getAttribute('data-currency') === 'GBP', 'data-currency=GBP');
  ok($('.rt-budget__scale-min').textContent === '150', 'scale min relabelled 150',
     $('.rt-budget__scale-min').textContent);
  ok($('.rt-budget__scale-max').textContent === '4,000', 'scale max relabelled 4,000',
     $('.rt-budget__scale-max').textContent);
  range.value = '1000'; fire(range, 'input');
  ok(range.getAttribute('aria-valuetext') === '£1,000 GBP', 'aria-valuetext uses £',
     range.getAttribute('aria-valuetext'));
  ok(out.textContent === '1,000', 'GBP formatted with en-GB separators', out.textContent);
  cad.checked = true; gbp.checked = false; fire(cad, 'change');
  ok(range.min === '250' && range.max === '6500', 'CAD range 250-6500', range.min + '/' + range.max);
  ok(RT.getState().budget === 1000, 'CAD keeps in-range 1000', RT.getState().budget);
  usd.checked = true; cad.checked = false; fire(usd, 'change');
  ok(RT.getState().currency === 'USD' && range.max === '5000', 'back to USD 200-5000', range.max);
  ok(RT.getState().budget === 1000, 'value survives round-trip', RT.getState().budget);

  console.log('\n8. Pain exclusivity');
  const cb = v => doc.querySelector(`#rt-slot-inputs input[value="${v}"]`);
  const neck = cb('neck-shoulder'), back = cb('lower-back');
  const wrist = cb('wrist-hand'), none = cb('no-pain');
  neck.checked = true; fire(neck, 'change');
  back.checked = true; fire(back, 'change');
  ok(RT.getState().pains.join() === 'neck-shoulder,lower-back', 'two symptoms accumulate',
     RT.getState().pains.join());
  none.checked = true; fire(none, 'change');
  ok(RT.getState().pains.join() === 'no-pain', 'No Pain clears state', RT.getState().pains.join());
  ok(!neck.checked && !back.checked, 'symptom checkboxes visually cleared');
  wrist.checked = true; fire(wrist, 'change');
  ok(RT.getState().pains.join() === 'wrist-hand', 'symptom clears No Pain', RT.getState().pains.join());
  ok(!none.checked, 'No Pain checkbox visually unchecked');
  neck.checked = true; fire(neck, 'change');
  ok(RT.getState().pains.length === 2, 'multi-select still allowed', RT.getState().pains.join());
  wrist.checked = false; fire(wrist, 'change');
  ok(RT.getState().pains.join() === 'neck-shoulder', 'unchecking updates state', RT.getState().pains.join());

  console.log('\n9. Profile + console.log of OSHA maths');
  const height = $('#rt-height'), hours = $('#rt-hours'), work = $('#rt-work');
  ok(height.value === '' && hours.value === '' && work.value === '',
     'selects start on placeholder (state/DOM agree)');
  ok(RT.getState().height === null, 'state.height stays null until chosen');
  height.value = '173'; fire(height, 'change');
  st = RT.getState();
  // Label is 5'8" (173 cm): ft/in (68in) is exact, "173 cm" is a rounding, so
  // the parser deliberately prefers ft/in. 68in = 172.72cm.
  ok(st.height === 68, 'state.height stored as inches 68 (ft/in beats rounded cm)', st.height);
  const log = logs.find(l => l.includes('Height changed'));
  ok(!!log, 'console.log fired on height change', logs.slice(0, 2));
  ok(!!log && log.includes('"seatedHeightInches":27.88'), 'logged seated 27.88in', log);
  ok(!!log && log.includes('"standingHeightInches":42.84'), 'logged standing 42.84in', log);
  ok(!!log && log.includes('"seatedHeightCm":70.8'), 'logged seated 70.8cm', log);
  ok(!!log && log.includes('"standingHeightCm":108.8'), 'logged standing 108.8cm', log);
  hours.value = '6to8'; fire(hours, 'change');
  ok(RT.getState().hours === '6to8', 'state.hours 6to8', RT.getState().hours);
  work.value = 'design'; fire(work, 'change');
  ok(RT.getState().work === 'design', 'state.work design', RT.getState().work);

  console.log('\n10. Pure maths + parser (no DOM)');
  const m = RT.calculateErgonomicHeights(68);
  ok(m.seatedHeightInches === 27.88, 'seated 68*0.41 = 27.88', m.seatedHeightInches);
  ok(m.standingHeightInches === 42.84, 'standing 68*0.63 = 42.84', m.standingHeightInches);
  ok(m.seatedHeightCm === 70.8, 'seated cm 70.8', m.seatedHeightCm);
  ok(m.standingHeightCm === 108.8, 'standing cm 108.8', m.standingHeightCm);
  ok(Object.keys(m).length === 4, 'exactly the 4 documented keys', Object.keys(m).join());
  ok(Object.keys(m).join() === 'seatedHeightInches,standingHeightInches,seatedHeightCm,standingHeightCm',
     'key names/order match the spec');
  ok(RT.calculateErgonomicHeights(0) === null, 'zero -> null');
  ok(RT.calculateErgonomicHeights('abc') === null, 'garbage -> null');
  ok(RT.calculateErgonomicHeights(-5) === null, 'negative -> null');
  ok(RT.calculateErgonomicHeights(undefined) === null, 'undefined -> null');
  ok(RT.parseHeightToInches(`5'8" (173 cm)`) === 68, `parses 5'8" -> 68in`, RT.parseHeightToInches(`5'8" (173 cm)`));
  ok(RT.parseHeightToInches('173 cm') === 68.11, 'parses 173cm -> 68.11in', RT.parseHeightToInches('173 cm'));
  ok(RT.parseHeightToInches('6 ft 0') === 72, 'parses "6 ft 0" -> 72in');
  ok(RT.parseHeightToInches(68) === 68, 'number 68 = inches');
  ok(RT.parseHeightToInches(173) === 68.11, 'number 173 = cm');
  ok(RT.parseHeightToInches('') === null, 'empty -> null');
  ok(RT.parseHeightToInches(null) === null, 'null -> null');

  console.log('\n11. Events');
  const seen = [];
  const rootEl = $('.rt-calc');
  ['rt:budgetchange', 'rt:currencychange', 'rt:painschange', 'rt:profilechange', 'rt:heightchange']
    .forEach(t => rootEl.addEventListener(t, () => seen.push(t)));
  range.value = '1200'; fire(range, 'input');
  const cad2 = $('#rt-cur-cad'); usd.checked = false; cad2.checked = true; fire(cad2, 'change');
  none.checked = true; fire(none, 'change');
  height.value = '183'; fire(height, 'change');
  ok(seen.includes('rt:budgetchange'), 'rt:budgetchange emitted');
  ok(seen.includes('rt:currencychange'), 'rt:currencychange emitted');
  ok(seen.includes('rt:painschange'), 'rt:painschange emitted');
  ok(seen.includes('rt:heightchange'), 'rt:heightchange emitted');
  ok(seen.includes('rt:profilechange'), 'rt:profilechange emitted');

  console.log('\n12. Idempotency');
  const before = RT.getState().budget;
  ok(RT.init() === true, 'second init() reports ready');
  ok(RT.getState().budget === before, 'second init() does not reset state');
  ok(doc.querySelectorAll('.rt-calc').length === 1, 'still a single instance');

  console.log('\n13. Scope discipline');
  const src = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok(/\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/.test(code) &&
     (code.match(/\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || []).every(x => x.includes('RT_Calculator')),
     'only window.RT_Calculator is assigned to window');
  ok(!/\bdocument\.(body|head)\b/.test(code), 'no direct body/head manipulation');
  ok(!/innerHTML/.test(code), 'no innerHTML (no theme/CSP surprises)');
  ok(!/jQuery|\$\(/.test(code), 'no jQuery dependency');
  ok(!/\b(eval|Function\()/.test(code), 'no eval');
  ok(!/aeo|answer box|affiliate|amazon/i.test(code),
     'no AEO copy or affiliate logic in the engine yet (Step 3 scope)');

  console.log('\n14. Multi-currency fill formula');
  const fillCheck = (v, min, max) => Math.round((v - min) / (max - min) * 1000) / 10;
  usd.checked = true; cad2.checked = false; fire(usd, 'change');
  range.value = '200'; fire(range, 'input');
  ok(range.style.getPropertyValue('--rt-range-fill') === '0%', 'min -> 0%', range.style.getPropertyValue('--rt-range-fill'));
  range.value = '5000'; fire(range, 'input');
  ok(range.style.getPropertyValue('--rt-range-fill') === '100%', 'max -> 100%', range.style.getPropertyValue('--rt-range-fill'));
  range.value = '2600'; fire(range, 'input');
  ok(parseFloat(range.style.getPropertyValue('--rt-range-fill')) === fillCheck(2600, 200, 5000),
     'mid -> (v-min)/(max-min) = 50%', range.style.getPropertyValue('--rt-range-fill'));

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
