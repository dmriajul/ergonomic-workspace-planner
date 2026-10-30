# Smart Ergonomic Calculator

A modular, namespaced calculator widget for WordPress. Everything renders inside
`.rt-calc`, so it drops into any theme without inheriting or leaking styles.

**Phase 1:** structure only: HTML skeleton + design tokens.
**Phase 2:** Step 1 UI: budget, ergonomic profile, pain points.
**Phase 3:** Step 1 JavaScript: state, sync, pain exclusivity, height maths.
**Phase 4:** Step 2 engine: Ergo Budget Ratio™, CPCH, Posture Risk.
**Phase 5:** Step 2 UI: allocation bars + metric chips.
**Phase 6:** Step 3: AEO answer box, gear shortlist, affiliate disclosure.
**Phase 7:** SEO: JSON-LD schema, static crawlable fallback,
methodology / E-E-A-T section, and WordPress embed guide.
**Phase 8:** Production packaging: single-file build, enqueue snippet, and the
affiliate replacement guide.
**Phase 9:** Centralised affiliate database at the top of the JS.
**Phase 10 (current):** One link per product (Amazon OneLink): 9 links, not 27.

## Structure

```
.
├── index.html                  # Static preview of the exact markup the plugin renders
├── assets/js/
│   └── rt-calc.js              # Step 1 controller (vanilla, no deps)
├── wordpress/                  # production artefacts
│   ├── single-file.html        #   generated file: markup + CSS + JS in one paste
│   ├── functions-snippet.php   #   recommended way to enqueue CSS/JS separately
│   └── REPLACE-THIS.md         #   all 27 affiliate placeholders + canonical
├── tools/
│   └── build-single-file.py    # regenerates wordpress/single-file.html
├── tests/
│   ├── step1.test.js           # jsdom behavioural suite (98 assertions)
│   ├── step2.test.js           # engine suite + fuzz (100 assertions)
│   ├── step2-ui.test.js        # rendered-UI suite (67 assertions)
│   ├── step3.test.js           # AEO + products + reveal (90 assertions)
│   ├── seo.test.js             # JSON-LD, fallbacks, E-E-A-T (86 assertions)
│   ├── build.test.js           # production artefacts + drift check (67 assertions)
│   └── affiliate.test.js       # link database integrity (48 assertions)
├── assets/css/
│   ├── rt-tokens.css           # Layer 0: design tokens, scoped to .rt-calc
│   ├── rt-calc.css             # Layer 1: scoped reset, shell, step skeleton
│   └── demo-page.css           # Preview harness only (not shipped)
└── README.md
```

## HTML contract

| Element | Purpose |
| --- | --- |
| `.rt-calc` | Namespaced root. All tokens and styles live under it. |
| `#rt-step-1` / `#rt-slot-inputs` | Step 1: ergonomic profiling UI (Phase 2) |
| `#rt-step-2` / `#rt-slot-budget` | Step 2: budget preview (empty mount point) |
| `#rt-step-3` / `#rt-slot-results` | Step 3: results + AEO answer box (empty, `aria-live="polite"`) |

Each `<section>` carries `data-step="1|2|3"`, an `aria-labelledby` pointing at
its heading, and a `.rt-calc__slot` mount point. Slots are flagged
`data-empty="true"` while they hold only their hint; removing that attribute
(or swapping in real markup) collapses the placeholder styling automatically.

## Step 1: Ergonomic Profiling

Lives inside `#rt-slot-inputs` as a single `<form class="rt-inputs">`, split into
three `<fieldset>` blocks so every control is grouped and labelled.

### Total budget
- `input[type=radio][name=rt-currency]`: USD / GBP / CAD, USD `checked` by default,
  presented as a segmented pill control (`.rt-seg`).
- `<output id="rt-budget-display">`: the large amount, `aria-live="polite"`.
- `#rt-budget-range`: `min=200 max=5000 step=50 value=1000`.
- `#rt-budget-amount`: number input, same range/step/initial value, synced by JS later.

Currency glyphs (`$` / `£` / `C$`) are three spans; CSS reveals exactly one via
`:has(#rt-cur-gbp:checked)` etc., so no JS is needed for the toggle.

### Ergonomic profile
`#rt-height` (ft/in **and** cm in each label), `#rt-hours`, `#rt-work`: native
`<select>` elements with a custom chevron, not a JS listbox.

### Pain points
Four `<label class="rt-pain-card">` options, each wrapping a real
`input[type=checkbox][name=rt-pain]` (visually hidden, still focusable):

| Value | Card |
| --- | --- |
| `neck-shoulder` | Neck / Shoulder |
| `lower-back` | Lower Back |
| `wrist-hand` | Wrist / Hand |
| `no-pain` | No Pain (Preventive), which carries `data-exclusive-group="rt-pain"` |

