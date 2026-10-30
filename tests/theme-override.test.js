/**
 * tests/theme-override.test.js: dark-mode hardening against host themes
 * ---------------------------------------------------------------------------
 * The widget is live on a GeneratePress site where the theme's global
 * `input` / `select` rules beat the plugin's class-only styles: dark text on a
 * dark dropdown, and a white box around the budget number.
 *
 * This suite locks down the fixes so a future refactor cannot quietly remove
 * the one thing that makes them work (the `!important` flags), and so the
 * override layer cannot stop being scoped to .rt-calc.
 *
 *   npm i --no-save jsdom
 *   node tests/theme-override.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const TOKENS = ROOT + 'assets/css/rt-tokens.css';
const CALC = ROOT + 'assets/css/rt-calc.css';
const SINGLE = ROOT + 'wordpress/single-file.html';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  \u2713', label); }
  else { fail++; console.log('  \u2717', label, JSON.stringify(extra)); }
};

/* ---------------------------------------------------------------------------
   1. Tiny CSS readers
   ------------------------------------------------------------------------ */

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Paren-aware split so `:has(option[value=""]:checked)` stays one selector. */
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

/**
 * Walk top-level rules. At-rules are flattened: their inner rules are returned
 * with `atRule` set, so `@media (prefers-reduced-motion)` content is still
 * visible to the assertions.
 */
const parseRules = css => {
  const rules = [];
  const walk = (source, atRule) => {
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf('{', i);
      if (open === -1) break;
      const prelude = source.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}') depth--;
        j++;
      }
      const body = source.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) {
        if (!prelude.startsWith('@font-face')) walk(body, prelude);
      } else if (prelude) {
        rules.push({ selector: prelude, body, atRule: atRule || null });
      }
      i = j;
    }
  };
  walk(css, null);
  return rules;
};

/** Parse `prop: value` pairs, keeping track of `!important`. */
const parseDecls = body => {
  const decls = {};
  body.split(';').forEach(chunk => {
    const idx = chunk.indexOf(':');
    if (idx === -1) return;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    let value = chunk.slice(idx + 1).trim();
    if (!prop) return;
    const important = /!\s*important/i.test(value);
    if (important) value = value.replace(/\s*!\s*important\s*$/i, '').trim();
    decls[prop] = { value, important };
  });
  return decls;
};

/** Class / attribute / element counts, for a rough specificity comparison. */
const specificity = sel => {
  const cleaned = sel.replace(/:has\([^)]*\)/g, ' :has').replace(/::?[a-z-]+(\([^)]*\))?/gi, ' ');
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes = (sel.match(/\.[\w-]+/g) || []).length +
                  (sel.match(/\[[^\]]+\]/g) || []).length +
                  (sel.match(/:[\w-]+/g) || []).length;
  const elements = (cleaned.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return ids * 100 + classes * 10 + elements;
};

/* Composite an rgba() colour over an opaque one, so a 0.62-alpha border can be
   contrast-checked as the solid colour a viewer actually sees. */
const composite = (rgba, hexBg) => {
  const parts = rgba.match(/rgba?\(([^)]+)\)/);
  if (!parts) return rgba;
  const [r, g, b, a = 1] = parts[1].split(',').map(v => parseFloat(v));
  const bgHex = hexBg.replace('#', '');
  const bg = [0, 2, 4].map(i => parseInt(bgHex.slice(i, i + 2), 16));
  return '#' + [r, g, b].map((c, i) => Math.round(a * c + (1 - a) * bg[i])
    .toString(16).padStart(2, '0')).join('');
};

/* WCAG relative luminance + contrast ratio, for the copy that worries users. */
const luminance = hex => {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255
    .valueOf())
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ---------------------------------------------------------------------------
   2. Read the sources
   ------------------------------------------------------------------------ */

const tokensRaw = fs.readFileSync(TOKENS, 'utf8');
const calcRaw = fs.readFileSync(CALC, 'utf8');
const tokensCss = stripComments(tokensRaw);
const calcCss = stripComments(calcRaw);

const tokenRules = parseRules(tokensCss);
const tokenRoot = tokenRules.find(r => /\.rt-calc/.test(r.selector));
const tokenDecls = parseDecls(tokenRoot.body);

