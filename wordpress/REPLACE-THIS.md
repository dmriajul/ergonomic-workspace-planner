# Replace these placeholders before publishing

Everything below is **mock data**: realistic-looking Amazon URLs, real product
names, invented ASINs, and `riajultech-*` tags that are **not** your account.
Nothing here is a working affiliate link.

---

## 1. The affiliate database (the only place you edit links)

All 27 links live in **one object at the very top of `assets/js/rt-calc.js`**
(or the inline `<script>` of `wordpress/single-file.html`). Search for:

```
RIAJUL'S AFFILIATE DATABASE
```

Structure — three levels, no wrapper:

```js
var RT_AFFILIATE_LINKS = {
  chair: {
    budget:  { name, price, rating, links: { USD, GBP, CAD } },
    mid:     { name, price, rating, links: { USD, GBP, CAD } },
    premium: { name, price, rating, links: { USD, GBP, CAD } }
  },
  desk:    { ... },
  monitor: { ... }
};
```

**3 categories x 3 tiers x 3 currencies = 27 slots.**

| Slot | Where | Current mock URL |
| --- | --- | --- |
| `RT_AFFILIATE_LINKS.chair.budget.links.USD` | `rt-calc.js` line 104 | `https://www.amazon.com/dp/B0C1CHAIR1?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.chair.budget.links.GBP` | `rt-calc.js` line 105 | `https://www.amazon.co.uk/dp/B0C1CHAIR1?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.chair.budget.links.CAD` | `rt-calc.js` line 106 | `https://www.amazon.ca/dp/B0C1CHAIR1?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.chair.mid.links.USD` | `rt-calc.js` line 114 | `https://www.amazon.com/dp/B0C1CHAIR2?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.chair.mid.links.GBP` | `rt-calc.js` line 115 | `https://www.amazon.co.uk/dp/B0C1CHAIR2?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.chair.mid.links.CAD` | `rt-calc.js` line 116 | `https://www.amazon.ca/dp/B0C1CHAIR2?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.chair.premium.links.USD` | `rt-calc.js` line 124 | `https://www.amazon.com/dp/B0C1CHAIR3?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.chair.premium.links.GBP` | `rt-calc.js` line 125 | `https://www.amazon.co.uk/dp/B0C1CHAIR3?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.chair.premium.links.CAD` | `rt-calc.js` line 126 | `https://www.amazon.ca/dp/B0C1CHAIR3?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.budget.links.USD` | `rt-calc.js` line 136 | `https://www.amazon.com/dp/B0C1DESK001?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.budget.links.GBP` | `rt-calc.js` line 137 | `https://www.amazon.co.uk/dp/B0C1DESK001?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.desk.budget.links.CAD` | `rt-calc.js` line 138 | `https://www.amazon.ca/dp/B0C1DESK001?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.mid.links.USD` | `rt-calc.js` line 146 | `https://www.amazon.com/dp/B0C1DESK002?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.mid.links.GBP` | `rt-calc.js` line 147 | `https://www.amazon.co.uk/dp/B0C1DESK002?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.desk.mid.links.CAD` | `rt-calc.js` line 148 | `https://www.amazon.ca/dp/B0C1DESK002?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.premium.links.USD` | `rt-calc.js` line 156 | `https://www.amazon.com/dp/B0C1DESK003?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.desk.premium.links.GBP` | `rt-calc.js` line 157 | `https://www.amazon.co.uk/dp/B0C1DESK003?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.desk.premium.links.CAD` | `rt-calc.js` line 158 | `https://www.amazon.ca/dp/B0C1DESK003?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.budget.links.USD` | `rt-calc.js` line 168 | `https://www.amazon.com/dp/B0C1MONIT01?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.budget.links.GBP` | `rt-calc.js` line 169 | `https://www.amazon.co.uk/dp/B0C1MONIT01?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.monitor.budget.links.CAD` | `rt-calc.js` line 170 | `https://www.amazon.ca/dp/B0C1MONIT01?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.mid.links.USD` | `rt-calc.js` line 178 | `https://www.amazon.com/dp/B0C1MONIT02?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.mid.links.GBP` | `rt-calc.js` line 179 | `https://www.amazon.co.uk/dp/B0C1MONIT02?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.monitor.mid.links.CAD` | `rt-calc.js` line 180 | `https://www.amazon.ca/dp/B0C1MONIT02?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.premium.links.USD` | `rt-calc.js` line 188 | `https://www.amazon.com/dp/B0C1MONIT03?tag=riajultech-20` |
| `RT_AFFILIATE_LINKS.monitor.premium.links.GBP` | `rt-calc.js` line 189 | `https://www.amazon.co.uk/dp/B0C1MONIT03?tag=riajultech-21` |
| `RT_AFFILIATE_LINKS.monitor.premium.links.CAD` | `rt-calc.js` line 190 | `https://www.amazon.ca/dp/B0C1MONIT03?tag=riajultech-20` |