Selected state is pure CSS: `:checked` drives the tick and icon tint, `:has()` adds
the card glow, with `:checked ~` sibling rules as the non-`:has()` fallback.

### Slider paint hook
The controller writes one custom property to paint the track fill:

```js
range.style.setProperty("--rt-range-fill", pct + "%"); // (value - min) / (max - min) * 100
```

It defaults to `16.7%` (value 1000, USD) so the static markup already looks right
before the script runs.

### Responsive behaviour
| Width | Budget control | Dropdowns | Pain cards |
| --- | --- | --- | --- |
| `< 26rem` | Stacked, full-width toggle + number box | 1 column | 1 column |
| `≥ 30rem` | Slider + number box side by side | 1 column | 2 × 2 grid |
| `≥ 44rem` | Slider + number box side by side | 3 columns | 2 × 2 grid |

Touch targets get extra vertical padding under `@media (pointer: coarse)`.

## Step 1 JavaScript: `assets/js/rt-calc.js`

A single IIFE. No dependencies, no globals except the namespace, no `innerHTML`,
no `eval`, and no Step 2/3 vocabulary in the source (asserted by the test suite).

### State

```js
window.RT_Calculator.getState()
// { budget: 1000, currency: "USD", height: null, hours: null, work: null, pains: [] }
```

`getState()` returns a **defensive copy**: mutating it cannot corrupt the widget.

| Key | Type | Notes |
| --- | --- | --- |
| `budget` | number | Always inside the active currency window, snapped to step |
| `currency` | string | `"USD"` \| `"GBP"` \| `"CAD"` |
| `height` | number \| null | **Inches**, because every ergonomic ratio needs inches |
| `hours` | string \| null | Option value: `lt4` \| `4to6` \| `6to8` \| `8plus` |
| `work` | string \| null | Option value: `software-dev` \| `video-editing` \| `design` \| `general-office` |
| `pains` | string[] | Checked pain values, e.g. `["neck-shoulder"]` |

The three profile fields start as `null`, and the markup now starts on a disabled
`Select …` placeholder so the UI cannot show a value the state does not hold.

### Currency windows

| Code | Range | Step | Locale |
| --- | --- | --- | --- |
| USD | 200 to 5,000 | 50 | `en-US` |
| GBP | 150 to 4,000 | 50 | `en-GB` |
| CAD | 250 to 6,500 | 50 | `en-CA` |

Switching currency re-windows the slider **and** the number input, relabels the
scale endpoints, repaints the glyph via `data-currency`, and re-clamps the amount
(5,000 USD → 4,000 GBP). It does **not** convert the value, since inventing
exchange rates is Step 2's problem.

### Budget sync

- Slider `input` → number input, `<output>`, `--rt-range-fill`, `aria-valuetext`.
- Number `input` → slider live, but **only once the typed value is in range**, so
  typing `1` on the way to `1500` never slams the budget to the minimum.
- `change` / `blur` / `Enter` → normalise: clamp, snap to step, rewrite the field.

### Pain exclusivity

Driven by `data-exclusive-group` in the markup, not a hardcoded name: checking the
preventive card clears all symptoms, and checking any symptom clears it.
Unchecking never cascades.

### Height maths (pure functions)

```js
RT_Calculator.calculateErgonomicHeights(68);
// { seatedHeightInches: 27.88, standingHeightInches: 42.84,
//   seatedHeightCm: 70.8, standingHeightCm: 108.8 }
```

`stature × 0.41` (seated elbow height) and `stature × 0.63` (standing elbow height).
Returns `null` for invalid input rather than throwing.

`RT_Calculator.parseHeightToInches(source)` accepts an `<option>`, a label string
(`5'8" (173 cm)`, `173 cm`, `6 ft 0`) or a number, and **prefers feet/inches when
both units appear**: `5'8"` is exactly 68 in, while the label's `173 cm` is a
rounded display of 172.72 cm. Results are `console.log`ged on change until Step 3
renders them.

## Step 2 Engine: `calculateAllocation`, `calculateCPCH`, `calculatePostureRisk`

All pure functions: plain values in, plain objects out, no DOM. They are exposed on
`window.RT_Calculator` and covered by `tests/step2.test.js`.

### Ergo Budget Ratio™

```js
RT_Calculator.calculateAllocation({ pains: ["lower-back"], hours: "6to8", work: "design" });
// { chair: 0.4, desk: 0.27, monitor: 0.2, keyboard: 0.08, lighting: 0.03, cables: 0.02 }
```

Baseline `chair 35 · desk 25 · monitor 20 · keyboard 10 · lighting 5 · cables 5`.
Modifiers are **additive**, so their order is irrelevant:

