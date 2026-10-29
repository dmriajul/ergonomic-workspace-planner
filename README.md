# Smart Ergonomic Calculator

A modular, namespaced calculator widget for WordPress. Everything renders inside
`.rt-calc`, so it drops into any theme without inheriting or leaking styles.

**Phase 1:** structure only — HTML skeleton + design tokens.
**Phase 2:** Step 1 UI — budget, ergonomic profile, pain points.
**Phase 3 (current):** Step 1 JavaScript — state, sync, pain exclusivity, height maths.
Step 2 / Step 3 logic (allocation, AEO copy) is deliberately absent.

## Structure

```
.
├── index.html                  # Static preview of the exact markup the plugin renders
├── assets/js/
│   └── rt-calc.js              # Step 1 controller (vanilla, no deps)
├── tests/
│   └── step1.test.js           # jsdom behavioural suite (98 assertions)
├── assets/css/
│   ├── rt-tokens.css           # Layer 0 — design tokens, scoped to .rt-calc
│   ├── rt-calc.css             # Layer 1 — scoped reset, shell, step skeleton
│   └── demo-page.css           # Preview harness only (not shipped)
└── README.md
```

## HTML contract

| Element | Purpose |
| --- | --- |
| `.rt-calc` | Namespaced root. All tokens and styles live under it. |
| `#rt-step-1` / `#rt-slot-inputs` | Step 1 — ergonomic profiling UI (Phase 2) |
| `#rt-step-2` / `#rt-slot-budget` | Step 2 — budget preview (empty mount point) |
| `#rt-step-3` / `#rt-slot-results` | Step 3 — results + AEO answer box (empty, `aria-live="polite"`) |

Each `<section>` carries `data-step="1|2|3"`, an `aria-labelledby` pointing at
its heading, and a `.rt-calc__slot` mount point. Slots are flagged
`data-empty="true"` while they hold only their hint; removing that attribute
(or swapping in real markup) collapses the placeholder styling automatically.

## Step 1 — Ergonomic Profiling

Lives inside `#rt-slot-inputs` as a single `<form class="rt-inputs">`, split into
three `<fieldset>` blocks so every control is grouped and labelled.

### Total budget
- `input[type=radio][name=rt-currency]` — USD / GBP / CAD, USD `checked` by default,
  presented as a segmented pill control (`.rt-seg`).
- `<output id="rt-budget-display">` — the large amount, `aria-live="polite"`.
- `#rt-budget-range` — `min=200 max=5000 step=50 value=1000`.
- `#rt-budget-amount` — number input, same range/step/initial value, synced by JS later.

Currency glyphs (`$` / `£` / `C$`) are three spans; CSS reveals exactly one via
`:has(#rt-cur-gbp:checked)` etc., so no JS is needed for the toggle.

### Ergonomic profile
`#rt-height` (ft/in **and** cm in each label), `#rt-hours`, `#rt-work` — native
`<select>` elements with a custom chevron, not a JS listbox.

### Pain points
Four `<label class="rt-pain-card">` options, each wrapping a real
`input[type=checkbox][name=rt-pain]` (visually hidden, still focusable):

| Value | Card |
| --- | --- |
| `neck-shoulder` | Neck / Shoulder |
| `lower-back` | Lower Back |
| `wrist-hand` | Wrist / Hand |
| `no-pain` | No Pain (Preventive) — carries `data-exclusive-group="rt-pain"` |

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

## Step 1 JavaScript — `assets/js/rt-calc.js`

A single IIFE. No dependencies, no globals except the namespace, no `innerHTML`,
no `eval`, and no Step 2/3 vocabulary in the source (asserted by the test suite).

### State

```js
window.RT_Calculator.getState()
// { budget: 1000, currency: "USD", height: null, hours: null, work: null, pains: [] }
```

`getState()` returns a **defensive copy** — mutating it cannot corrupt the widget.

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
| USD | 200 – 5,000 | 50 | `en-US` |
| GBP | 150 – 4,000 | 50 | `en-GB` |
| CAD | 250 – 6,500 | 50 | `en-CA` |

Switching currency re-windows the slider **and** the number input, relabels the
scale endpoints, repaints the glyph via `data-currency`, and re-clamps the amount
(5,000 USD → 4,000 GBP). It does **not** convert the value — inventing exchange
rates is Step 2's problem.

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
both units appear** — `5'8"` is exactly 68 in, while the label's `173 cm` is a
rounded display of 172.72 cm. Results are `console.log`ged on change until Step 3
renders them.

### Events (integration points for Steps 2–3)

Dispatched on the `.rt-calc` root, bubbling:

| Event | Detail |
| --- | --- |
| `rt:budgetchange` | `{ budget, currency }` |
| `rt:currencychange` | `{ currency, budget }` |
| `rt:painschange` | `{ pains }` |
| `rt:profilechange` | `{ field, value, state }` |
| `rt:heightchange` | `{ inches, metrics }` |

```js
document.addEventListener("rt:heightchange", e => console.log(e.detail.metrics));
```

`RT_Calculator.init()` is idempotent and safe to call after AJAX-injected markup
(a WordPress reality) — it is a no-op once `[data-rt-ready]` is set.

### Tests

```bash
npm i --no-save jsdom csstree-validator
node tests/step1.test.js
```

98 assertions: state defaults, slider↔input sync, mid-typing guard, snapping,
all three currency windows, pain exclusivity, height maths and parsing, event
emission, idempotency, and scope discipline (no Step 2/3 logic, no stray globals).

## Design tokens

All tokens are declared on `.rt-calc` — never `:root` — so a theme can neither
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
| `--rt-radius-*`, `--rt-shadow-*`, `--rt-ease`, `--rt-dur-*` | — | Radii, elevation, motion |

Changing the brand is a one-file job: override the tokens, leave the components
untouched.

## Conventions for upcoming phases

1. Keep every selector inside `.rt-calc`; prefix classes with `rt-`.
2. One module per step — mount into `#rt-slot-*` rather than editing sections.
3. No global resets (`body`, `h1`, `*`) and no `!important` outside the
   reduced-motion block.
4. Enqueue CSS through WordPress (`wp_enqueue_style`) in dependency order:
   `rt-tokens` → `rt-calc` → module styles.

## Preview

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

## Next phases

- Phase 2 — Step 1 input UI. ✅
- Phase 3 — Step 1 JS: state, sync, exclusivity, height maths. ✅
- Phase 4 — Step 2 budget allocation model (consumes `rt:budgetchange`).
- Phase 5 — results panel and AEO answer block (consumes `rt:heightchange`).
- Phase 6 — WordPress shortcode / block wrapper, `wp_enqueue_script` with `defer`.