### The three steps that pick a link (automatic — do not code this)

1. Active currency is read from state: `USD`, `GBP` or `CAD`.
2. The money allocated to the category picks the tier:
   `under 250` -> `budget`, `250–700` -> `mid`, `above 700` -> `premium`.
3. The URL is read from `RT_AFFILIATE_LINKS[category][tier].links[currency]`.

Switching the currency toggle re-renders the cards with the new regional links
immediately — no page reload.

### Rules when pasting your links

| Rule | Why |
| --- | --- |
| Full `https://www.amazon.…` URLs | Bare `amzn.to/xyz` short links are rejected by the test suite |
| `USD` -> `www.amazon.com` | A test checks each region matches its storefront |
| `GBP` -> `www.amazon.co.uk` | Same |
| `CAD` -> `www.amazon.ca` | Same |
| Keep `?tag=` on every link | Without your tag the click earns nothing |
| `price` stays a **number** (`1599`, not `"$1,599"`) | It is formatted into the active currency |

Your tag must be **your own** Associates tag — using another publisher's tag is
an Amazon policy violation and will get the account closed.

### Also update the product data

| Category | Budget tier | Mid tier | Premium tier |
| --- | --- | --- | --- |
| chair | ErgoBudget Mesh Chair — $150 — 4.3 | Herman Miller Sayl — $450 — 4.6 | Steelcase Gesture — $1,200 — 4.8 |
| desk | FlexiSpot E1 — $220 — 4.4 | Uplift V2 — $600 — 4.7 | Fully Jarvis Bamboo — $950 — 4.6 |
| monitor | Dell P2422H 24" — $180 — 4.5 | LG 27UP850 — $500 — 4.6 | Apple Studio Display — $1,599 — 4.4 |

The ASINs (`B0C1CHAIR1` etc.) are invented and point at nothing. Replace each URL
with the real product page for that tier.

Icons and category labels are **not** in this object — they live in
`CATEGORY_META` just below it, so the database stays pure link data.

---

## 2. Replace the canonical URL (required for SEO)

`index.html`, **line 90**:

```html
<link rel="canonical" href="https://example.com/smart-ergonomic-calculator/" />
```

Change it to the real page URL. In WordPress you normally do **not** hand-write a
canonical — Yoast / Rank Math set one automatically, and a second one is harmful.
Only keep this tag if the calculator lives on a standalone page outside WordPress.

---

## 3. Other placeholders

| Item | Location | What to do |
| --- | --- | --- |
| `riajultech-20` / `riajultech-21` tags | `RT_AFFILIATE_LINKS` | Replace with your real Associate tags |
| `Riajul Tech` name | methodology section + affiliate disclosure | Must match your Associates account name |
| Affiliate disclosure wording | `#rt-affiliate-disclosure` | Amazon requires a visible disclosure; adjust to your brand |
| ASINs `B0C1…` | `RT_AFFILIATE_LINKS` | Invented; replace with the real product URLs |
| Demo stylesheet | `assets/css/demo-page.css` | **Never enqueue or paste this** — preview harness only |
| Google Fonts `<link>` | `index.html` `<head>` | Optional; self-host if GDPR matters |

---

## 4. Verify after replacing

```bash
# No mock URLs left (expect 0)
grep -c "riajultech-2\|B0C1" assets/js/rt-calc.js

# All links are full Amazon URLs (expect 27)
grep -c "https://www.amazon." assets/js/rt-calc.js

# Full suite — includes link-shape and region checks
npm i --no-save jsdom csstree-validator
node tests/step1.test.js && node tests/step2.test.js && node tests/step2-ui.test.js \
  && node tests/step3.test.js && node tests/seo.test.js && node tests/affiliate.test.js \
  && node tests/build.test.js

# Rebuild the single-file version after editing the JS
python3 tools/build-single-file.py
```

The single-file build embeds a **copy** of the JS — editing `rt-calc.js` will not
change `wordpress/single-file.html` until you re-run the build script.
`tests/build.test.js` fails when the two drift apart.