| Trigger | Effect |
| --- | --- |
| `lower-back` | chair +5, desk +2, keyboard −2, lighting −2, cables −3 |
| `neck-shoulder` | monitor +6, chair +2, desk −3, keyboard −2, cables −3 |
| `wrist-hand` | keyboard +6, desk +1, chair −2, lighting −2, cables −3 |
| `8+` hours | chair +3, desk +2, cables −5 |
| `video-editing` | monitor +6, lighting +2, cables −4, desk −4 |

Then: every line is floored at **1 %** and the set is normalised to **1.0**.

The floor uses **water-filling**, not "clamp then divide": a category pinned at 1 %
is *locked* and the remaining weight is redistributed across the others, repeating
until stable. Naive normalisation would drop the locked category back below 1 %
(e.g. `8+` hours drives cables to 0 %). Verified by a 300-case fuzz test asserting
`sum == 1 ±1e-9` and `value >= 0.01` for every category.

### CPCH: Cost-Per-Comfort-Hour™

```js
RT_Calculator.calculateCPCH(1000, "6-8");     // "$0.08"
RT_Calculator.calculateCPCHValue(1000, "6-8"); // 0.0783…
```

`budget / (hoursPerDay × 365 × 5)`, where hours map `under-4→3, 4-6→5, 6-8→7, 8+→9`.
Returns the state currency's symbol, 2 decimals, or 3 when the figure rounds to
`$0.00`, so a small budget never reads as free. Returns `null` (not `0`) when no
hours are chosen yet.

### Posture Risk

```js
RT_Calculator.calculatePostureRisk(chairAmount, "8+", ["lower-back"]);
// { level: "moderate", label: "🟡 Moderate" }
```

Score = chair tier + hours penalty + 1 per distinct pain (ignoring `no-pain`).

| Chair spend | Points |
| --- | --- |
| `< 150` | 4 |
| `< 250` | 2 |
| `< 400` | 1 |
| `≥ 400` | 0 |

Tiers are **first-match, not cumulative**: a cumulative reading would give a
`$100` chair 4+2+1 = 7 points, double-penalising the same fact three times.
Hours add `0/1/2/3`; pains add 1 each (max 3). Bands: `0 to 2 Low`, `3 to 5 Moderate`,
`6 to 10 High`. `calculatePostureRiskScore()` exposes the breakdown (`chairPoints`,
`hoursPoints`, `painPoints`) so Step 3 can explain a verdict.

### Hours vocabulary

Step 1 emits `lt4 | 4to6 | 6to8 | 8plus`; the Step 2 spec speaks
`under-4 | 4-6 | 6-8 | 8+`. **Both are accepted everywhere**: the aliases live in a
single `HOURS_PROFILE` table, so other modules consume the Step 1 value directly and
never translate. `RT_Calculator.hoursProfile` is exposed for reference.

### Money + aggregation

- `allocateAmounts(budget, allocation)` → whole-currency amounts that sum to the
  budget exactly (rounding drift absorbed on the largest line).
- `computeStep2(snapshot?)` → the whole pipeline as one object
  `{ budget, currency, allocation, amounts, chairAmount, cpch, cpchValue, risk, riskScore }`.
  Pass a state-like object to score a hypothetical without touching the live widget.
- `updateStep2UI()` → logs the block and emits `rt:step2update`. Called once at boot
  and again on every Step 1 change (subscribed to the public events, so Step 1's
  handlers stay unaware of Step 2).

## Step 2 UI: `#rt-slot-budget`

Six allocation rows plus three metric chips. The markup ships with the baseline
values (USD 1,000, 35/25/20/10/5/5) baked in, so the panel is correct before the
script runs and stays readable if it fails to load.

### Allocation rows

| Category | Icon | Hue token |
| --- | --- | --- |
| Chair | 🪑 | `--rt-accent` |
| Desk | 🖥️ | `--rt-info` |
| Monitor | 📺 | `--rt-signal` |
| Keyboard | ⌨️ | `--rt-violet` |
| Lighting | 💡 | `--rt-warn` |
| Cables | 🔌 | `--rt-text-muted` |

Each row: icon, label, track, percentage, amount. Bars animate with
`transition: width 0.4s ease` and are driven by a single custom property:

```css
.rt-alloc__bar { width: var(--rt-alloc, 0%); }
```

JS writes the *exact* ratio (`style.setProperty("--rt-alloc", "35.00%")`) so
sub-1% differences stay visible, while the printed percentage is an integer.

**Percentages are distributed with the largest-remainder method** so the six
labels always total exactly 100%, because rounding each ratio independently gives
`34 + 26 + 20 + 10 + 5 + 5 = 100` today but produces 99 or 101 for neighbouring
states, which reads as a bug. Amounts are rounded the same way (drift absorbed on
the largest line), so the amount column always totals the budget exactly.