/** Follow one level of `var(--x)` so resolved colours can be contrast-checked. */
const resolve = name => {
  let value = tokenDecls[name] && tokenDecls[name].value;
  const ref = value && value.match(/^var\((--[\w-]+)\)$/);
  if (ref) value = tokenDecls[ref[1]] && tokenDecls[ref[1]].value;
  return value;
};

/* The override layer starts at section 14; everything after it is in scope. */
const SECTION = '14. THEME OVERRIDE HARDENING';
const sectionStart = calcRaw.indexOf(SECTION);
/* Rewind to the opening `/*` so the banner comment stays a comment once the
   slice is stripped; otherwise its prose would parse as a selector. */
const bannerStart = sectionStart === -1 ? -1 : calcRaw.lastIndexOf('/*', sectionStart);
const overrideRaw = sectionStart === -1 ? ''
  : calcRaw.slice(bannerStart === -1 ? sectionStart : bannerStart);
const overrideCss = stripComments(overrideRaw);
const overrideRules = parseRules(overrideCss);

/* Selector lists are split so `.a, .b { }` can be matched per selector. */
const flatRules = [];
overrideRules.forEach(r => {
  splitSelectors(r.selector).forEach(part => {
    flatRules.push({ selector: part, body: r.body, atRule: r.atRule });
  });
});

const findRule = (re, atRule) =>
  flatRules.find(r => re.test(r.selector) &&
    (atRule === undefined || (atRule === null ? r.atRule === null : r.atRule && r.atRule.includes(atRule))));

const allDecls = selRe => {
  const merged = {};
  flatRules.filter(r => selRe.test(r.selector)).forEach(r => {
    Object.assign(merged, parseDecls(r.body));
  });
  return merged;
};

/* ---------------------------------------------------------------------------
   3. Assertions
   ------------------------------------------------------------------------ */

