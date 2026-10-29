# Smart Ergonomic Calculator

A modular, namespaced calculator widget for WordPress. Everything renders inside
`.rt-calc`, so it drops into any theme without inheriting or leaking styles.

**Phase 1:** structure only — HTML skeleton + design tokens.
**Phase 2 (current):** Step 1 UI — budget, ergonomic profile, pain points.
No calculation logic yet.

## Structure

```
.
├── index.html                  # Static preview of the exact markup the plugin renders
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

### The only JS contract so far
The controller writes one custom property to paint the slider fill:

```js
range.style.setProperty("--rt-range-fill", `${pct}%`); // (value - 200) / 4800 * 100
```

It defaults to `16.7%` (value 1000) so the static markup already looks correct.

### Responsive behaviour
| Width | Budget control | Dropdowns | Pain cards |
| --- | --- | --- | --- |
| `< 26rem` | Stacked, full-width toggle + number box | 1 column | 1 column |
| `≥ 30rem` | Slider + number box side by side | 1 column | 2 × 2 grid |
| `≥ 44rem` | Slider + number box side by side | 3 columns | 2 × 2 grid |

Touch targets get extra vertical padding under `@media (pointer: coarse)`.

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
- Phase 3 — calculation model, slider/input sync, pain-card exclusivity, budget tiering.
- Phase 4 — results panel and AEO answer block.
- Phase 5 — WordPress shortcode / block wrapper and asset enqueueing.