### Metric chips

| Chip | Content | Source |
| --- | --- | --- |
| Cost-Per-Comfort-Hour™ | `$0.08/hr` | `calculateCPCH` |
| Posture risk | `🟢 Low` / `🟡 Moderate` / `🔴 High` | `calculatePostureRisk` |
| Setup tier | `🌱 Starter` < 700, `⚖️ Balanced` < 1600, `🚀 Pro` < 3000, `🏆 Studio` ≥ 3000 | `calculateSetupTier` |

Chips carry `data-tone` (`positive` / `caution` / `danger` / `muted` / `neutral`)
so the value colour follows the verdict without hardcoding colours in JS.
Before hours are chosen, CPCH renders the words "Not yet" with the note "Add your
desk hours first", rather than a misleading number.

**3000 is inclusive for Studio.** The spec's `> $3000` would leave exactly 3000
undefined against `< $3000: Pro`; bands are half-open `[min, next)` instead.

### Re-rendering

`updateStep2UI()` now paints the DOM instead of logging (console output is opt-in
via `RT_Calculator.debug = true`). It is called at boot and on every Step 1 event,
so a currency switch reformats every amount, the CPCH and the total in one pass.

### Responsive

| Width | Allocation row | Chips |
| --- | --- | --- |
| `< 22rem` | label + % on one line, bar below, amount on a third line | 1 column |
| `≥ 30rem` | single-line: icon · label · bar · % · amount | 1 column |
| `≥ 44rem` | single-line | 3 columns |

## Step 3: AEO answer box + gear shortlist

Step 3 ships `hidden` and is revealed by the **"Calculate my plan"** button in Step 2
(`#rt-calculate`, `aria-controls="rt-step-3"`). The button stays `disabled` until
height, daily hours and primary work are all set, and its hint names exactly what is
missing. Budget always counts as valid because the slider clamps it.

### AEO answer

`#rt-aeo-answer-text` is a real `<p>` in the DOM (not a canvas, framework render or
JS-built blob), so crawlers and AI answer engines can quote it verbatim. `buildAEOText(state, allocation)`
is a pure function:

> For a software developer working 8+ hours daily with lower back pain, we recommend an
> Ergonomic Desk Setup Budget of $1,200. The Ergo Budget Ratio, built on OSHA standards,
> splits it like this: $496 (41%) to an ergonomic chair, $334 (28%) to a desk, and
> $231 (19%) to a monitor. The other $139 (12%) goes to your keyboard, lighting and
> cables.

Role, hours band, pain phrasing, currency symbol, budget, and every percentage/amount
are calculated from state. The amounts come from `allocateAmounts()`, the same rounding path as the
cards, so the prose and the UI can never disagree. Static default-state copy is baked
into the HTML so the panel is never empty for a non-JS crawler.

### Gear shortlist

`AFFILIATE_PRODUCTS` holds 3 categories × 3 tiers of mock data (chair, desk, monitor).
Tier comes from the **money allocated to that category**, not the total budget:

| Allocated | Tier |
| --- | --- |
| `< 250` | Budget |
| `250 to 700` | Mid |
| `> 700` | Premium |

**700 is inclusive for Mid**, because a single strict `<` would push exactly $700 into
Premium and contradict the stated band.

`renderProducts()` builds cards with `createElement`/`textContent` only, so there is no
`innerHTML`, `insertAdjacentHTML` or `document.write` anywhere in the bundle, so product
names can never inject markup. Each card shows name, price in the active currency
(as a machine-readable `<data value>`), star rating with an `aria-label`, a
`Within your $X allocation` / `Over by $Y` badge, and a **Check price on Amazon**
link using the regional URL for the selected currency (`rel="sponsored nofollow
noopener noreferrer"`, `target="_blank"`). Missing regional links fall back to USD.

### Affiliate disclosure

Sits directly below the cards:

> As an Amazon Associate, Riajul Tech earns from qualifying purchases.

### Reveal + live updates

`calculatePlan()` reveals the section, renders, moves focus to the answer box
(`tabindex="-1"`) for keyboard/screen-reader users, scrolls it into view, and emits
`rt:planready`. After that, any Step 1 change re-renders the answer and cards so the
visible plan never goes stale.

### Before going live

Replace the mock `https://amzn.to/...` links in `AFFILIATE_PRODUCTS` with real tracking
links per region, and confirm the prices/ratings are current. The catalogue is mock data.

### Events (integration points for Steps 2 to 3)

Dispatched on the `.rt-calc` root, bubbling:

