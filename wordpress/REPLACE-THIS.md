# Replace these placeholders before publishing

Everything below ships as **mock data**. Nothing here is a real product link.
The calculator works without these changes, but visitors would be sent to dead
`amzn.to` placeholders.

---

## 1. The 27 Amazon affiliate links (required)

All of them live in one object in **`assets/js/rt-calc.js`** (or the inline
`<script>` of `wordpress/single-file.html`) — the `AFFILIATE_PRODUCTS`
declaration, starting around **line 1260**.

Shape:

```js
var AFFILIATE_PRODUCTS = {
  chair: {
    tiers: {
      budget:  { name, price, rating, links: { USD: "...", GBP: "...", CAD: "..." } },
      mid:     { ... },
      premium: { ... }
    }
  },
  desk:    { ... },
  monitor: { ... }
};
```

There are **3 categories x 3 tiers x 3 currencies = 27 slots**. Every one is
currently `https://amzn.to/us-link`, `.../uk-link` or `.../ca-link` — three
distinct placeholder strings reused 9 times each.

Replace each `links.USD` / `links.GBP` / `links.CAD` with the real link for
**that product on that regional storefront** (amazon.com / amazon.co.uk /
amazon.ca). Use your own tracking tag; never reuse another associate's.

| Slot | Where | Current placeholder |
| --- | --- | --- |
| `chair.tiers.budget.links.USD` | `rt-calc.js` line 1279 | `https://amzn.to/us-link` |
| `chair.tiers.budget.links.GBP` | `rt-calc.js` line 1280 | `https://amzn.to/uk-link` |
| `chair.tiers.budget.links.CAD` | `rt-calc.js` line 1281 | `https://amzn.to/ca-link` |
| `chair.tiers.mid.links.USD` | `rt-calc.js` line 1289 | `https://amzn.to/us-link` |
| `chair.tiers.mid.links.GBP` | `rt-calc.js` line 1290 | `https://amzn.to/uk-link` |
| `chair.tiers.mid.links.CAD` | `rt-calc.js` line 1291 | `https://amzn.to/ca-link` |
| `chair.tiers.premium.links.USD` | `rt-calc.js` line 1299 | `https://amzn.to/us-link` |
| `chair.tiers.premium.links.GBP` | `rt-calc.js` line 1300 | `https://amzn.to/uk-link` |
| `chair.tiers.premium.links.CAD` | `rt-calc.js` line 1301 | `https://amzn.to/ca-link` |
| `desk.tiers.budget.links.USD` | `rt-calc.js` line 1315 | `https://amzn.to/us-link` |
| `desk.tiers.budget.links.GBP` | `rt-calc.js` line 1316 | `https://amzn.to/uk-link` |
| `desk.tiers.budget.links.CAD` | `rt-calc.js` line 1317 | `https://amzn.to/ca-link` |
| `desk.tiers.mid.links.USD` | `rt-calc.js` line 1325 | `https://amzn.to/us-link` |
| `desk.tiers.mid.links.GBP` | `rt-calc.js` line 1326 | `https://amzn.to/uk-link` |
| `desk.tiers.mid.links.CAD` | `rt-calc.js` line 1327 | `https://amzn.to/ca-link` |
| `desk.tiers.premium.links.USD` | `rt-calc.js` line 1335 | `https://amzn.to/us-link` |
| `desk.tiers.premium.links.GBP` | `rt-calc.js` line 1336 | `https://amzn.to/uk-link` |
| `desk.tiers.premium.links.CAD` | `rt-calc.js` line 1337 | `https://amzn.to/ca-link` |
| `monitor.tiers.budget.links.USD` | `rt-calc.js` line 1351 | `https://amzn.to/us-link` |
| `monitor.tiers.budget.links.GBP` | `rt-calc.js` line 1352 | `https://amzn.to/uk-link` |
| `monitor.tiers.budget.links.CAD` | `rt-calc.js` line 1353 | `https://amzn.to/ca-link` |
| `monitor.tiers.mid.links.USD` | `rt-calc.js` line 1361 | `https://amzn.to/us-link` |
| `monitor.tiers.mid.links.GBP` | `rt-calc.js` line 1362 | `https://amzn.to/uk-link` |
| `monitor.tiers.mid.links.CAD` | `rt-calc.js` line 1363 | `https://amzn.to/ca-link` |
| `monitor.tiers.premium.links.USD` | `rt-calc.js` line 1371 | `https://amzn.to/us-link` |
| `monitor.tiers.premium.links.GBP` | `rt-calc.js` line 1372 | `https://amzn.to/uk-link` |
| `monitor.tiers.premium.links.CAD` | `rt-calc.js` line 1373 | `https://amzn.to/ca-link` |