(async () => {
  console.log('1. Field tokens');

  ok(tokenRoot !== undefined, 'tokens live on .rt-calc, .rt-methodology');
  ok(!/:root/.test(tokensCss), 'tokens never touch :root');

  const fieldTokens = [
    '--rt-field-bg', '--rt-field-text', '--rt-field-border',
    '--rt-field-border-hover', '--rt-field-placeholder',
    '--rt-field-option-bg', '--rt-focus-ring'
  ];
  fieldTokens.forEach(name => {
    ok(Boolean(tokenDecls[name]), `token ${name} is declared`, name);
  });

  ok(tokenDecls['--rt-field-bg'] &&
     /^var\(--[\w-]+\)$/.test(tokenDecls['--rt-field-bg'].value),
     'field background reuses a dark surface token, not a literal',
     resolve('--rt-field-bg'));
  ok(luminance(resolve('--rt-field-bg')) < 0.06,
     'the field surface is genuinely dark',
     luminance(resolve('--rt-field-bg')).toFixed(4));
  ok(contrast(resolve('--rt-field-bg'), resolve('--rt-surface')) >= 1.15,
     'the field reads as a well inside the card, not a flat patch',
     contrast(resolve('--rt-field-bg'), resolve('--rt-surface')).toFixed(2));
  ok(/^#ffffff$/i.test(resolve('--rt-field-text') || ''),
     'field text is pure white', resolve('--rt-field-text'));
  ok(/^#94a3b8$/i.test(resolve('--rt-field-placeholder') || ''),
     'placeholder is the readable light grey #94a3b8',
     resolve('--rt-field-placeholder'));

  console.log('\n1b. Contrast ratios (WCAG)');
  const bg = resolve('--rt-field-bg');
  const whiteRatio = contrast(resolve('--rt-field-text'), bg);
  const placeholderRatio = contrast(resolve('--rt-field-placeholder'), bg);
  ok(whiteRatio >= 7, 'white on the field surface is AAA (>= 7:1)',
     whiteRatio.toFixed(2));
  ok(placeholderRatio >= 4.5, 'placeholder grey is AA (>= 4.5:1)',
     placeholderRatio.toFixed(2));
  ok(contrast(resolve('--rt-text'), bg) >= 4.5,
     'body text token also passes AA on the field surface',
     contrast(resolve('--rt-text'), bg).toFixed(2));

  /* A border is non-text UI, so WCAG 1.4.11 asks for 3:1 against the surface. */
  const borderColour = composite(tokenDecls['--rt-field-border'].value, bg);
  ok(contrast(borderColour, bg) >= 3,
     'field border is visible at 3:1 or better',
     [borderColour, contrast(borderColour, bg).toFixed(2)]);
  const hoverBorder = composite(tokenDecls['--rt-field-border-hover'].value, bg);
  ok(contrast(hoverBorder, bg) > contrast(borderColour, bg),
     'hover border is stronger than the resting border',
     contrast(hoverBorder, bg).toFixed(2));
  ok(contrast(borderColour, bg) <= 6,
     'border stays a border, not a second text colour',
     contrast(borderColour, bg).toFixed(2));

  console.log('\n2. The override layer exists and wins on order');
  ok(sectionStart !== -1, 'section 14 is present in rt-calc.css');
  ok(calcRaw.lastIndexOf('13.') < sectionStart, 'section 14 comes after section 13');
  ok(overrideRules.length >= 12, 'the layer contains real rules',
     overrideRules.length);

  /* Every selector in the layer must be namespaced: that is the promise that a
     theme override here cannot leak into the rest of the page. */
  const leaked = [];
  overrideRules.forEach(r => splitSelectors(r.selector).forEach(part => {
    if (!part.startsWith('.rt-')) leaked.push(part);
  }));
  ok(leaked.length === 0, 'every override selector starts with .rt-', leaked.slice(0, 5));
  ok(!/(^|[},\s])(body|html)\s*[{,]/i.test(overrideCss),
     'no body or html selectors');
  ok(!/:root/.test(overrideCss), 'no :root declarations');
  ok(!/#rt-budget-amount\b/.test(overrideCss),
     'the budget input is reached by class, not by ID');

  overrideRules.forEach(r => splitSelectors(r.selector).forEach(part => {
    ok(specificity(part) >= 20, `selector outranks a bare element rule: ${part}`,
       specificity(part));
  }));

  console.log('\n2b. Specificity beats a theme that also uses !important');
  const wrapperSelect = findRule(/^\.rt-calc \.rt-select-wrap \.rt-select$/);
  const wrapperInput = findRule(/^\.rt-calc \.rt-input-group \.rt-input$/);
  ok(Boolean(wrapperSelect), 'a three-part select selector exists');
  ok(Boolean(wrapperInput), 'a three-part input selector exists');
  [wrapperSelect, wrapperInput].forEach(rule => {
    if (!rule) return;
    const decls = parseDecls(rule.body);
    ['background-color', 'color', 'border', 'opacity'].forEach(prop => {
      ok(decls[prop] && decls[prop].important,
         `${rule.selector} forces ${prop}`, decls[prop]);
    });
    ok(specificity(rule.selector) >= 30,
       `${rule.selector} outranks a two-class theme rule`,
       specificity(rule.selector));
  });
  const wrapperFocus = findRule(/^\.rt-calc \.rt-input-group \.rt-input:focus$/);
  ok(Boolean(wrapperFocus), 'the wrapper focus rule exists');
  ok(wrapperFocus && parseDecls(wrapperFocus.body)['box-shadow'].important,
     'the wrapper focus rule repaints the ring');

  console.log('\n3. Select dropdowns');

  const selectBase = allDecls(/^\.rt-calc \.rt-select$/);
  const mustWin = [
    'background-color', 'background-image', 'color', '-webkit-text-fill-color',
    'border', 'border-radius', 'box-shadow', 'opacity', 'outline',
    'text-shadow', 'filter', 'color-scheme', 'caret-color',
    'box-sizing', 'padding', 'font-family', 'font-size',
    '-webkit-appearance', 'appearance'
  ];
  mustWin.forEach(prop => {
    ok(selectBase[prop] && selectBase[prop].important,
       `.rt-select forces ${prop} with !important`,
       selectBase[prop]);
  });

  ok(/var\(--rt-field-bg\)/.test(selectBase['background-color'].value),
     'select background reads the dark field token',
     selectBase['background-color'].value);
  ok(/var\(--rt-field-text\)/.test(selectBase.color.value),
     'select text reads the white field token', selectBase.color.value);
  ok(/var\(--rt-field-border\)/.test(selectBase.border.value),
     'select keeps a visible border', selectBase.border.value);
  ok(/none/.test(selectBase['background-image'].value),
     'theme gradient or arrow image is removed',
     selectBase['background-image'].value);

  const selectHover = findRule(/^\.rt-calc \.rt-select:hover$/);
  ok(selectHover && parseDecls(selectHover.body)['border-color'].important,
     'hover border change also uses !important');

  console.log('\n3b. Placeholder option inside the select');
  const selectPlaceholder = findRule(/\.rt-select:has\(option\[value=""\]:checked\)/);
  ok(Boolean(selectPlaceholder), 'empty-state select rule exists');
  const ph = selectPlaceholder ? parseDecls(selectPlaceholder.body) : {};
  ok(ph.color && ph.color.important &&
     /var\(--rt-field-placeholder\)/.test(ph.color.value),
     'unselected select reads as a light grey placeholder', ph.color);
  ok(ph['-webkit-text-fill-color'] && ph['-webkit-text-fill-color'].important,
     'the placeholder fix also sets -webkit-text-fill-color');

  console.log('\n3c. Open dropdown list (<option>)');
  const optionRule = findRule(/^\.rt-calc \.rt-select option(,| \.rt-select optgroup)?$|\.rt-select optgroup/);
  ok(Boolean(optionRule), 'option rule exists');
  const opt = optionRule ? parseDecls(optionRule.body) : {};
  ok(opt['background-color'] && opt['background-color'].important &&
     /var\(--rt-field-option-bg\)/.test(opt['background-color'].value),
     'option background is dark and forced', opt['background-color']);
  ok(opt.color && opt.color.important &&
     /var\(--rt-field-text\)/.test(opt.color.value),
     'option text is white and forced', opt.color);
  ok(opt['-webkit-text-fill-color'] && opt['-webkit-text-fill-color'].important,
     'option text survives WebKit');
  ok(contrast(resolve('--rt-field-text'), resolve('--rt-field-option-bg')) >= 7,
     'option list contrast is AAA',
     contrast(resolve('--rt-field-text'), resolve('--rt-field-option-bg')).toFixed(2));

  const checked = findRule(/option:checked:not\(:disabled\)/);
  ok(checked && parseDecls(checked.body)['background-color'].important,
     'the selected option is highlighted with the accent');
  ok(Boolean(checked), 'the highlight skips the disabled prompt option');
  ok(contrast(resolve('--rt-field-text'), resolve('--rt-field-option-checked')) >= 4.5,
     'white on the highlighted option passes AA',
     contrast(resolve('--rt-field-text'), resolve('--rt-field-option-checked')).toFixed(2));

  const disabledOpt = findRule(/option:disabled/);
  ok(disabledOpt && parseDecls(disabledOpt.body).opacity.important,
     'a disabled prompt option is not faded to invisibility');

  console.log('\n4. Budget number input');

  const inputBase = allDecls(/^\.rt-calc \.rt-input$/);
  ok(inputBase['background-color'] && inputBase['background-color'].important,
     '.rt-input forces its dark background', inputBase['background-color']);
  ok(inputBase.color && inputBase.color.important,
     '.rt-input forces white text', inputBase.color);
  ok(/var\(--rt-field-bg\)/.test(inputBase['background-color'].value),
     'input background reads the field token');
  ok(/none/.test(inputBase['box-shadow'].value),
     'theme inner shadow is cleared', inputBase['box-shadow'].value);

  ['padding', 'font-family', 'font-size', 'text-align'].forEach(prop => {
    ok(inputBase[prop] && inputBase[prop].important,
       `.rt-input forces ${prop} with !important`, inputBase[prop]);
  });
  /* The wrapper selector appears twice: once in the shared chrome rule and once
     as the padding guard. Search for the declaration, not the first match. */
  const groupPad = flatRules
    .filter(r => r.selector === '.rt-calc .rt-input-group .rt-input')
    .map(r => parseDecls(r.body)['padding-left'])
    .find(Boolean);
  ok(groupPad && /2\.6rem/.test(groupPad.value) && groupPad.important,
     'the currency prefix keeps its left inset', groupPad);

  const autofill = findRule(/-webkit-autofill/);
  ok(Boolean(autofill), 'Chrome autofill override exists');
  const af = autofill ? parseDecls(autofill.body) : {};
  ok(af['-webkit-box-shadow'] && af['-webkit-box-shadow'].important &&
     /1000px/.test(af['-webkit-box-shadow'].value) &&
     /var\(--rt-field-bg\)/.test(af['-webkit-box-shadow'].value),
     'autofill is repainted with the dark field colour',
     af['-webkit-box-shadow']);

  console.log('\n4b. Placeholders');
  const placeholderRule = findRule(/\.rt-input::placeholder/);
  ok(Boolean(placeholderRule), '::placeholder rule exists');
  const placeholderDecls = placeholderRule ? parseDecls(placeholderRule.body) : {};
  ok(placeholderDecls.color && placeholderDecls.color.important &&
     /var\(--rt-field-placeholder\)/.test(placeholderDecls.color.value),
     'placeholder colour is forced', placeholderDecls.color);
  ok(placeholderDecls.opacity && placeholderDecls.opacity.important &&
     /^1$/.test(placeholderDecls.opacity.value),
     'placeholder opacity is restored to 1 (Firefox default is 0.54)');
  ok(findRule(/::-webkit-input-placeholder/), 'WebKit placeholder prefix covered');

  console.log('\n5. Focus states');
  const focusRules = overrideRules.filter(r => /:focus(?!-within|-visible)/.test(r.selector));
  ok(focusRules.length > 0, 'a focus rule exists', focusRules.map(r => r.selector));
  const focusSel = /^\.rt-calc \.rt-(select|input):focus$/;
  const focusDecls = allDecls(focusSel);
  ok(focusDecls['border-color'] && focusDecls['border-color'].important &&
     /var\(--rt-accent\)/.test(focusDecls['border-color'].value),
     'focus border uses the accent colour', focusDecls['border-color']);
  ok(focusDecls['box-shadow'] && focusDecls['box-shadow'].important &&
     /var\(--rt-focus-ring\)/.test(focusDecls['box-shadow'].value),
     'focus paints a ring from the ring token', focusDecls['box-shadow']);
  ok(contrast(composite(tokenDecls['--rt-focus-ring'].value, bg), bg) >= 3,
     'the focus ring itself clears 3:1 on the field surface',
     contrast(composite(tokenDecls['--rt-focus-ring'].value, bg), bg).toFixed(2));
  ok(focusDecls.outline && focusDecls.outline.important &&
     /none/.test(focusDecls.outline.value),
     'the native outline is replaced, not left doubled', focusDecls.outline);

  const keyboard = overrideRules.filter(r => /:focus-visible/.test(r.selector));
  ok(keyboard.length > 0, 'keyboard focus gets its own ring', keyboard.map(r => r.selector));

  console.log('\n5b. Reduced motion and disabled');
  const reduced = findRule(/^\.rt-calc \.rt-(select|input)$/, 'prefers-reduced-motion');
  ok(Boolean(reduced), 'reduced-motion block covers the fields');
  const disabledDecls = allDecls(/^\.rt-calc \.rt-(select|input):disabled$/);
  ok(disabledDecls.opacity && disabledDecls.opacity.important,
     'disabled fields keep their contrast');
  ok(/var\(--rt-surface-sunken\)/.test(disabledDecls['background-color'].value),
     'disabled fields use the sunken surface token');

  console.log('\n6. Shipped single file');
  const single = fs.readFileSync(SINGLE, 'utf8');
  ok(single.includes('--rt-field-bg'), 'single file carries the field tokens');
  ok(single.includes('14. THEME OVERRIDE HARDENING'),
     'single file carries the override layer');
  ok(single.includes('.rt-calc .rt-select option'),
     'single file carries the option rule');
  ok(!/:root/.test(stripComments(single.slice(single.indexOf('<style>'),
     single.indexOf('</style>')))), 'single file still never touches :root');

  console.log('\n6b. Cache busting');
  const php = fs.readFileSync(ROOT + 'wordpress/functions-snippet.php', 'utf8');
  const phpVer = (php.match(/\$ver\s*=\s*'([^']+)'/) || [])[1];
  const jsVer = (fs.readFileSync(ROOT + 'assets/js/rt-calc.js', 'utf8')
    .match(/RT_Calculator\.version\s*=\s*"([^"]+)"/) || [])[1];
  ok(phpVer === jsVer, 'the PHP enqueue version matches the JS version',
     [phpVer, jsVer]);
  ok(single.includes(`RT_Calculator.version = "${jsVer}"`),
     'the single file carries the current version', jsVer);

  console.log('\n7. House style');
  ok(!/[\u2014\u2013]/.test(overrideRaw), 'override layer contains no dashes');
  ok(!/[\u2014\u2013]/.test(tokensRaw), 'token file contains no dashes');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