| Event | Detail |
| --- | --- |
| `rt:budgetchange` | `{ budget, currency }` |
| `rt:currencychange` | `{ currency, budget }` |
| `rt:painschange` | `{ pains }` |
| `rt:profilechange` | `{ field, value, state }` |
| `rt:heightchange` | `{ inches, metrics }` |
| `rt:step2update` | `{ allocation, amounts, chairAmount, cpch, cpchValue, risk, riskScore, budget, currency, hours, pains }` |
| `rt:planready` | the Step 3 result, fired when the plan is revealed |

```js
document.addEventListener("rt:heightchange", e => console.log(e.detail.metrics));
```

`RT_Calculator.init()` is idempotent and safe to call after AJAX-injected markup
(a WordPress reality), and it is a no-op once `[data-rt-ready]` is set.

### Tests

```bash
npm i --no-save jsdom csstree-validator
node tests/step1.test.js     #  98 assertions
node tests/step2.test.js     # 100 assertions
node tests/step2-ui.test.js  #  67 assertions
node tests/step3.test.js     #  92 assertions
node tests/seo.test.js       #  86 assertions
node tests/build.test.js     #  67 assertions
node tests/affiliate.test.js #  51 assertions
node tests/theme-override.test.js # 145 assertions
```

`step1`: state defaults, slider↔input sync, mid-typing guard, snapping, all three
currency windows, pain exclusivity, height maths and parsing, events, idempotency.

`step2`: baseline + per-modifier arithmetic, floor/normalisation, 300-case fuzz,
pain semantics, money rounding, CPCH in all four hour bands and all three currencies,
every chair-tier boundary, risk bands, `computeStep2` aggregation, and reactive
`rt:step2update` wiring.

`step2-ui`: rendered markup and ARIA, default paint, bar widths, percentage/amount
reconciliation, reactive updates from budget/pain/hours changes, currency reformatting
(£ and C$), tier boundaries, extremes, a 120-case fuzz asserting percentages total 100
and amounts total the budget, and graceful degradation when the panel is absent.

`theme-override`: the Phase 12 hardening layer. It parses both stylesheets and asserts
that every forced property on `.rt-select` / `.rt-input` carries `!important`, that the
open dropdown list and the placeholder states use the dark tokens, that the autofill
repaint is present, that every selector in the layer starts with `.rt-` and outranks a
bare element rule, and it computes WCAG contrast ratios for white text, the placeholder
grey, the field border and the focus ring.

## SEO & crawler readiness

### Structured data

Two JSON-LD blocks in `<head>`:

- **`SoftwareApplication`**: name (`Smart Ergonomic Budget Calculator`), description,
  `operatingSystem`, `applicationCategory: HealthApplication`, `isAccessibleForFree`,
  `featureList`, and `offers` as an `Offer` with `price: "0"` / `priceCurrency: USD`.
  Google's SoftwareApplication rich result requires `name`, `operatingSystem` and one of
  `offers` / `aggregateRating` / `review`, all satisfied.
- **`FAQPage`**: three questions (budget sizing, the Ergo Budget Ratio, chair vs desk),
  each with an `acceptedAnswer` of `@type: Answer`. Answers quote figures that match the
  implementation exactly: 35/25/20/10/5/5 baseline, the 1% floor, and the real slider
  ranges (200 to 5,000 USD, 150 to 4,000 GBP, 250 to 6,500 CAD). `seo.test.js` asserts that match,
  so the copy cannot drift away from the code.

`seo.test.js` parses both blocks and checks every required property, plus that no
`SoftwareApplication` duplicate is introduced elsewhere.

> Note: since 2023 Google limits FAQ *rich results* to authoritative health/government
> sites. The markup remains valid schema.org and is what answer engines read.

### Static fallback (the page works without JavaScript)

`#rt-aeo-answer-text` ships with real, readable advice (the 35/25/20 baseline plus how
pain points shift it) rather than being filled only by JS. It is deliberately **neutral**:
it quotes no invented personal budget, so a crawler never indexes a fake `$1,000` result
as though it were the visitor's.

The fallback is preserved until a visitor actually generates a plan.
`renderStep3UI(result, refs, { personaliseAnswer })` only replaces the paragraph when
`calculatePlan()` runs, so boot and ordinary Step 1 input changes never overwrite
crawlable copy with a "fill in your details" restatement.

### Methodology / E-E-A-T section

`<section class="rt-methodology" id="rt-methodology">` sits **outside** `.rt-calc` (it is
editorial content, not part of the widget) and documents:

- **How We Calculate Your Budget**: the allocation table, every modifier, the 1% floor
  and the share-evening step (renormalisation), all described in plain English.
- **CPCH**: `budget ÷ (hours × 365 × 5)`, with the five-year service-life assumption
  stated.
- **Posture risk**: chair tiers, hour penalties, pain points and the 0 to 2 / 3 to 5 / 6+ bands.
- **Anthropometric reference**: stature × 0.41 seated, × 0.63 standing.
- **Standards referenced**: OSHA Computer Workstations eTool, ISO 9241-5, ANSI/HFES 100,
  with an explicit note that the tool is *not* certified to or endorsed by them.
