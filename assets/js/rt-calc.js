/**
 * rt-calc.js — Smart Ergonomic Calculator
 * Step 1 interactions only (budget · ergonomic profile · pain points).
 * ---------------------------------------------------------------------------
 * NOTHING in this file performs Step 2 or Step 3 work: no budget allocation,
 * no AEO copy, no scoring. It only keeps `state` truthful and the DOM in sync,
 * then emits events other modules can subscribe to later.
 *
 * Design rules
 *  1. One namespace, zero leaks: everything lives behind window.RT_Calculator.
 *  2. Pure math is separated from DOM wiring, so it can be unit tested and
 *     reused by Step 3 without touching the DOM at all.
 *  3. The controller never writes into an element that a `:checked`/`:has()`
 *     CSS rule already owns, to avoid duplicating presentation in JS.
 *  4. No dependencies, no globals, no build step.
 *
 * Public API (window.RT_Calculator)
 *  .getState()                     → defensive copy of the current state
 *  .calculateErgonomicHeights(in)  → { seatedHeightInches, standingHeightInches,
 *                                      seatedHeightCm, standingHeightCm }
 *  .parseHeightToInches(source)    → inches (number) | null
 *
 *  Step 2 engine (pure — safe to call with any state-like object)
 *  .calculateAllocation(input)     → ratios summing to exactly 1
 *  .allocateAmounts(budget, alloc) → money per category (sums to budget)
 *  .calculateCPCH(budget, hours)   → "$0.08" | null
 *  .calculateCPCHValue(...)        → raw number | null
 *  .calculatePostureRisk(chair$, hours, pains) → { level, label }
 *  .computeStep2(snapshot?)        → full Step 2 result object
 *  .calculateSetupTier(budget)     → { key, label, note }
 *  .toDisplayPercentages(alloc)    → integer % summing to 100
 *  .updateStep2UI()                → paints the panel + emits rt:step2update
 *  .debug                          → true to re-enable the console dump
 *
 *  .init()                         → idempotent manual (re)initialisation
 *  .version
 *
 * Events (bubbling CustomEvents dispatched on the .rt-calc root)
 *  rt:budgetchange   detail: { budget, currency }
 *  rt:currencychange detail: { currency, budget }
 *  rt:painschange    detail: { pains: string[] }
 *  rt:profilechange  detail: { field, value, state }
 *  rt:heightchange   detail: { inches, metrics }
 *  rt:step2update    detail: { allocation, amounts, cpch, risk, … }
 */
