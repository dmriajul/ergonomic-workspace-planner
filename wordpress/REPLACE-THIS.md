# Replace these placeholders before publishing

Everything below is **mock data**: invented `amzn.to` short links and fake
product ASINs. Nothing here is a working affiliate link.

---

## 1. The affiliate database — 9 links only

All links live in **one object at the very top of `assets/js/rt-calc.js`**
(or the inline `<script>` of `wordpress/single-file.html`). Search for:

```
RIAJUL'S AFFILIATE DATABASE
```

**One link per product — 9 in total.** Amazon OneLink (or an equivalent
geo-redirecting short link) sends each visitor to their local storefront, so
there is no USD / GBP / CAD variant to maintain.

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

| Slot | Where | Current mock URL |
| --- | --- | --- |
| `RT_AFFILIATE_LINKS.chair.budget.link` | `rt-calc.js` line 146 | `https://amzn.to/3RtaChr01` |
| `RT_AFFILIATE_LINKS.chair.mid.link` | `rt-calc.js` line 152 | `https://amzn.to/3RtaChr02` |
| `RT_AFFILIATE_LINKS.chair.premium.link` | `rt-calc.js` line 158 | `https://amzn.to/3RtaChr03` |
| `RT_AFFILIATE_LINKS.desk.budget.link` | `rt-calc.js` line 166 | `https://amzn.to/3RtaDsk01` |
| `RT_AFFILIATE_LINKS.desk.mid.link` | `rt-calc.js` line 172 | `https://amzn.to/3RtaDsk02` |
| `RT_AFFILIATE_LINKS.desk.premium.link` | `rt-calc.js` line 178 | `https://amzn.to/3RtaDsk03` |
| `RT_AFFILIATE_LINKS.monitor.budget.link` | `rt-calc.js` line 186 | `https://amzn.to/3RtaMon01` |
| `RT_AFFILIATE_LINKS.monitor.mid.link` | `rt-calc.js` line 192 | `https://amzn.to/3RtaMon02` |
| `RT_AFFILIATE_LINKS.monitor.premium.link` | `rt-calc.js` line 198 | `https://amzn.to/3RtaMon03` |

### How the link is chosen (automatic — do not code this)

1. The money allocated to the category picks the tier:
   `under 250` -> `budget`, `250–700` -> `mid`, `above 700` -> `premium`.
2. The URL is read from `RT_AFFILIATE_LINKS[category][tier].link`.

The currency toggle (USD / GBP / CAD) **does not touch the URL**. It only
changes how budgets, prices and percentages are formatted.

### Rules when pasting your links

| Rule | Why |
| --- | --- |
| Full URL starting `https://` | Bare text or `amzn.to/xyz` without the scheme is rejected by the test suite |
| Use your **OneLink** short link | Amazon redirects the visitor to their local store |
| If you paste a full `amazon.com/dp/...` URL, keep `?tag=` | A product URL without your associate tag earns nothing |
| Use **your own** tag | Using another publisher's tag is an Amazon policy violation and will get the account closed |
| `price` stays a **number** (`1599`, not `"$1,599"`) | It is formatted into the active currency |

Do **not** add `links: { USD, GBP, CAD }` back — a test fails if a
multi-currency structure reappears.

### Also update the product data

| Category | Budget tier | Mid tier | Premium tier |
| --- | --- | --- | --- |
| chair | ErgoBudget Mesh Chair — $150 — 4.3 | Herman Miller Sayl — $450 — 4.6 | Steelcase Gesture — $1,200 — 4.8 |
| desk | FlexiSpot E1 — $220 — 4.4 | Uplift V2 — $600 — 4.7 | Fully Jarvis Bamboo — $950 — 4.6 |
| monitor | Dell P2422H 24" — $180 — 4.5 | LG 27UP850 — $500 — 4.6 | Apple Studio Display — $1,599 — 4.4 |

The `amzn.to` codes above are invented. Icons and category labels are **not** in
this object — they live in `CATEGORY_META` just below it, so the database stays
pure link data.

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
| `3RtaChr01`-style codes | `RT_AFFILIATE_LINKS` | Invented; replace with your real OneLink short links |
| `Riajul Tech` name | methodology section + affiliate disclosure | Must match your Associates account name |
| Affiliate disclosure wording | `#rt-affiliate-disclosure` | Amazon requires a visible disclosure; adjust to your brand |
| Demo stylesheet | `assets/css/demo-page.css` | **Never enqueue or paste this** — preview harness only |
| Google Fonts `<link>` | `index.html` `<head>` | Optional; self-host if GDPR matters |

> OneLink note: Amazon's OneLink requires the tag of the *local* store to be
> linked in your Associates account. If a region is not enrolled, visitors there
> see the default marketplace instead of their own.

---

## 4. Verify after replacing

```bash
# No mock short links left (expect the count to drop below 9 as you edit)
grep -c "https://amzn.to/" assets/js/rt-calc.js

# Full suite — includes link-shape checks
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