- **Medical disclaimer** and **affiliate disclosure** (naming Amazon Associates and
  stating that affiliate status does not influence the model or the product tier).

It reuses the Phase 1 tokens: the token block in `rt-tokens.css` now targets
`.rt-calc, .rt-methodology`, so both plugin surfaces share one palette without ever
touching `:root`.

### Head metadata

Descriptive `<title>`, a 100+ character `meta description`, `robots` with
`max-image-preview:large`, and a `rel=canonical`. The canonical currently points at
`https://example.com/...`. **Replace it with the real URL before launch.** The test
asserts it is a marked placeholder, so this cannot be forgotten silently.

## WordPress embedding

The full guide is in the comment block at the top of `index.html`. Summary:

| Method | Use when | Notes |
| --- | --- | --- |
| **1. Plugin** (recommended) | production | `wp_enqueue_style` for `rt-tokens` → `rt-calc`, `wp_enqueue_script` in the footer, plus a `[ergonomic_calculator]` shortcode |
| **2. Theme** | child theme | same enqueues via `get_stylesheet_directory_uri()` |
| **3. Custom HTML block** | quick test | inline `<style>`/`<script>`; heavier revisions, no caching for assets, some security plugins strip inline JS |

Rules that keep it portable:

- Load `rt-tokens.css` **before** `rt-calc.css` (the component layer depends on the variables).
- `rt-calc.js` self-initialises on `DOMContentLoaded` and `init()` is idempotent, so it also
  works when the markup is injected later via AJAX.
- **Never enqueue `demo-page.css`**: it is the preview harness only.
- Emit **one** `SoftwareApplication` node per URL; drop ours if an SEO plugin already
  outputs one.

For the strongest indexing, render the personalised answer server-side in PHP using the
same inputs and the same ratios as `RT_Calculator.calculateAllocation()`.

## Shipping to WordPress

Three artefacts, documented in `wordpress/`:

| File | What it is |
| --- | --- |
| `single-file.html` | **Generated.** Markup + `<style>` + `<script>` in one paste-ready file for a Custom HTML block |
| `functions-snippet.php` | **Recommended for production.** Enqueues the three asset files separately |
| `REPLACE-THIS.md` | Every placeholder that must be changed before publishing |

### Why the build is generated, not hand-maintained

`tools/build-single-file.py` copies the widget markup and methodology section out of
`index.html`, inlines `rt-tokens.css` + `rt-calc.css`, and inlines `rt-calc.js`. Because
the artefact embeds a *copy* of the JS, it would silently rot the moment the sources
change, so `tests/build.test.js` rebuilds it in place and fails if the output is not
byte-identical. Editing `rt-calc.js` and forgetting to rebuild breaks the suite.

### Scope guarantees in the single file

| Check | Result |
| --- | --- |
| Selectors scoped to `.rt-*` | 240 / 240 |
| `:root` declarations | none |
| `body` / `html` selectors | none |
| External `<link>` / `<script src>` | none |
| Globals assigned | `window.RT_Calculator` only |
| `demo-page.css` included | no |

The token block targets `.rt-calc, .rt-methodology` rather than `:root`, which is what
makes a single-file paste safe inside an arbitrary theme.

### Single file vs. enqueue

`single-file.html` is the easiest path, with two real costs: the CSS/JS is re-downloaded
with the page (no separate browser cache) and inline `<script>` is blocked by a strict
Content-Security-Policy or by security plugins that filter post content. For production
traffic use `functions-snippet.php`. Both are tested to behave identically.

## Editing affiliate links

Everything lives in **one object at the top of `assets/js/rt-calc.js`**, under a
banner comment: `🚨 RIAJUL'S AFFILIATE DATABASE 🚨 / PASTE ALL YOUR AMAZON LINKS HERE`.

```js
var RT_AFFILIATE_LINKS = {
  chair: {
    budget:  { name, price, rating, link: "https://amzn.to/..." },
    mid:     { name, price, rating, link: "https://amzn.to/..." },
    premium: { name, price, rating, link: "https://amzn.to/..." }
  },
  desk:    { ... },   // 3 links
  monitor: { ... }    // 3 links
};
```

**One link per product, 9 links in total.** Amazon OneLink (or any geo-redirecting
short link) forwards each visitor to their local storefront, so there is no
per-currency URL to maintain.

### How a link is picked at runtime

1. The money allocated to the category selects the tier: `<250` budget,
   `250 to 700` mid, `>700` premium.
2. The URL is read from `RT_AFFILIATE_LINKS[category][tier].link`.

