/**
 * tests/seo.test.js — SEO, static fallbacks, methodology, WordPress readiness
 * ---------------------------------------------------------------------------
 * Validates the machine-readable surface of index.html:
 *   • JSON-LD parses and satisfies the schema.org properties Google requires
 *   • the AEO answer is real, crawlable content before JS runs
 *   • the methodology / E-E-A-T section exists outside the widget
 *   • the WordPress embed guide is present and the assets stay separate
 *
 *   npm i --no-save jsdom
 *   node tests/seo.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + '/';
const HTML = fs.readFileSync(ROOT + 'index.html', 'utf8');
const JS = fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

/* Parse the document WITHOUT running scripts, like a crawler that has no JS. */
const staticDom = new JSDOM(HTML, { runScripts: 'outside-only' });
const staticDoc = staticDom.window.document;

(async function main() {

  /* ================= 1. JSON-LD validity ================= */
  console.log('\n1. JSON-LD blocks parse');
  const ldNodes = [...staticDoc.querySelectorAll('script[type="application/ld+json"]')];
  ok(ldNodes.length === 2, 'exactly two JSON-LD blocks', ldNodes.length);

  let graphs = [];
  let allParse = true;
  ldNodes.forEach(node => {
    try { graphs.push(JSON.parse(node.textContent)); }
    catch (e) { allParse = false; }
  });
  ok(allParse, 'both blocks contain valid JSON');
  ok(graphs.every(g => g['@context'] === 'https://schema.org'),
     'every block declares the schema.org context',
     graphs.map(g => g['@context']));
  const types = graphs.map(g => g['@type']);
  ok(types.includes('SoftwareApplication'), 'SoftwareApplication present', types);
  ok(types.includes('FAQPage'), 'FAQPage present', types);

  console.log('\n2. SoftwareApplication properties');
  const app = graphs.find(g => g['@type'] === 'SoftwareApplication');
  ok(app.name === 'Smart Ergonomic Budget Calculator',
     'name is exactly "Smart Ergonomic Budget Calculator"', app.name);
  ok(typeof app.description === 'string' && app.description.length > 60,
     'has a substantive description', (app.description || '').length);
  ok(typeof app.operatingSystem === 'string' && app.operatingSystem.length > 0,
     'operatingSystem declared', app.operatingSystem);
  ok(typeof app.applicationCategory === 'string' && app.applicationCategory.length > 0,
     'applicationCategory declared', app.applicationCategory);
  ok(app.offers && app.offers['@type'] === 'Offer',
     'offers is an Offer node', app.offers);
  ok(app.offers && String(app.offers.price) === '0',
     'offers.price is the string "0" (schema.org expects text)', app.offers && app.offers.price);
  ok(app.offers && app.offers.priceCurrency === 'USD',
     'offers.priceCurrency present', app.offers && app.offers.priceCurrency);
  ok(app.isAccessibleForFree === true, 'isAccessibleForFree is true');
  ok(Array.isArray(app.featureList) && app.featureList.length >= 3,
     'featureList lists the capabilities', app.featureList && app.featureList.length);

  console.log('\n3. FAQPage properties');
  const faq = graphs.find(g => g['@type'] === 'FAQPage');
  const questions = (faq.mainEntity || []);
  ok(Array.isArray(questions) && questions.length === 3, 'three questions', questions.length);
  ok(questions.every(q => q['@type'] === 'Question'), 'every entity is a Question');
  ok(questions.every(q => typeof q.name === 'string' && q.name.trim().endsWith('?')),
     'every question is a real interrogative', questions.map(q => q.name));
  ok(questions.every(q => q.acceptedAnswer && q.acceptedAnswer['@type'] === 'Answer'),
     'every question has an acceptedAnswer of @type Answer');
  ok(questions.every(q => q.acceptedAnswer.text.length > 120),
     'answers are substantive (>120 chars)',
     questions.map(q => q.acceptedAnswer.text.length));
  ok(questions.every(q => !/[<>]/.test(q.acceptedAnswer.text)),
     'answers contain no markup that would break the JSON-LD');

  const asked = questions.map(q => q.name).join(' | ');
  ok(/budget for an ergonomic setup/i.test(asked), 'covers the budget question', asked);
  ok(/Ergo Budget Ratio/i.test(asked), 'covers the Ergo Budget Ratio question', asked);
  ok(/chair or a desk/i.test(asked), 'covers chair-vs-desk prioritisation', asked);

  console.log('\n3b. Answers agree with the implementation');
  const ratios = questions.find(q => /Ergo Budget Ratio/i.test(q.name)).acceptedAnswer.text;
  ['35', '25', '20', '10', '5'].forEach(pct => {
    ok(new RegExp('\\b' + pct + ' percent').test(ratios), `answer cites the ${pct}% baseline`);
  });
  ok(/lower back/i.test(ratios) && /monitor/.test(ratios) && /keyboard/.test(ratios),
     'answer describes the pain-point modifiers');
  ok(/1 percent/.test(ratios), 'answer states the 1% floor');
  const budgetAnswer = questions.find(q => /budget for an ergonomic/i.test(q.name)).acceptedAnswer.text;
  const RT_STATIC = { usd: [200, 5000], gbp: [150, 4000], cad: [250, 6500] };
  ok(/200 to 5,000/.test(budgetAnswer), 'answer quotes the real USD slider range');
  ok(/150 to 4,000/.test(budgetAnswer) && /250 to 6,500/.test(budgetAnswer),
     'answer quotes the real GBP and CAD ranges');
  const chairAnswer = questions.find(q => /chair or a desk/i.test(q.name)).acceptedAnswer.text;
  ok(/35 percent/.test(chairAnswer) && /25 percent/.test(chairAnswer),
     'chair/desk answer cites 35% vs 25%', chairAnswer.slice(0, 80));

  /* ================= 4. Static AEO fallback ================= */
  console.log('\n4. Static AEO fallback (no JavaScript)');
  const aeo = staticDoc.querySelector('#rt-aeo-answer-text');
  ok(aeo !== null, 'answer paragraph exists in the raw HTML');
  const staticText = aeo.textContent.replace(/\s+/g, ' ').trim();
  ok(staticText.length > 150, 'static paragraph has real content', staticText.length);
  ok(/35%/.test(staticText) && /25%/.test(staticText) && /20%/.test(staticText),
     'static copy carries the 35/25/20 guidance', staticText.slice(0, 90));
  ok(/ergonomic chair/i.test(staticText) && /desk/i.test(staticText) && /monitor/i.test(staticText),
     'static copy names the key categories (keywords)');
  ok(/Complete your profile/i.test(staticText),
     'static copy tells the reader what to do next');
  ok(!/\$\d/.test(staticText),
     'static copy quotes no invented personal budget', staticText.match(/\$[\d,]+/));
  ok(aeo.hasAttribute('data-aeo-answer'), 'paragraph keeps its machine-readable hook');

  /* ================= 5. Methodology / E-E-A-T ================= */
  console.log('\n5. Methodology section');
  const method = staticDoc.querySelector('#rt-methodology');
  ok(method !== null, 'methodology section exists');
  ok(method.classList.contains('rt-methodology'), 'section is namespaced');
  ok(!method.closest('.rt-calc'), 'methodology sits OUTSIDE .rt-calc');
  const h2 = method.querySelector('h2');
  ok(h2 && /How We Calculate Your Budget/i.test(h2.textContent),
     'heading "How We Calculate Your Budget"', h2 && h2.textContent.trim());
  const methodText = method.textContent.replace(/\s+/g, ' ');
  ok(/OSHA/i.test(methodText), 'references OSHA');
  ok(/ISO 9241-5/.test(methodText), 'references ISO 9241-5');
  ok(/ANSI\/HFES 100/.test(methodText), 'references ANSI/HFES 100');
  ok(/not\s+certified|not medical advice/i.test(methodText),
     'states it is not certified to those standards');
  ok(method.querySelectorAll('h3').length >= 4, 'has structured sub-headings',
     method.querySelectorAll('h3').length);
  ok(/Medical disclaimer/i.test(methodText), 'includes a medical disclaimer');
  ok(/Affiliate disclosure/i.test(methodText), 'includes an affiliate disclosure');
  ok(/Amazon Associate/i.test(methodText), 'affiliate disclosure names Amazon Associates');
  ok(/water-filling/i.test(methodText), 'documents the renormalisation method');
  ok(/365/.test(methodText) && /0\.41/.test(methodText) && /0\.63/.test(methodText),
     'documents the CPCH and anthropometric constants');

  console.log('\n5b. Methodology claims match the shipped code');
  ok(/chair 35%/.test(methodText) && /desk 25%/.test(methodText),
     'documented baseline matches ALLOCATION_BASE');
  ok(/No category may fall below\s+1%/.test(methodText), 'documents the 1% floor');
  ['0.35', '0.25', '0.2', '0.1'].forEach(v => {
    ok(JS.includes(v), `code contains the documented ratio ${v}`);
  });
  ok(JS.includes('CHAIR_RISK_TIERS') && JS.includes('150') && JS.includes('400'),
     'code contains the documented chair tiers');

  /* ================= 6. Head metadata ================= */
  console.log('\n6. Head metadata');
  const title = staticDoc.title;
  ok(/Ergonomic Budget Calculator/i.test(title), 'title names the tool', title);
  const desc = staticDoc.querySelector('meta[name="description"]');
  ok(desc && desc.content.length > 100, 'meta description is substantive',
     desc && desc.content.length);
  ok(/ergonomic/i.test(desc.content), 'meta description contains the primary keyword');
  ok(staticDoc.querySelector('meta[name="robots"]') !== null, 'robots meta present');
  const canonical = staticDoc.querySelector('link[rel="canonical"]');
  ok(canonical !== null, 'canonical link present');
  ok(/example\.com/.test(canonical.getAttribute('href')),
     'canonical is a clearly-marked placeholder to replace', canonical.getAttribute('href'));
  ok(staticDoc.querySelector('html').getAttribute('lang') === 'en', 'html lang declared');

  /* ================= 7. WordPress readiness ================= */
  console.log('\n7. WordPress readiness');
  ok(/METHOD 1/.test(HTML) && /METHOD 2/.test(HTML) && /METHOD 3/.test(HTML),
     'embed guide documents three methods');
  ok(/wp_enqueue_style/.test(HTML) && /wp_enqueue_script/.test(HTML),
     'guide shows the enqueue pattern');
  ok(/add_shortcode/.test(HTML), 'guide shows shortcode registration');
  ok(/demo-page\.css is a PREVIEW HARNESS ONLY/.test(HTML),
     'guide warns not to ship the demo stylesheet');

  console.log('\n7b. Assets stay in their own files');
  ok(!/<style[\s>]/.test(HTML.replace(/<!--[\s\S]*?-->/g, '')),
     'no inline <style> blocks in the page');
  const scriptTags = [...staticDoc.querySelectorAll('script')];
  ok(scriptTags.length === 3, 'only the JSON-LD blocks and one external script',
     scriptTags.map(s => s.type || 'js'));
  ok(scriptTags.filter(s => s.type !== 'application/ld+json').length === 1,
     'exactly one behavioural script tag');
  ok(scriptTags.some(s => s.getAttribute('src') === 'assets/js/rt-calc.js'),
     'behaviour loads from assets/js/rt-calc.js');
  ok(/assets\/css\/rt-tokens\.css/.test(HTML) && /assets\/css\/rt-calc\.css/.test(HTML),
     'both stylesheets linked as files');
  const jsText = JS;
  ok(!/style\.(backgroundColor|color)\s*=/.test(jsText),
     'JS never sets raw colours (CSS owns presentation)');

  /* ================= 8. Behaviour preserved with JS ================= */
  console.log('\n8. JS still works alongside the SEO changes');
  const dom = new JSDOM(
    HTML.replace('<script src="assets/js/rt-calc.js" defer></script>',
                 '<script>' + JS + '</script>'),
    { runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.console.log = () => {};
  dom.window.console.groupCollapsed = () => {};
  dom.window.console.groupEnd = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  await new Promise(res => {
    if (dom.window.document.readyState === 'complete') return res();
    dom.window.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 0));

  const w = dom.window, d = w.document;
  const RT = w.RT_Calculator;
  ok(typeof RT === 'object', 'widget initialises with JSON-LD present');

  const before = d.querySelector('#rt-aeo-answer-text').textContent;
  ok(/Complete your profile/i.test(before),
     'static fallback survives initialisation (not wiped on boot)');

  const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
  const h = d.querySelector('#rt-height'); h.value = '178'; fire(h, 'change');
  const hrs = d.querySelector('#rt-hours'); hrs.value = '6to8'; fire(hrs, 'change');
  const wk = d.querySelector('#rt-work'); wk.value = 'design'; fire(wk, 'change');
  const stillStatic = d.querySelector('#rt-aeo-answer-text').textContent;
  ok(/Complete your profile/i.test(stillStatic),
     'fallback also survives Step 1 input changes (no plan generated yet)');

  d.querySelector('#rt-calculate').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const after = d.querySelector('#rt-aeo-answer-text').textContent;
  ok(/For a designer/.test(after), 'clicking Calculate personalises the answer',
     after.slice(0, 60));
  ok(!/Complete your profile/i.test(after), 'fallback text is replaced after calculating');

  console.log('\n8b. Accessible structure of new content');
  ok(method.querySelector('h2') && method.getAttribute('aria-labelledby') === 'rt-methodology-title',
     'methodology section is labelled by its heading');
  ok(method.querySelectorAll('article').length >= 4, 'methodology cards use <article>',
     method.querySelectorAll('article').length);
  ok(d.querySelector('#rt-methodology') !== null, 'methodology present in the booted DOM');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} \u2014 ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
