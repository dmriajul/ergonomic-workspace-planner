/**
 * tests/build.test.js: the WordPress production artefacts
 * ---------------------------------------------------------------------------
 * Proves the single-file build is (a) genuinely self-contained, (b) scoped so
 * it cannot leak into a host theme, (c) still functional end-to-end, and
 * (d) in sync with the source files it is generated from.
 *
 *   npm i --no-save jsdom
 *   node tests/build.test.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + '/';
const SINGLE = ROOT + 'wordpress/single-file.html';
const PHP = ROOT + 'wordpress/functions-snippet.php';
const GUIDE = ROOT + 'wordpress/REPLACE-THIS.md';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

/* Paren-aware split so `:where(a, b)` is not mistaken for separate selectors. */
const splitSelectors = sel => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
};

const stripHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, '');

(async function main() {

  /* ================= 1. Artefacts exist ================= */
  console.log('\n1. Artefacts');
  ok(fs.existsSync(SINGLE), 'wordpress/single-file.html exists');
  ok(fs.existsSync(PHP), 'wordpress/functions-snippet.php exists');
  ok(fs.existsSync(GUIDE), 'wordpress/REPLACE-THIS.md exists');
  ok(fs.existsSync(ROOT + 'tools/build-single-file.py'), 'build script exists');

  const single = fs.readFileSync(SINGLE, 'utf8');
  const clean = stripHtmlComments(single);
  const js = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');

  /* ================= 2. Self-contained ================= */
  console.log('\n2. Self-contained (no external assets)');
  const linkTags = [...clean.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  const srcTags = [...clean.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gi)].map(m => m[0]);
  ok(linkTags.length === 0, 'no <link> tags (nothing fetched externally)', linkTags);
  ok(srcTags.length === 0, 'no external <script src>', srcTags);
  ok(!/assets\/css\//.test(clean), 'does not reference the dev CSS paths');
  ok(!/assets\/js\//.test(clean), 'does not reference the dev JS path');
  ok(!/demo-page\.css/.test(clean), 'demo-page.css is NOT included');

  const styleBlocks = [...clean.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scriptBlocks = [...clean.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  ok(styleBlocks.length === 1, 'exactly one inline <style> block', styleBlocks.length);
  ok(scriptBlocks.length === 1, 'exactly one inline <script> block', scriptBlocks.length);
  const css = styleBlocks[0][1];
  const inlineJs = scriptBlocks[0][1];

  /* ================= 3. The CSS cannot leak ================= */
  console.log('\n3. CSS scoping');
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/:root/.test(cssNoComments), 'no :root token declaration');
  ok(!/(^|[},\s])(body|html)\s*[{,]/.test(cssNoComments),
     'no body/html selectors');
  ok(!/body\.rt-demo/.test(cssNoComments), 'no preview-harness body rules');

  const unscoped = [];
  for (const m of cssNoComments.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@') || sel === 'from' || sel === 'to' || /^[\d.]+%$/.test(sel)) continue;
    for (const part of splitSelectors(sel)) {
      if (!part.startsWith('.rt-')) unscoped.push(part);
    }
  }
  ok(unscoped.length === 0, 'every selector is scoped to .rt-*', unscoped.slice(0, 5));

  const tokenBlock = cssNoComments.slice(0, cssNoComments.indexOf('}', cssNoComments.indexOf('.rt-calc')));
  ok(/\.rt-calc\s*,\s*\.rt-methodology|\.rt-calc,\s*\n\s*\.rt-methodology/.test(
       cssNoComments.split('{')[0] + '{'),
     'tokens declared on .rt-calc, .rt-methodology (not :root)');

  /* ================= 4. The JS cannot leak ================= */
  console.log('\n4. JS scoping');
  ok(/^\(function \(window, document\)/m.test(inlineJs.trim()),
     'inline script is a single IIFE');
  const windowAssigns = inlineJs.match(/\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || [];
  ok(windowAssigns.every(a => a.includes('RT_Calculator')),
     'only window.RT_Calculator is assigned', windowAssigns);
  ok(!/\bdocument\.(body|head)\b/.test(inlineJs), 'does not touch document.body/head');
  ok(!/<\/script/i.test(inlineJs), 'no premature </script> sequence in the script body');

  /* ================= 5. Parity with the sources ================= */
  console.log('\n5. Parity with rt-calc.js / index.html');
  ok(inlineJs.length >= js.length * 0.98,
     'inline JS carries the full controller', [inlineJs.length, js.length]);
  ['buildAEOText', 'calculateAllocation', 'calculateCPCH', 'calculatePostureRisk',
   'RT_AFFILIATE_LINKS', 'renderProducts', 'calculatePlan'].forEach(fn => {
    ok(inlineJs.includes(fn), `inline JS includes ${fn}`);
  });
  ok(single.includes('rt-calc" id="rt-calculator"') || single.includes('class="rt-calc" id="rt-calculator"'),
     'widget markup included');
  ok(single.includes('class="rt-methodology"') && single.includes('id="rt-methodology"'),
     'methodology / E-E-A-T section included');
  ok(/As an Amazon Associate/.test(single), 'affiliate disclosure included');

  /* ================= 6. User's review checklist ================= */
  console.log('\n6. Review checklist');
  const currencyKeys = [...inlineJs.matchAll(/^\s{4}([A-Z]{3}):\s*\{\s*code:/gm)].map(m => m[1]);
  ok(currencyKeys.length === 3, 'exactly three currencies configured', currencyKeys);
  ok(currencyKeys.sort().join() === 'CAD,GBP,USD',
     'currencies are exactly USD, GBP and CAD', currencyKeys);
  ok(!/\bEUR\b|\bAUD\b|\bINR\b/.test(inlineJs), 'no other currency codes appear');

  ok(/SEATED_RATIO = 0\.41/.test(inlineJs), 'seated ratio 0.41 intact');
  ok(/STANDING_RATIO = 0\.63/.test(inlineJs), 'standing ratio 0.63 intact');
  ok(/inches \* SEATED_RATIO/.test(inlineJs), 'seated height = inches x 0.41');
  ok(/inches \* STANDING_RATIO/.test(inlineJs), 'standing height = inches x 0.63');

  const staticFallback = single.match(/<p class="rt-aeo__text"[^>]*>([\s\S]*?)<\/p>/);
  ok(staticFallback !== null, 'static AEO paragraph present in the build');
  const fallbackText = staticFallback[1].replace(/\s+/g, ' ').trim();
  ok(/Fill in your details above/.test(fallbackText), 'fallback tells the visitor what to do');
  ok(/35%/.test(fallbackText) && /25%/.test(fallbackText) && /20%/.test(fallbackText),
     'fallback carries the 35/25/20 guidance', fallbackText.slice(0, 80));
  ok(/ergonomic chair/i.test(fallbackText), 'fallback names the chair (keyword)');

  const linkCount = (inlineJs.match(/link:\s*"https:\/\//g) || []).length;
  ok(linkCount === 9, 'the 9 single affiliate links are present in the build', linkCount);
  ok(single.includes('https://example.com') === false,
     'build does not embed the example.com canonical (head is not copied)');

  /* ================= 7. HTML validity of the artefact ================= */
  console.log('\n7. Markup balance');
  const dom = new JSDOM(single, { runScripts: 'outside-only' });
  ok(dom.window.document.querySelector('.rt-calc') !== null, 'parses with .rt-calc present');
  ok(dom.window.document.querySelectorAll('#rt-step-1, #rt-step-2, #rt-step-3').length === 3,
     'all three step sections present');
  const ids = [...dom.window.document.querySelectorAll('[id]')].map(e => e.id);
  ok(new Set(ids).size === ids.length, 'no duplicate element IDs',
     ids.filter((v, i) => ids.indexOf(v) !== i));

  /* ================= 8. It actually runs ================= */
  console.log('\n8. Functional check (the build really works)');
  const runDom = new JSDOM(single, { runScripts: 'dangerously', pretendToBeVisual: true });
  runDom.window.console.log = () => {};
  runDom.window.console.groupCollapsed = () => {};
  runDom.window.console.groupEnd = () => {};
  runDom.window.HTMLElement.prototype.scrollIntoView = function () {};
  await new Promise(res => {
    if (runDom.window.document.readyState === 'complete') return res();
    runDom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));

  const w = runDom.window, d = w.document;
  const RT = w.RT_Calculator;
  ok(typeof RT === 'object', 'RT_Calculator boots from the inlined script');
  ok(RT.version === '0.12.0', 'version 0.12.0', RT.version);
  ok(RT.getState().budget === 1000 && RT.getState().currency === 'USD',
     'default state correct', RT.getState());

  const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
  const h = d.querySelector('#rt-height'); h.value = '178'; fire(h, 'change');
  const hrs = d.querySelector('#rt-hours'); hrs.value = '6to8'; fire(hrs, 'change');
  const wk = d.querySelector('#rt-work'); wk.value = 'design'; fire(wk, 'change');
  ok(d.querySelector('#rt-calculate').disabled === false, 'Calculate unlocks after a full profile');

  d.querySelector('#rt-calculate').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(d.querySelector('#rt-step-3').hasAttribute('hidden') === false, 'Step 3 reveals');
  ok(/For a designer/.test(d.querySelector('#rt-aeo-answer-text').textContent),
     'personalised answer rendered');
  ok(d.querySelectorAll('#rt-product-list .rt-product').length === 3,
     'three product cards rendered');

  const gbp = d.querySelector('#rt-cur-gbp');
  gbp.checked = true; d.querySelector('#rt-cur-usd').checked = false; fire(gbp, 'change');
  ok(d.querySelector('#rt-product-list .rt-product__price').textContent.startsWith('£'),
     'currency switch works in the build');

  /* ================= 8b. Boot marker + link literals ================= */
  console.log('\n8b. Live-site safety');

  // The console marker has to be the first thing the script does, so a boot
  // failure is unambiguous in the browser console.
  const bootLog = inlineJs.indexOf('console.log("Calculator Loaded")');
  ok(bootLog !== -1, 'the script logs the "Calculator Loaded" boot marker');
  ok(bootLog < inlineJs.indexOf('var RT_AFFILIATE_LINKS'),
     'the marker runs before the affiliate database is read',
     [bootLog, inlineJs.indexOf('var RT_AFFILIATE_LINKS')]);
  ok(inlineJs.indexOf('"use strict"') < bootLog,
     'strict mode is still the first statement in the IIFE');

  // init() is wrapped, so a half-pasted block cannot leave a silent dead page.
  ok(/function boot\(\)\s*\{[\s\S]*?try\s*\{\s*init\(\);/.test(inlineJs),
     'init() is called from a try/catch boot wrapper');
  ok(/console\.error\("\[RT\] Calculator could not start:"/.test(inlineJs),
     'a failed boot is reported in the console');

  // Every link literal must be a parseable absolute https URL, which is the
  // exact class of typo that kills the whole script.
  const linkLiterals = [...inlineJs.matchAll(/link:\s*"([^"]*)"/g)].map(m => m[1]);
  ok(linkLiterals.length === 9, 'nine link literals in the build', linkLiterals.length);
  const badLinks = linkLiterals.filter(u => {
    try { const parsed = new URL(u); return parsed.protocol !== 'https:'; }
    catch (e) { return true; }
  });
  ok(badLinks.length === 0, 'every link literal parses as an absolute https URL', badLinks);

  /* ================= 9. No drift ================= */
  console.log('\n9. Reproducible build (no drift)');
  const before = fs.readFileSync(SINGLE);
  execFileSync('python3', [ROOT + 'tools/build-single-file.py'], { stdio: 'pipe' });
  const after = fs.readFileSync(SINGLE);
  ok(before.equals(after), 'rebuilding produces a byte-identical artefact');

  /* ================= 10. Docs are usable ================= */
  console.log('\n10. Documentation');
  const php = fs.readFileSync(PHP, 'utf8');
  ok(/wp_enqueue_style/.test(php) && /wp_enqueue_script/.test(php),
     'PHP snippet shows both enqueues');
  ok(/array\( 'rt-tokens' \)/.test(php), 'rt-calc declares its rt-tokens dependency');
  ok(/add_shortcode/.test(php), 'PHP snippet registers a shortcode');
  ok(/demo-page\.css/.test(php), 'PHP snippet warns about the demo stylesheet');

  const guide = fs.readFileSync(GUIDE, 'utf8');
  const guideRows = (guide.match(/^\| `RT_AFFILIATE_LINKS\.\w+\.\w+\.link`/gm) || []).length;
  ok(guideRows === 9, 'guide lists all 9 affiliate slots', guideRows);
  ['chair', 'desk', 'monitor'].forEach(cat => {
    ok(guide.includes(`${cat}.budget.link`), `guide covers ${cat} slots`);
  });
  ok(/example\.com/.test(guide), 'guide covers the canonical placeholder');
  ok(/another publisher's tag|another associate/i.test(guide),
     'guide warns not to reuse someone else\'s tracking tag');
  ok(/line \d+/.test(guide), 'guide gives line numbers');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