`resolveAffiliateLink(product)` takes **no currency argument**, and that omission is
the guarantee, not an oversight. Currency still does its full job elsewhere:
slider windows, budget amounts, percentages, CPCH, prices on the cards and the
AEO prose all reformat between USD / GBP / CAD. It simply no longer reaches URL
resolution.

### Guard rails (`tests/affiliate.test.js`)

Bulk-editing 9 URLs by hand is still where typos hide, so every slot is asserted
to be:

- a **single** `link` string (a `links: { USD, GBP, CAD }` object fails the suite)
- a **full `https://` URL** on `amzn.to` **or** an `amazon.*` storefront
- carrying a **`?tag=`** when a full product URL is used (an untagged link earns nothing)
- paired with a **numeric** `price` and a `0 to 5` `rating`
- **distinct**: duplicates are reported, so a copy-paste slip is caught

It also asserts the currency contract directly: switching USD → GBP → CAD leaves
every `href` byte-identical while the price symbols change. That is the exact
behaviour OneLink depends on, and the one most likely to regress.

Presentation data (icons, category labels) lives in `CATEGORY_META` just below
the database, so the object stays pure link/product data.

## Design tokens

All tokens are declared on `.rt-calc` (never `:root`), so a theme can neither
override them by accident nor inherit them.

| Token | Value | Use |
| --- | --- | --- |
| `--rt-bg` | `#0f172a` | Root background |
| `--rt-surface` | `#1e293b` | Card background |
| `--rt-surface-raised` / `--rt-surface-sunken` | `#243248` / `#0b1220` | Nested panels |
| `--rt-text` / `--rt-text-muted` / `--rt-text-dim` | `#e8eef9` / `#94a3b8` / `#64748b` | Type hierarchy |
| `--rt-accent` / `--rt-signal` | `#6366f1` / `#2dd4bf` | Primary / highlight |
| `--rt-font-sans` / `--rt-font-display` / `--rt-font-mono` | Inter / Sora / system mono | Typography |
| `--rt-space-1…16` | 4pt scale | Spacing |
| `--rt-radius-*`, `--rt-shadow-*`, `--rt-ease`, `--rt-dur-*` | (none) | Radii, elevation, motion |

Changing the brand is a one-file job: override the tokens, leave the components
untouched.

## Copy tone and style (Phase 11)

All visitor-facing copy follows one style guide, and `tests/*` assert the parts that
matter so the tone cannot drift:

- **No em dashes (U+2014) or en dashes (U+2013)** anywhere in the repository: HTML,
  JS, CSS comments, the generated single file, tests, this README and the WordPress
  guides. Use a colon, a comma, a full stop or brackets instead. Numeric ranges never
  use a dash, so they read "4 to 6 hrs".
- **Grade 6 to 8 conversational English**. Short sentences, active voice, second person.
  "We split your budget" rather than "the budget is divided".
- **Banned words**: *derived*, *randomised*, *comprehensive*, *utilize*. Use
  *calculated*, *based on*, *use*.
- **Friendly but honest disclaimers.** The medical and affiliate notes are warm and
  readable while keeping the exact phrases the legal and SEO checks rely on:
  `As an Amazon Associate`, `qualifying purchases`, `not medical advice`.
- **Keywords stay, but they must read naturally**: `Ergonomic Desk Setup Budget`,
  `OSHA standards`, `ISO 9241-5`, `Amazon Associate`, `Ergo Budget Ratio`,
  `Cost-Per-Comfort-Hour`.
- **Text only.** No ID, class, markup structure or JavaScript logic changes. Numbers,
  formulas and thresholds are untouchable: 35/25/20/10/5/5, the +5 / +6 / +6 point
  modifiers, the 1% floor, and the 0.41 / 0.63 height ratios.

The same rules apply to the dynamically generated AEO answer in `buildAEOText()` and to
the three FAQ answers in the `FAQPage` block.

## Theme compatibility: dark-mode form fields (Phase 12)

The widget is deployed on a GeneratePress site, where WordPress themes style every
`input` and `select` on the page. Three things broke in production:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dropdown text invisible | Theme set `color` dark on the select, over our `var(--rt-text)` | `color` and `-webkit-text-fill-color` forced to `#ffffff` |
| White box around the budget amount | Theme's `input[type=number] { background: #fff }` outranked our class | `background-color` forced to `var(--rt-field-bg)` |
| White popup when a dropdown opened | `<option>` was never styled against the theme | `option` / `optgroup` background and colour forced |

Section 14 of `rt-calc.css` is the answer. It is the last block in the file, every
declaration in it is `!important`, and its selectors carry two classes plus the real
DOM wrapper (`.rt-calc .rt-input-group .rt-input`), which outranks a theme rule such as
`.site-content input[type=number]` even when the theme also uses `!important`.

### What the layer covers