(function (window, document) {
  "use strict";

  /* =========================================================================
     1. Configuration — single source of truth for ranges and ratios
     ========================================================================= */

  /**
   * Per-currency budget windows. `step` is shared so the slider always lands on
   * round numbers, and `locale` drives thousands separators in the display.
   * Switching currency re-clamps the amount; it does NOT convert the value
   * (inventing exchange rates is Step 2's problem, not the UI's).
   */
  var CURRENCIES = {
    USD: { code: "USD", symbol: "$", min: 200, max: 5000, step: 50, locale: "en-US" },
    GBP: { code: "GBP", symbol: "£", min: 150, max: 4000, step: 50, locale: "en-GB" },
    CAD: { code: "CAD", symbol: "C$", min: 250, max: 6500, step: 50, locale: "en-CA" }
  };

  var DEFAULT_CURRENCY = "USD";
  var DEFAULT_BUDGET = 1000;

  /** Ergonomics ratios: elbow height as a fraction of total stature. */
  var SEATED_RATIO = 0.41;
  var STANDING_RATIO = 0.63;

  var CM_PER_INCH = 2.54;

  var SELECTOR = {
    root: "[data-rt-calc], .rt-calc",
    range: "#rt-budget-range",
    amount: "#rt-budget-amount",
    display: "#rt-budget-display",
    displayValue: ".rt-budget__value",
    currencyInput: 'input[name="rt-currency"]',
    scaleMin: ".rt-budget__scale-min",
    scaleMax: ".rt-budget__scale-max",
    height: "#rt-height",
    hours: "#rt-hours",
    work: "#rt-work",
    pain: 'input[name="rt-pain"]',
    // Step 2 preview
    preview: "#rt-budget-preview",
    allocRow: "[data-category]",
    allocTrack: ".rt-alloc__track",
    allocBar: ".rt-alloc__bar",
    allocPct: ".rt-alloc__pct",
    allocAmount: ".rt-alloc__amount",
    allocLabel: ".rt-alloc__label",
    allocTotal: "#rt-alloc-total",
    metricCPCH: "#rt-metric-cpch",
    metricCPCHNote: "#rt-metric-cpch-note",
    metricRisk: "#rt-metric-risk",
    metricRiskNote: "#rt-metric-risk-note",
    metricTier: "#rt-metric-tier",
    metricTierNote: "#rt-metric-tier-note"
  };

  /* =========================================================================
     2. State — the single object every later phase reads from
     ========================================================================= */

  /**
   * Initial state, exactly as specified.
   *  height → NUMBER OF INCHES (or null). Inches are the unit the OSHA-style
   *           ratios consume, so the canonical state stores inches; the raw
   *           option value stays available on the <select> itself.
   *  hours  → option value ("lt4" | "4to6" | "6to8" | "8plus") | null
   *  work   → option value ("software-dev" | …) | null
   *  pains  → array of checkbox values that are currently checked
   */
  var state = {
    budget: DEFAULT_BUDGET,
    currency: DEFAULT_CURRENCY,
    height: null,
    hours: null,
    work: null,
    pains: []
  };

  /** Defensive copy so callers cannot mutate internal state by accident. */
  function getState() {
    return {
      budget: state.budget,
      currency: state.currency,
      height: state.height,
      hours: state.hours,
      work: state.work,
      pains: state.pains.slice()
    };
  }

  /* =========================================================================
     3. Small pure helpers
     ========================================================================= */

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /** Snap a value onto the (min + n·step) lattice the slider uses. */
  function snapToStep(value, min, step) {
    return min + Math.round((value - min) / step) * step;
  }

  /** Percentage of track travelled — feeds the --rt-range-fill custom property. */
  function computeFillPercent(value, min, max) {
    if (max <= min) return 0;
    return round(clamp(((value - min) / (max - min)) * 100, 0, 100), 1);
  }

  /** Cached Intl formatters (constructing one per keystroke is wasteful). */
  var formatterCache = {};
  function formatAmount(value, currency) {
    var cfg = CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];
    if (!formatterCache[cfg.code]) {
      formatterCache[cfg.code] = new Intl.NumberFormat(cfg.locale, {
        maximumFractionDigits: 0
      });
    }
    return formatterCache[cfg.code].format(value);
  }

  function emit(root, type, detail) {
    root.dispatchEvent(
      new CustomEvent(type, { bubbles: true, detail: detail || {} })
    );
  }

  /* =========================================================================
     4. Height parsing + OSHA maths (pure — no DOM, no state)
     ========================================================================= */

  /**
   * Normalise anything the UI can hand us into inches.
   *
   * Accepts:
   *  - an <option> element  → prefers data-inches, then parses its label
   *                           ("5'8" (173 cm)"), then falls back to value as cm
   *  - a label string       → same regex parsing
   *  - a number             → treated as inches when plausible (<= 96),
   *                           otherwise as centimetres
   *
   * @param  {HTMLOptionElement|string|number} source
   * @return {number|null} inches, or null when unparseable/empty
   */
  function parseHeightToInches(source) {
    if (source === null || source === undefined) return null;

    /* ---- option element / element-like object ---- */
    if (typeof source === "object") {
      if (source.dataset && source.dataset.inches) {
        var explicit = Number(source.dataset.inches);
        if (isFinite(explicit) && explicit > 0) return round(explicit, 2);
      }
      var label = (source.textContent || "").trim();
      if (label) {
        var fromLabel = parseHeightString(label);
        if (fromLabel !== null) return fromLabel;
      }
      var rawValue = Number(source.value);
      if (isFinite(rawValue) && rawValue > 0) {
        return round(rawValue / CM_PER_INCH, 2); // option values are cm
      }
      return null;
    }

    /* ---- plain string ---- */
    if (typeof source === "string") {
      if (!source.trim()) return null;
      return parseHeightString(source);
    }

    /* ---- bare number: inches if plausible, otherwise cm ---- */
    if (typeof source === "number" && isFinite(source) && source > 0) {
      return source <= 96 ? round(source, 2) : round(source / CM_PER_INCH, 2);
    }

    return null;
  }

  /**
   * Parse "5'8" (173 cm)" / "5 ft 8" / "173 cm" into inches.
   * Feet+inches wins when both units appear, because it is the precise one.
   */
  function parseHeightString(text) {
    var feetInches = /(\d+)\s*(?:'|′|ft|feet)\s*(\d+(?:\.\d+)?)?/i.exec(text);
    if (feetInches && feetInches[1]) {
      var feet = Number(feetInches[1]);
      var inches = feetInches[2] ? Number(feetInches[2]) : 0;
      if (isFinite(feet) && feet > 0) return round(feet * 12 + inches, 2);
    }

    var cm = /(\d+(?:\.\d+)?)\s*cm/i.exec(text);
    if (cm) {
      var cmValue = Number(cm[1]);
      if (isFinite(cmValue) && cmValue > 0) return round(cmValue / CM_PER_INCH, 2);
    }

    return null;
  }

  /**
   * OSHA-style working heights from total stature.
   *   seated  = stature × 0.41  (seated elbow height)
   *   standing = stature × 0.63 (standing elbow height)
   *
   * @param  {number} heightInInches total height in inches
   * @return {{seatedHeightInches:number, standingHeightInches:number,
   *           seatedHeightCm:number, standingHeightCm:number}|null}
   */
  function calculateErgonomicHeights(heightInInches) {
    var inches = Number(heightInInches);
    if (!isFinite(inches) || inches <= 0) return null;

    var seatedHeightInches = round(inches * SEATED_RATIO, 2);
    var standingHeightInches = round(inches * STANDING_RATIO, 2);

    return {
      seatedHeightInches: seatedHeightInches,
      standingHeightInches: standingHeightInches,
      seatedHeightCm: round(seatedHeightInches * CM_PER_INCH, 1),
      standingHeightCm: round(standingHeightInches * CM_PER_INCH, 1)
    };
  }

  /* =========================================================================
     5. Module: budget + currency
     ========================================================================= */

  function initBudget(ctx) {
    var root = ctx.root;
    var range = ctx.range;
    var amountInput = ctx.amountInput;
    var displayValue = ctx.displayValue;
    var currencyInputs = ctx.currencyInputs;
    var scaleMin = ctx.scaleMin;
    var scaleMax = ctx.scaleMax;

    function cfg() {
      return CURRENCIES[state.currency];
    }

    /** Paint every derived surface for a committed value. */
    function paint(value) {
      var configuration = cfg();
      var formatted = formatAmount(value, configuration.code);

      range.style.setProperty(
        "--rt-range-fill",
        computeFillPercent(value, configuration.min, configuration.max) + "%"
      );

      // The <output> also holds the currency glyph spans — never innerHTML it.
      if (displayValue) displayValue.textContent = formatted;

      // Screen readers get the resolved amount instead of "1,000 of 4,350".
      range.setAttribute(
        "aria-valuetext",
        configuration.symbol + formatted + " " + configuration.code
      );
      amountInput.setAttribute(
        "aria-label",
        "Exact budget amount in " + configuration.code
      );
    }

    /**
     * Commit a value into state + DOM.
     * @param {number} value
     * @param {{snap?:boolean, syncInput?:boolean, notify?:boolean}} options
     */
    function commit(value, options) {
      var opts = options || {};
      var configuration = cfg();

      var next = clamp(value, configuration.min, configuration.max);
      if (opts.snap) {
        next = snapToStep(next, configuration.min, configuration.step);
        next = clamp(next, configuration.min, configuration.max);
      }

      state.budget = next;

      // Keep the control of origin in sync without clobbering in-progress typing.
      range.value = String(next);
      if (opts.syncInput) amountInput.value = String(next);

      paint(next);

      if (opts.notify !== false) {
        emit(root, "rt:budgetchange", {
          budget: state.budget,
          currency: state.currency
        });
      }
      return next;
    }

    /**
     * Switch currency: re-window the slider, re-clamp the amount, relabel scale.
     * Value is preserved when it fits the new range, clamped when it does not.
     */
    function setCurrency(code) {
      if (!CURRENCIES[code] || code === state.currency) return;

      var configuration = CURRENCIES[code];

      state.currency = code;
      root.setAttribute("data-currency", code);

      range.min = String(configuration.min);
      range.max = String(configuration.max);
      range.step = String(configuration.step);

      amountInput.min = String(configuration.min);
      amountInput.max = String(configuration.max);
      amountInput.step = String(configuration.step);

      if (scaleMin) scaleMin.textContent = formatAmount(configuration.min, code);
      if (scaleMax) scaleMax.textContent = formatAmount(configuration.max, code);

      // Re-normalise through the new window; also repaints glyphs/fill.
      commit(state.budget, { snap: true, syncInput: true, notify: false });

      emit(root, "rt:currencychange", {
        currency: state.currency,
        budget: state.budget
      });
    }

    /* ---- slider → number input (fires continuously while dragging) ---- */
    range.addEventListener("input", function () {
      commit(range.valueAsNumber, { snap: false, syncInput: true });
    });

    /* ---- number input → slider (live, but forgiving mid-typing) ---- */
    amountInput.addEventListener("input", function () {
      var raw = amountInput.value.trim();
      if (raw === "") return;
      var parsed = Number(raw);
      if (!isFinite(parsed)) return;

      // Typing "1" on the way to "1500" must not slam the value to the minimum;
      // only live-update once the number is inside the window.
      var configuration = cfg();
      if (parsed < configuration.min || parsed > configuration.max) return;

      commit(parsed, { snap: false, syncInput: false });
    });

    /* ---- commit/normalise on blur, Enter and the change event ---- */
    function commitFromInput() {
      var raw = amountInput.value.trim();
      var configuration = cfg();
      var parsed = raw === "" ? state.budget : Number(raw);

      if (!isFinite(parsed)) parsed = configuration.min;
      commit(parsed, { snap: true, syncInput: true });
    }

    amountInput.addEventListener("change", commitFromInput);
    amountInput.addEventListener("blur", commitFromInput);
    amountInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitFromInput();
      }
    });

    /* ---- currency radios ---- */
    Array.prototype.forEach.call(currencyInputs, function (input) {
      input.addEventListener("change", function () {
        if (input.checked) setCurrency(input.value);
      });
    });

    /* ---- initial paint from the initial state ---- */
    var initial = cfg();
    root.setAttribute("data-currency", state.currency);
    range.min = String(initial.min);
    range.max = String(initial.max);
    range.step = String(initial.step);
    amountInput.min = String(initial.min);
    amountInput.max = String(initial.max);
    amountInput.step = String(initial.step);
    if (scaleMin) scaleMin.textContent = formatAmount(initial.min, initial.code);
    if (scaleMax) scaleMax.textContent = formatAmount(initial.max, initial.code);

    commit(state.budget, { snap: true, syncInput: true, notify: false });
  }

  /* =========================================================================
     6. Module: pain points (exclusive "No Pain" behaviour)
     ========================================================================= */

  function initPainPoints(ctx) {
    var root = ctx.root;
    var boxes = Array.prototype.slice.call(ctx.root.querySelectorAll(SELECTOR.pain));
    if (!boxes.length) return;

    /** The exclusive option is flagged in markup, so the logic is not name-bound. */
    var exclusive = boxes.filter(function (box) {
      return box.dataset.exclusiveGroup != null || box.value === "no-pain";
    });

    function isExclusive(box) {
      return exclusive.indexOf(box) !== -1;
    }

    function syncState() {
      state.pains = boxes
        .filter(function (box) {
          return box.checked;
        })
        .map(function (box) {
          return box.value;
        });

      emit(root, "rt:painschange", { pains: state.pains.slice() });
    }

    function handleChange(box) {
      // Unchecking never needs to cascade — only a new selection does.
      if (box.checked) {
        if (isExclusive(box)) {
          // "No Pain (Preventive)" clears every symptom card…
          boxes.forEach(function (other) {
            if (other !== box) other.checked = false;
          });
        } else {
          // …and any symptom clears the preventive card.
          exclusive.forEach(function (other) {
            other.checked = false;
          });
        }
      }
      syncState();
    }

    boxes.forEach(function (box) {
      box.addEventListener("change", function () {
        handleChange(box);
      });
    });

    syncState(); // adopt whatever the markup shipped with
  }

  /* =========================================================================
     7. Module: ergonomic profile (height / hours / work)
     ========================================================================= */

  function initProfile(ctx) {
    var root = ctx.root;
    var heightSelect = ctx.heightSelect;
    var hoursSelect = ctx.hoursSelect;
    var workSelect = ctx.workSelect;

    /** Read inches straight off the currently selected <option>. */
    function readHeightInches(select) {
      var option = select.options[select.selectedIndex];
      if (!option || option.value === "") return null;
      return parseHeightToInches(option);
    }

    if (heightSelect) {
      heightSelect.addEventListener("change", function () {
        var inches = readHeightInches(heightSelect);
        state.height = inches;

        if (inches === null) {
          state.height = null;
          emit(root, "rt:heightchange", { inches: null, metrics: null });
          emit(root, "rt:profilechange", {
            field: "height",
            value: null,
            state: getState()
          });
          return;
        }

        var metrics = calculateErgonomicHeights(inches);

        // Step 3 will render these; for now they only hit the console.
        console.log("[RT] Height changed → inches:", inches, "metrics:", metrics);

        emit(root, "rt:heightchange", { inches: inches, metrics: metrics });
        emit(root, "rt:profilechange", {
          field: "height",
          value: inches,
          state: getState()
        });
      });
    }

    if (hoursSelect) {
      hoursSelect.addEventListener("change", function () {
        state.hours = hoursSelect.value || null;
        emit(root, "rt:profilechange", {
          field: "hours",
          value: state.hours,
          state: getState()
        });
      });
    }

    if (workSelect) {
      workSelect.addEventListener("change", function () {
        state.work = workSelect.value || null;
        emit(root, "rt:profilechange", {
          field: "work",
          value: state.work,
          state: getState()
        });
      });
    }
  }


  /* =========================================================================
     8. MODULE: STEP 2 CALCULATION ENGINE — Ergo Budget Ratio™, CPCH, Posture Risk
     -------------------------------------------------------------------------
     Everything in this section is PURE: it takes plain values, returns plain
     objects, and never touches the DOM. That keeps it unit-testable in
     isolation and reusable by Step 3 without loading the widget.
     No AEO copy and no affiliate logic lives here — by design.
     ========================================================================= */

  /* ---- 8.1 Configuration ------------------------------------------------- */

  /** Baseline split. Must sum to 1.0 (asserted by the test suite). */
  var ALLOCATION_BASE = {
    chair: 0.35,
    desk: 0.25,
    monitor: 0.2,
    keyboard: 0.1,
    lighting: 0.05,
    cables: 0.05
  };

  /** Canonical key order — output objects always come back in this order. */
  var ALLOCATION_KEYS = ["chair", "desk", "monitor", "keyboard", "lighting", "cables"];

  /** No category may fall below 1 % of the budget. */
  var ALLOCATION_FLOOR = 0.01;

  /** Additive pain-point modifiers (applied cumulatively, in any order). */
  var PAIN_MODIFIERS = {
    "lower-back": { chair: 0.05, desk: 0.02, keyboard: -0.02, lighting: -0.02, cables: -0.03 },
    "neck-shoulder": { monitor: 0.06, chair: 0.02, desk: -0.03, keyboard: -0.02, cables: -0.03 },
    "wrist-hand": { keyboard: 0.06, desk: 0.01, chair: -0.02, lighting: -0.02, cables: -0.03 }
  };

  /** Additive modifiers keyed by canonical hours value. */
  var HOURS_MODIFIERS = {
    "8+": { chair: 0.03, desk: 0.02, cables: -0.05 }
  };

  /** Additive modifiers keyed by the Step 1 work value. */
  var WORK_MODIFIERS = {
    "video-editing": { monitor: 0.06, lighting: 0.02, cables: -0.04, desk: -0.04 }
  };

  /**
   * Hours vocabulary. Step 1 ships `lt4 | 4to6 | 6to8 | 8plus`; the Step 2 spec
   * speaks `under-4 | 4-6 | 6-8 | 8+`. Both are accepted everywhere, so neither
   * layer has to rename the other's values.
   *   hours   → divisor used by CPCH
   *   penalty → posture-risk contribution
   */
  var HOURS_PROFILE = {
    "under-4": { canonical: "under-4", hours: 3, penalty: 0, aliases: ["lt4"] },
    "4-6": { canonical: "4-6", hours: 5, penalty: 1, aliases: ["4to6"] },
    "6-8": { canonical: "6-8", hours: 7, penalty: 2, aliases: ["6to8"] },
    "8+": { canonical: "8+", hours: 9, penalty: 3, aliases: ["8plus"] }
  };

  /** Days used by CPCH: 365 days × 5 working days per week. */
  var CPCH_DAYS = 365;
  var CPCH_WORKDAYS_PER_WEEK = 5;

  /** Chair-spend penalties for the posture model (first match wins). */
  var CHAIR_RISK_TIERS = [
    { below: 150, points: 4 },
    { below: 250, points: 2 },
    { below: 400, points: 1 }
  ];

  /**
   * Setup tiers by total budget. Bands are half-open [min, next.min) and the
   * last entry catches everything above, so exactly 3000 lands in Studio
   * instead of falling through a "> 3000" gap.
   */
  var SETUP_TIERS = [
    { min: 0, key: "starter", label: "\uD83C\uDF31 Starter", note: "Essentials-first build" },
    { min: 700, key: "balanced", label: "\u2696\uFE0F Balanced", note: "Solid mid-range build" },
    { min: 1600, key: "pro", label: "\uD83D\uDE80 Pro", note: "Serious workstation" },
    { min: 3000, key: "studio", label: "\uD83C\uDFC6 Studio", note: "Full studio build" }
  ];

  /** Total score → risk band. Max possible score is 4 + 3 + 3 = 10. */
  var RISK_BANDS = [
    { max: 2, level: "low", label: "\uD83D\uDFE2 Low" },
    { max: 5, level: "moderate", label: "\uD83D\uDFE1 Moderate" },
    { max: Infinity, level: "high", label: "\uD83D\uDD34 High" }
  ];

  /* ---- 8.2 Shared helpers ------------------------------------------------ */

  /**
   * Resolve any accepted hours value to its profile entry.
   * @param  {string|null} value e.g. "6to8", "6-8", "8plus", "8+"
   * @return {{canonical:string, hours:number, penalty:number}|null}
   */
  function resolveHours(value) {
    if (value === null || value === undefined) return null;
    var needle = String(value).trim().toLowerCase();
    if (!needle) return null;

    var keys = Object.keys(HOURS_PROFILE);
    for (var i = 0; i < keys.length; i++) {
      var entry = HOURS_PROFILE[keys[i]];
      if (entry.canonical === needle) return entry;
      if (entry.aliases.indexOf(needle) !== -1) return entry;
    }
    return null;
  }

  /**
   * Water-filling normaliser: enforce a floor on every weight, then scale so the
   * set sums to exactly 1. Keys pushed to the floor are locked and the remaining
   * weight is redistributed among the rest — plain "clamp then divide" would
   * drop locked keys back below the floor.
   *
   * @param  {Object<string,number>} weights raw (may be negative)
   * @param  {number} [floor=0.01]
   * @param  {number} [decimals=4]
   * @return {Object<string,number>} sums to 1 (±1e-9), every value ≥ floor
   */
  function normalizeAllocation(weights, floor, decimals) {
    var min = floor === undefined ? ALLOCATION_FLOOR : floor;
    var dp = decimals === undefined ? 4 : decimals;
    var keys = ALLOCATION_KEYS;

    var values = {};
    var locked = {};
    var anyFree = false;

    keys.forEach(function (key) {
      var raw = Number(weights[key]);
      if (!isFinite(raw)) raw = 0;
      if (raw <= min) {
        values[key] = min; // pinned at (or from below) the floor
        locked[key] = true;
      } else {
        values[key] = raw;
        anyFree = true;
      }
    });

    // Degenerate input (everything at/below the floor): split evenly instead of
    // returning a set that cannot sum to 1.
    if (!anyFree) {
      keys.forEach(function (key) {
        values[key] = round(1 / keys.length, dp);
      });
      return rebalanceResidual(values, keys, dp);
    }

    // Iteratively rescale the free keys until none of them dips under the floor.
    for (var pass = 0; pass < 24; pass++) {
      var lockedSum = 0;
      var freeSum = 0;
      keys.forEach(function (key) {
        if (locked[key]) lockedSum += values[key];
        else freeSum += values[key];
      });

      var target = 1 - lockedSum; // weight the free keys must occupy
      if (freeSum <= 0 || target <= 0) break;

      var scale = target / freeSum;
      var newlyLocked = false;

      keys.forEach(function (key) {
        if (locked[key]) return;
        values[key] *= scale;
        if (values[key] < min) {
          values[key] = min;
          locked[key] = true;
          newlyLocked = true;
        }
      });

      if (!newlyLocked) break;
    }

    keys.forEach(function (key) {
      values[key] = round(values[key], dp);
    });

    return rebalanceResidual(values, keys, dp);
  }

  /**
   * Rounding leaves a few hundred-thousandths of drift; absorb it into the
   * largest bucket so the public contract "sums to exactly 1.0" holds.
   */
  function rebalanceResidual(values, keys, dp) {
    var sum = 0;
    var largestKey = keys[0];

    keys.forEach(function (key) {
      sum += values[key];
      if (values[key] > values[largestKey]) largestKey = key;
    });

    var residual = round(1 - sum, dp);
    if (residual !== 0) {
      values[largestKey] = round(values[largestKey] + residual, dp);
    }
    return values;
  }

  /* ---- 8.3 Ergo Budget Ratio™ -------------------------------------------- */

  /**
   * Turn a Step 1 state into a normalised budget split.
   *
   * Order of operations: base → pain modifiers → hours modifier → work
   * modifier → floor + normalise. Modifiers are additive, so the order they
   * are added in does not matter.
   *
   * @param  {{pains?:string[], hours?:string|null, work?:string|null}} input
   * @return {{chair:number, desk:number, monitor:number, keyboard:number,
   *           lighting:number, cables:number}} ratios summing to 1
   */
  function calculateAllocation(input) {
    var source = input || {};
    var pains = Array.isArray(source.pains) ? source.pains : [];

    // Start from a fresh copy of the baseline.
    var weights = {};
    ALLOCATION_KEYS.forEach(function (key) {
      weights[key] = ALLOCATION_BASE[key];
    });

    function apply(modifiers) {
      if (!modifiers) return;
      Object.keys(modifiers).forEach(function (key) {
        if (weights[key] === undefined) return;
        weights[key] += modifiers[key];
      });
    }

    // Pain modifiers — "no-pain" carries none, so it is skipped naturally.
    pains.forEach(function (pain) {
      apply(PAIN_MODIFIERS[pain]);
    });

    // Hours modifier — matched through the canonical value ("8plus" → "8+").
    var hours = resolveHours(source.hours);
    if (hours) apply(HOURS_MODIFIERS[hours.canonical]);

    // Work modifier.
    if (source.work) apply(WORK_MODIFIERS[String(source.work).toLowerCase()]);

    return normalizeAllocation(weights);
  }

  /**
   * Convert a ratio split into actual money, rounded to whole currency units
   * with the rounding drift absorbed by the largest line so the amounts still
   * sum to the budget exactly.
   *
   * @param  {number} budget
   * @param  {Object<string,number>} allocation
   * @return {Object<string,number>} amounts keyed like the allocation
   */
  function allocateAmounts(budget, allocation) {
    var total = Number(budget);
    var amounts = {};
    var runningSum = 0;
    var largestKey = ALLOCATION_KEYS[0];

    ALLOCATION_KEYS.forEach(function (key) {
      var amount = Math.round(total * (allocation[key] || 0));
      amounts[key] = amount;
      runningSum += amount;
      if (amount > amounts[largestKey]) largestKey = key;
    });

    // Absorb integer-rounding drift (a few units at most) on the largest line.
    if (runningSum !== total && amounts[largestKey] !== undefined) {
      amounts[largestKey] += Math.round(total - runningSum);
    }
    return amounts;
  }

  /* ---- 8.4 CPCH — Cost-Per-Comfort-Hour™ --------------------------------- */

  /**
   * Raw (unformatted) cost per comfort hour.
   *   CPCH = budget / (hours per day × 365 × 5 working days)
   *
   * @param  {number} budget
   * @param  {string|null} hoursValue
   * @return {number|null} null when the inputs cannot produce a figure
   */
  function calculateCPCHValue(budget, hoursValue) {
    var total = Number(budget);
    if (!isFinite(total) || total <= 0) return null;

    var hours = resolveHours(hoursValue);
    if (!hours) return null; // no hours chosen yet → nothing honest to show

    var denominator = hours.hours * CPCH_DAYS * CPCH_WORKDAYS_PER_WEEK;
    if (denominator <= 0) return null;

    return total / denominator;
  }

  /**
   * Currency-formatted CPCH, e.g. "$0.08".
   * Falls back to a third decimal for very small figures so the result never
   * reads as a useless "$0.00".
   *
   * @param  {number} budget
   * @param  {string|null} hoursValue
   * @param  {string} [currency="USD"]
   * @return {string|null}
   */
  function calculateCPCH(budget, hoursValue, currency) {
    var value = calculateCPCHValue(budget, hoursValue);
    if (value === null) return null;

    var code = CURRENCIES[currency] ? currency : DEFAULT_CURRENCY;
    var symbol = CURRENCIES[code].symbol;
    var decimals = value < 0.01 ? 3 : 2;

    return symbol + value.toFixed(decimals);
  }

  /* ---- 8.5 Posture Risk -------------------------------------------------- */

  /**
   * Raw posture-risk score. Exposed separately so Step 3 can explain *why* a
   * band was reached without re-deriving it.
   *
   * @param  {number} chairAmount   money allocated to the chair
   * @param  {string|null} hoursValue
   * @param  {string[]} pains
   * @return {{score:number, chairPoints:number, hoursPoints:number, painPoints:number}}
   */
  function calculatePostureRiskScore(chairAmount, hoursValue, pains) {
    var chair = Number(chairAmount);
    if (!isFinite(chair)) chair = 0;

    // Chair spend: the first tier the amount falls under wins (tiered, not
    // cumulative — cumulative scoring would double-penalise a cheap chair).
    var chairPoints = 0;
    for (var i = 0; i < CHAIR_RISK_TIERS.length; i++) {
      if (chair < CHAIR_RISK_TIERS[i].below) {
        chairPoints = CHAIR_RISK_TIERS[i].points;
        break;
      }
    }

    var hours = resolveHours(hoursValue);
    var hoursPoints = hours ? hours.penalty : 0;

    // Count distinct pain points, ignoring the preventive "no-pain" option.
    var seen = {};
    var painPoints = 0;
    (Array.isArray(pains) ? pains : []).forEach(function (pain) {
      if (pain === "no-pain" || seen[pain]) return;
      seen[pain] = true;
      painPoints += 1;
    });

    return {
      score: chairPoints + hoursPoints + painPoints,
      chairPoints: chairPoints,
      hoursPoints: hoursPoints,
      painPoints: painPoints
    };
  }

  /**
   * Classify posture risk for display.
   * @return {{level:string, label:string}}
   */
  function calculatePostureRisk(chairAmount, hoursValue, pains) {
    var score = calculatePostureRiskScore(chairAmount, hoursValue, pains).score;

    for (var i = 0; i < RISK_BANDS.length; i++) {
      if (score <= RISK_BANDS[i].max) {
        return { level: RISK_BANDS[i].level, label: RISK_BANDS[i].label };
      }
    }
    return { level: "high", label: "\uD83D\uDD34 High" }; // unreachable safeguard
  }

  /* ---- 8.6 Setup tier ---------------------------------------------------- */

  /**
   * Classify a total budget into a setup tier.
   * @param  {number} budget
   * @return {{key:string, label:string, note:string}}
   */
  function calculateSetupTier(budget) {
    var total = Number(budget);
    if (!isFinite(total)) total = 0;

    var match = SETUP_TIERS[0];
    for (var i = 0; i < SETUP_TIERS.length; i++) {
      if (total >= SETUP_TIERS[i].min) match = SETUP_TIERS[i];
    }
    return { key: match.key, label: match.label, note: match.note };
  }

  /* ---- 8.7 Display helpers (pure) ---------------------------------------- */

  /**
   * Integer percentages that sum to exactly 100 (largest-remainder method).
   * Rounding each ratio independently would print "34% 26% 20% 10% 5% 5%" = 100
   * here, but neighbouring states can total 99 or 101 and look broken.
   *
   * @param  {Object<string,number>} allocation
   * @return {Object<string,number>} integer percentages keyed by category
   */
  function toDisplayPercentages(allocation) {
    var keys = ALLOCATION_KEYS;
    var raw = {};
    var floored = {};
    var total = 0;
    var largestKey = keys[0];

    keys.forEach(function (key) {
      var ratio = Number(allocation[key]) || 0;
      raw[key] = ratio * 100;
      floored[key] = Math.floor(raw[key]);
      total += floored[key];
      if (raw[key] > raw[largestKey]) largestKey = key;
    });

    var remainder = 100 - total; // 0..5 in practice
    if (remainder !== 0) {
      // Hand the leftover units to the biggest fractional parts first.
      var order = keys.slice().sort(function (a, b) {
        return (raw[b] - floored[b]) - (raw[a] - floored[a]);
      });
      for (var i = 0; i < order.length && remainder > 0; i++, remainder--) {
        floored[order[i]] += 1;
      }
      // Pathological fallback: not enough fractional parts to distribute.
      if (remainder > 0) floored[largestKey] += remainder;
    }

    return floored;
  }

  /** Format money for display: currency symbol + grouped whole units. */
  function formatMoney(amount, currency) {
    var code = CURRENCIES[currency] ? currency : DEFAULT_CURRENCY;
    return CURRENCIES[code].symbol + formatAmount(Math.round(Number(amount) || 0), code);
  }

  /* ---- 8.8 Step 2 aggregation + UI hook ---------------------------------- */

  /**
   * Run the whole Step 2 pipeline for a state snapshot.
   * Pure: no DOM, no logging, no events — so tests and Step 3 can call it.
   *
   * @param  {Object} [snapshot] state-like object; defaults to live state
   * @return {{allocation:Object, amounts:Object, chairAmount:number,
   *           budget:number, currency:string, cpch:string|null,
   *           cpchValue:number|null, risk:Object, riskScore:Object}}
   */
  function computeStep2(snapshot) {
    var data = snapshot || getState();
    var budget = Number(data.budget) || 0;
    var currency = CURRENCIES[data.currency] ? data.currency : DEFAULT_CURRENCY;
    var pains = Array.isArray(data.pains) ? data.pains : [];

    var allocation = calculateAllocation({
      pains: pains,
      hours: data.hours,
      work: data.work
    });

    var amounts = allocateAmounts(budget, allocation);
    var cpchValue = calculateCPCHValue(budget, data.hours);

    return {
      budget: budget,
      currency: currency,
      hours: data.hours,
      pains: pains.slice(),
      allocation: allocation,
      amounts: amounts,
      chairAmount: amounts.chair,
      cpch: calculateCPCH(budget, data.hours, currency),
      cpchValue: cpchValue,
      risk: calculatePostureRisk(amounts.chair, data.hours, pains),
      riskScore: calculatePostureRiskScore(amounts.chair, data.hours, pains)
    };
  }

  /**
   * Render a computed Step 2 result into the #rt-slot-budget panel.
   * Pure DOM writing — no math, no state mutation.
   *
   * @param {Object} result  output of computeStep2()
   * @param {Object} refs    cached element references from init
   */
  function renderStep2UI(result, refs) {
    if (!refs) return;

    var currency = result.currency;
    var percentages = toDisplayPercentages(result.allocation);

    /* ---- allocation rows ---- */
    refs.rows.forEach(function (row) {
      var key = row.getAttribute("data-category");
      var ratio = result.allocation[key];
      var amount = result.amounts[key];
      if (ratio === undefined) return;

      var percent = percentages[key];
      var money = formatMoney(amount, currency);
      var label = row.querySelector(SELECTOR.allocLabel);
      var labelText = label ? label.textContent : key;

      // Exact ratio for the bar (keeps sub-1% differences visible)…
      var bar = row.querySelector(SELECTOR.allocBar);
      if (bar) bar.style.setProperty("--rt-alloc", (ratio * 100).toFixed(2) + "%");

      // …integer percentage for the readable label, so the column sums to 100.
      var pct = row.querySelector(SELECTOR.allocPct);
      if (pct) pct.textContent = percent + "%";

      var amountEl = row.querySelector(SELECTOR.allocAmount);
      if (amountEl) amountEl.textContent = money;

      var track = row.querySelector(SELECTOR.allocTrack);
      if (track) {
        track.setAttribute("aria-valuenow", String(percent));
        track.setAttribute("aria-valuetext", labelText + " " + percent + " percent, " + money);
      }
    });

    /* ---- total ---- */
    if (refs.total) refs.total.textContent = formatMoney(result.budget, currency);

    /* ---- chip: CPCH ---- */
    if (refs.cpch) {
      var hours = resolveHours(result.hours);
      if (result.cpch === null) {
        refs.cpch.textContent = "\u2014";
        setTone(refs.cpch, "muted");
        if (refs.cpchNote) refs.cpchNote.textContent = "Choose desk hours to unlock";
      } else {
        refs.cpch.textContent = result.cpch + "/hr";
        setTone(refs.cpch, "positive");
        if (refs.cpchNote) {
          refs.cpchNote.textContent = hours
            ? hours.hours + " hrs/day \u00D7 365 \u00D7 5 working days"
            : "Per comfort hour, amortised over 5 years";
        }
      }
    }

    /* ---- chip: posture risk ---- */
    if (refs.risk) {
      refs.risk.textContent = result.risk.label;
      setTone(
        refs.risk,
        result.risk.level === "low"
          ? "positive"
          : result.risk.level === "moderate"
          ? "caution"
          : "danger"
      );
      if (refs.riskNote) refs.riskNote.textContent = describeRisk(result.riskScore);
    }

    /* ---- chip: setup tier ---- */
    var tier = calculateSetupTier(result.budget);
    if (refs.tier) {
      refs.tier.textContent = tier.label;
      setTone(refs.tier, "neutral");
    }
    if (refs.tierNote) refs.tierNote.textContent = tier.note;

    /* ---- expose for styling hooks ---- */
    if (refs.preview) {
      refs.preview.setAttribute("data-currency", currency);
      refs.preview.setAttribute("data-tier", tier.key);
      refs.preview.setAttribute("data-risk", result.risk.level);
    }
  }

  /** Colour the chip value via its parent's data-tone attribute. */
  function setTone(el, tone) {
    var chip = el.closest ? el.closest(".rt-chip") : null;
    if (chip) chip.setAttribute("data-tone", tone);
  }

  /** Human sentence explaining what pushed the risk score up. */
  function describeRisk(score) {
    var causes = [];
    if (score.chairPoints > 0) causes.push("chair spend");
    if (score.hoursPoints > 0) causes.push("long desk hours");
    if (score.painPoints > 0) {
      causes.push(score.painPoints === 1 ? "1 pain point" : score.painPoints + " pain points");
    }
    if (!causes.length) return "No risk factors detected";
    return "Driven by " + causes.join(" \u00B7 ");
  }

  /**
   * Step 2 UI hook. Reads live state, runs the engine, paints the panel, and
   * publishes `rt:step2update`. Console output is opt-in via RT_Calculator.debug.
   *
   * @return {Object} the computed snapshot (handy in tests / console)
   */
  function updateStep2UI() {
    var result = computeStep2();

    renderStep2UI(result, step2Refs);

    if (RT_Calculator && RT_Calculator.debug) logStep2(result);

    var root = document.querySelector(SELECTOR.root);
    if (root) emit(root, "rt:step2update", result);

    return result;
  }

  /** Opt-in console dump (RT_Calculator.debug = true). */
  function logStep2(result) {
    if (!window.console) return;

    var cpchText = result.cpch === null ? "(pick daily hours)" : result.cpch;
    if (typeof window.console.groupCollapsed === "function") {
      window.console.groupCollapsed(
        "[RT] Step 2 \u2014 " + result.currency + " " + formatAmount(result.budget, result.currency)
      );
      window.console.log("Allocation:", result.allocation);
      window.console.log("Amounts:", result.amounts);
      window.console.log("CPCH:", cpchText);
      window.console.log("Posture risk:", result.risk.label, result.riskScore);
      window.console.log("Setup tier:", calculateSetupTier(result.budget).label);
      window.console.groupEnd();
    } else {
      window.console.log("[RT] Step 2", result);
    }
  }

  /* ---- 8.9 Cached Step 2 element references ------------------------------ */

  /** Filled during init(); renderStep2UI() is a no-op until then. */
  var step2Refs = null;

  /** Cache the Step 2 DOM once, so re-renders never re-query the document. */
  function cacheStep2Refs(root) {
    var preview = root.querySelector(SELECTOR.preview);
    if (!preview) return null;

    return {
      preview: preview,
      rows: Array.prototype.slice.call(
        preview.querySelectorAll(SELECTOR.allocRow)
      ),
      total: preview.querySelector(SELECTOR.allocTotal),
      cpch: preview.querySelector(SELECTOR.metricCPCH),
      cpchNote: preview.querySelector(SELECTOR.metricCPCHNote),
      risk: preview.querySelector(SELECTOR.metricRisk),
      riskNote: preview.querySelector(SELECTOR.metricRiskNote),
      tier: preview.querySelector(SELECTOR.metricTier),
      tierNote: preview.querySelector(SELECTOR.metricTierNote)
    };
  }

  /* =========================================================================
     9. Bootstrap
     ========================================================================= */

  function init() {
    var root = document.querySelector(SELECTOR.root);
    if (!root) return false; // script loaded on a page without the widget
    if (root.getAttribute("data-rt-ready") === "true") return true; // idempotent

    var range = root.querySelector(SELECTOR.range);
    var amountInput = root.querySelector(SELECTOR.amount);
    if (!range || !amountInput) return false; // markup not injected yet

    var ctx = {
      root: root,
      range: range,
      amountInput: amountInput,
      displayValue: root.querySelector(SELECTOR.displayValue),
      currencyInputs: root.querySelectorAll(SELECTOR.currencyInput),
      scaleMin: root.querySelector(SELECTOR.scaleMin),
      scaleMax: root.querySelector(SELECTOR.scaleMax),
      heightSelect: root.querySelector(SELECTOR.height),
      hoursSelect: root.querySelector(SELECTOR.hours),
      workSelect: root.querySelector(SELECTOR.work)
    };

    // Cache Step 2 refs first: Step 1's init emits events, and those listeners
    // render the panel.
    step2Refs = cacheStep2Refs(root);

    initBudget(ctx);
    initProfile(ctx);
    initPainPoints(ctx);

    // Step 2 recomputes whenever a Step 1 input changes. Subscribing to the
    // public events (rather than editing Step 1's handlers) keeps the two
    // modules decoupled: Step 3 can listen the same way.
    ["rt:budgetchange", "rt:currencychange", "rt:painschange", "rt:profilechange"]
      .forEach(function (type) {
        root.addEventListener(type, function () {
          updateStep2UI();
        });
      });

    updateStep2UI(); // first paint

    root.setAttribute("data-rt-ready", "true");
    return true;
  }

  /* =========================================================================
     10. Public namespace
     ========================================================================= */

  var RT_Calculator = (window.RT_Calculator = window.RT_Calculator || {});

  RT_Calculator.version = "0.5.0";
  RT_Calculator.getState = getState;

  // Step 1
  RT_Calculator.calculateErgonomicHeights = calculateErgonomicHeights;
  RT_Calculator.parseHeightToInches = parseHeightToInches;

  // Step 2 — pure, DOM-free
  RT_Calculator.calculateAllocation = calculateAllocation;
  RT_Calculator.allocateAmounts = allocateAmounts;
  RT_Calculator.calculateCPCH = calculateCPCH;
  RT_Calculator.calculateCPCHValue = calculateCPCHValue;
  RT_Calculator.calculatePostureRisk = calculatePostureRisk;
  RT_Calculator.calculatePostureRiskScore = calculatePostureRiskScore;
  RT_Calculator.computeStep2 = computeStep2;
  RT_Calculator.calculateSetupTier = calculateSetupTier;
  RT_Calculator.toDisplayPercentages = toDisplayPercentages;

  // Step 2 UI hook
  RT_Calculator.updateStep2UI = updateStep2UI;

  /** Set true to restore the console dump. Off by default: the UI is the output. */
  RT_Calculator.debug = false;

  RT_Calculator.currencies = CURRENCIES;
  RT_Calculator.hoursProfile = HOURS_PROFILE;
  RT_Calculator.allocationBase = ALLOCATION_BASE;
  RT_Calculator.init = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
