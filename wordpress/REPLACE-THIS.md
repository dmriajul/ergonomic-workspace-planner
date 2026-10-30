# Publish checklist: links, canonical and credits

The nine affiliate links are live. Six are `riajultech.com/recommends/` redirects
and three go straight to the merchant (Uplift and Herman Miller). Change a link
in the one object below and every product card follows, in all three currencies.

The only hard placeholder left is the canonical URL in `index.html`.

---

## 1. The affiliate database: 9 links only

All links live in **one object at the very top of `assets/js/rt-calc.js`**
(or the inline `<script>` of `wordpress/single-file.html`). Search for:

```
RIAJUL'S AFFILIATE DATABASE
```

**One link per product, 9 links in total.** A redirect link (or Amazon OneLink)
sends each visitor to their local storefront, so there is no USD / GBP / CAD
variant to maintain.

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

| Slot | Where | Current URL |
| --- | --- | --- |
| `RT_AFFILIATE_LINKS.chair.budget.link` | `rt-calc.js` line 155 | `https://riajultech.com/recommends/modway-articulate-ergonomic-mesh-office-chair/` |
| `RT_AFFILIATE_LINKS.chair.mid.link` | `rt-calc.js` line 161 | `https://riajultech.com/recommends/herman-miller-sayl-chair/` |
| `RT_AFFILIATE_LINKS.chair.premium.link` | `rt-calc.js` line 167 | `https://riajultech.com/recommends/steelcase-gesture-office-chair/` |
| `RT_AFFILIATE_LINKS.desk.budget.link` | `rt-calc.js` line 175 | `https://riajultech.com/recommends/flexispot-en1-one-piece-standing-desk/` |
| `RT_AFFILIATE_LINKS.desk.mid.link` | `rt-calc.js` line 181 | `https://www.upliftdesk.com/clearance-standing-desk` |
| `RT_AFFILIATE_LINKS.desk.premium.link` | `rt-calc.js` line 187 | `https://store.hermanmiller.com/standing-desks/jarvis-bamboo-standing-desk/2542428.html` |
| `RT_AFFILIATE_LINKS.monitor.budget.link` | `rt-calc.js` line 195 | `https://riajultech.com/recommends/dell-24-monitor/` |
| `RT_AFFILIATE_LINKS.monitor.mid.link` | `rt-calc.js` line 201 | `https://riajultech.com/recommends/lg-27up850-w-monitor-27-uhd/` |
| `RT_AFFILIATE_LINKS.monitor.premium.link` | `rt-calc.js` line 207 | `https://riajultech.com/recommends/apple-studio-display/` |

### How the link is chosen (automatic, do not code this)

1. The money allocated to the category picks the tier:
   `under 250` -> `budget`, `250 to 700` -> `mid`, `above 700` -> `premium`.
2. The URL is read from `RT_AFFILIATE_LINKS[category][tier].link`.

The currency toggle (USD / GBP / CAD) **does not touch the URL**. It only
changes how budgets, prices and percentages are formatted.

### Rules when pasting your links

| Rule | Why |
| --- | --- |
| Full URL starting `https://` | Bare text or a scheme-less path is rejected by the test suite |
| A redirect, `amzn.to`, an `amazon.*` product URL, or a known merchant host | Anything else fails `tests/affiliate.test.js` |
| If you paste a full `amazon.com/dp/...` URL, keep `?tag=` | A product URL without your associate tag earns nothing |
| Use **your own** tag | Using another publisher's tag is an Amazon policy violation and will get the account closed |
| `price` stays a **number** (`1599`, not `"$1,599"`) | It is formatted into the active currency |

Do **not** add `links: { USD, GBP, CAD }` back, because a test fails if a
multi-currency structure reappears.

### Also update the product data

| Category | Budget tier | Mid tier | Premium tier |
| --- | --- | --- | --- |
| chair | ErgoBudget Mesh Chair, $150, 4.3 | Herman Miller Sayl, $450, 4.6 | Steelcase Gesture, $1,200, 4.8 |
| desk | FlexiSpot E1, $220, 4.4 | Uplift V2, $600, 4.7 | Fully Jarvis Bamboo, $950, 4.6 |
| monitor | Dell P2422H 24", $180, 4.5 | LG 27UP850, $500, 4.6 | Apple Studio Display, $1,599, 4.4 |

The two merchant links (Uplift and Herman Miller) are outside your redirect
domain, so add their host to `MERCHANT_HOSTS` in `tests/affiliate.test.js`
before pointing another product at a new shop. Icons and category labels are
**not** in this object. They live in `CATEGORY_META` just below it, so the
database stays pure link data.

---

## 2. Replace the canonical URL (required for SEO)

`index.html`, **line 90**:

```html
<link rel="canonical" href="https://example.com/smart-ergonomic-calculator/" />
```

Change it to the real page URL. In WordPress you normally do **not** hand-write a
canonical, because Yoast / Rank Math set one automatically and a second one is
harmful.
Only keep this tag if the calculator lives on a standalone page outside WordPress.

---

## 3. Other placeholders

| Item | Location | What to do |
| --- | --- | --- |
| Merchant hosts | `tests/affiliate.test.js` | Add a new shop host to `MERCHANT_HOSTS` before linking to it |
| `Riajul Tech` name | methodology section + affiliate disclosure | Must match your Associates account name |
| Affiliate disclosure wording | `#rt-affiliate-disclosure` | Amazon requires a visible disclosure; adjust to your brand |
| Demo stylesheet | `assets/css/demo-page.css` | **Never enqueue or paste this.** It is the preview harness only |
| Google Fonts `<link>` | `index.html` `<head>` | Optional; self-host if GDPR matters |

> OneLink note: Amazon's OneLink requires the tag of the *local* store to be
> linked in your Associates account. If a region is not enrolled, visitors there
> see the default marketplace instead of their own.

---

## 4. Verify after replacing

```bash
# No mock short links left (expect the count to drop below 9 as you edit)
grep -c "https://amzn.to/" assets/js/rt-calc.js

# Full suite, including link-shape checks
npm i --no-save jsdom csstree-validator
node tests/step1.test.js && node tests/step2.test.js && node tests/step2-ui.test.js \
  && node tests/step3.test.js && node tests/seo.test.js && node tests/affiliate.test.js \
  && node tests/build.test.js

# Rebuild the single-file version after editing the JS
python3 tools/build-single-file.py
```

The single-file build embeds a **copy** of the JS, so editing `rt-calc.js` will not
change `wordpress/single-file.html` until you re-run the build script.
`tests/build.test.js` fails when the two drift apart.