- **Shared chrome**: background, background image, text colour, text fill colour,
  border, radius, box shadow, opacity, outline, text shadow, filter, `color-scheme`,
  caret colour, `box-sizing` and `appearance`.
- **Layout guards**: width, min height, padding, font family, size and weight, so a
  theme's `font-size: 16px` or `padding: 10px` cannot resize the grid.
- **Open dropdown list**: dark `option` background, white text, accent highlight for
  the checked option, and a disabled prompt option that is not faded away.
- **Placeholder state**: an unselected `<select>` reads as `#94a3b8`, and
  `::placeholder` is pinned to the same grey with `opacity: 1` (Firefox otherwise
  applies 0.54).
- **Autofill**: Chrome repaints fields pale yellow and ignores `background-color`, so an
  inset shadow in the field colour is applied over the whole box.
- **Focus**: the accent border plus a `3px` ring from `--rt-focus-ring`, with a second
  tighter ring for `:focus-visible`. The theme's `outline` and `box-shadow` are reset
  first, so the ring cannot be hidden behind them.

### Contrast

Every value in the layer is measured in `tests/theme-override.test.js`:

| Pair | Ratio | Requirement |
| --- | --- | --- |
| `#ffffff` on the field surface `#0f172a` | 17.85:1 | AAA (7:1) |
| `#94a3b8` placeholder on `#0f172a` | 6.96:1 | AA (4.5:1) |
| Field border over `#0f172a` | 3.45:1 | Non-text 3:1 |
| Focus ring over `#0f172a` | 4.65:1 | Non-text 3:1 |
| Field surface against the card `#1e293b` | 1.22:1 | Visible as a well, not a flat patch |

The card behind the fields is `--rt-surface` (`#1e293b`), so the field keeps the darker
`--rt-bg` (`#0f172a`) well from the approved design rather than matching the card and
disappearing behind its own border. To flatten them, change the one `--rt-field-bg` line
in `rt-tokens.css` to `var(--rt-surface)`.

### Tokens added to `rt-tokens.css`

`--rt-field-bg`, `--rt-field-bg-hover`, `--rt-field-text`, `--rt-field-border`,
`--rt-field-border-hover`, `--rt-field-placeholder`, `--rt-field-option-bg`,
`--rt-field-option-checked`, `--rt-focus-ring`, `--rt-focus-ring-width`. They are
declared on `.rt-calc, .rt-methodology` like every other token, so a theme still cannot
reach them and `:root` stays untouched.

### Verifying on the live site

1. Bump the enqueue version (currently `0.11.0` in both `wordpress/functions-snippet.php`
   and the embed guide in `index.html`) so browsers fetch the new CSS. A stale
   `rt-calc.css` in the cache is the most common reason a fix "does not work".
2. Hard reload the page and open Step 1.
3. Check the three dropdowns, the open dropdown list, the budget number field and its
   focus ring. Everything should read as dark mode, with no white rectangles.

`tests/build.test.js` fails if `wordpress/single-file.html` is not rebuilt after a CSS
change, so the artefact always matches the sources.

## Conventions for upcoming phases

1. Keep every selector inside `.rt-calc`; prefix classes with `rt-`.
2. One module per step: mount into `#rt-slot-*` rather than editing sections.
3. No global resets (`body`, `h1`, `*`). `!important` is allowed in exactly two
   places: the reduced-motion block, and section 14 of `rt-calc.css` (theme
   override hardening). Anywhere else it means the cascade is being fought
   rather than understood.
4. Enqueue CSS through WordPress (`wp_enqueue_style`) in dependency order:
   `rt-tokens` → `rt-calc` → module styles.

## Preview

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

## Next phases

- Phase 2: Step 1 input UI. ✅
- Phase 3: Step 1 JS: state, sync, exclusivity, height maths. ✅
- Phase 4: Step 2 engine: allocation, CPCH, posture risk. ✅
- Phase 5: Step 2 progress-bar UI. ✅
- Phase 6: Step 3 results, AEO box, gear shortlist. ✅
- Phase 7: SEO: JSON-LD, static fallbacks, methodology, WordPress guide. ✅
- Phase 8: Production packaging: single-file build, enqueue snippet, replacement guide. ✅
- Phase 9: Centralised affiliate database with link-integrity guard rails. ✅
- Phase 10: One link per product via Amazon OneLink; currency decoupled from URLs. ✅
- Phase 11: Human-sounding copywriting rewrite: plain English, zero dashes, friendly
  disclaimers, simplified methodology. ✅
- Phase 12: Dark-mode hardening for live WordPress themes: forced field surfaces,
  readable placeholder text, dark dropdown lists, visible borders and focus rings. ✅
- Phase 8 (optional): PHP shortcode/block package with server-side rendering of the
  personalised answer, so crawlers see the calculated result and not just the fallback.