### Fastest way to fix them

Bulk-replace the three placeholder strings, then refine per product:

| Find | Replace with |
| --- | --- |
| `https://amzn.to/us-link` | your amazon.com tracking link (9 occurrences) |
| `https://amzn.to/uk-link` | your amazon.co.uk tracking link (9 occurrences) |
| `https://amzn.to/ca-link` | your amazon.ca tracking link (9 occurrences) |

A single global replace is only correct if one link serves a whole region. To
send each *product* to its own page, edit all 27 slots individually — the table
above gives the exact key path and line number for each.

### Also update the product details

The `name`, `price` and `rating` values next to each link are also mock:

| Category | Budget tier | Mid tier | Premium tier |
| --- | --- | --- | --- |
| chair | ErgoBudget Mesh Chair — $150 — 4.3 | Herman Miller Sayl — $450 — 4.6 | Steelcase Gesture — $1,200 — 4.8 |
| desk | FlexiSpot E1 — $220 — 4.4 | Uplift V2 — $600 — 4.7 | Fully Jarvis Bamboo — $950 — 4.6 |
| monitor | Dell P2422H 24" — $180 — 4.5 | LG 27UP850 — $500 — 4.6 | Apple Studio Display — $1,599 — 4.4 |

`price` is a **number** (no symbol) — the calculator formats it into the active
currency. Keep it in the same unit, or the tier labels stop being meaningful.

---

## 2. Replace the canonical URL (required for SEO)

`index.html`, **line 90**:

```html
<link rel="canonical" href="https://example.com/smart-ergonomic-calculator/" />
```

Change it to the real page URL. In WordPress you normally do **not** hand-write
a canonical — Yoast / Rank Math set one automatically, and a second one is
harmful. Only keep this tag if the calculator lives on a standalone page
outside WordPress.

---

## 3. Other things that are placeholders

| Item | Location | What to do |
| --- | --- | --- |
| `Riajul Tech` (affiliate disclosure) | `index.html` methodology section + `rt-calc.js` card copy | Make sure it matches your actual Amazon Associates account name |
| Affiliate disclosure wording | `#rt-affiliate-disclosure` | Amazon requires a visible disclosure; keep it, adjust to your brand |
| `operatingSystem` / `applicationCategory` in JSON-LD | `index.html` `<head>` | Fine as-is; update if the positioning changes |
| Demo stylesheet | `assets/css/demo-page.css` | **Never enqueue or paste this** — preview harness only |
| Google Fonts `<link>` | `index.html` `<head>` | Optional. The design degrades to the system stack without it. Self-host if GDPR matters to you |

---

## 4. Verify after replacing

```bash
# Every placeholder gone? (expect 0)
grep -c "amzn.to/us-link\|amzn.to/uk-link\|amzn.to/ca-link" assets/js/rt-calc.js

# Regression suite still green
npm i --no-save jsdom csstree-validator
node tests/step1.test.js && node tests/step2.test.js && node tests/step2-ui.test.js \
  && node tests/step3.test.js && node tests/seo.test.js && node tests/build.test.js

# Rebuild the single-file version after editing the JS
python3 tools/build-single-file.py
```

If you use the single-file build, remember it embeds a **copy** of the JS —
editing `rt-calc.js` will not change `wordpress/single-file.html` until you
re-run the build script. `tests/build.test.js` fails when the two drift apart.
