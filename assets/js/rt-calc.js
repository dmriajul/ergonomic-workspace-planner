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
 *  .init()                         → idempotent manual (re)initialisation
 *  .version
 *
 * Events (bubbling CustomEvents dispatched on the .rt-calc root)
 *  rt:budgetchange   detail: { budget, currency }
 *  rt:currencychange detail: { currency, budget }
 *  rt:painschange    detail: { pains: string[] }
 *  rt:profilechange  detail: { field, value, state }
 *  rt:heightchange   detail: { inches, metrics }
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
    pain: 'input[name="rt-pain"]'
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
     8. Bootstrap
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

    initBudget(ctx);
    initProfile(ctx);
    initPainPoints(ctx);

    root.setAttribute("data-rt-ready", "true");
    return true;
  }

  /* =========================================================================
     9. Public namespace
     ========================================================================= */

  var RT_Calculator = (window.RT_Calculator = window.RT_Calculator || {});

  RT_Calculator.version = "0.3.0";
  RT_Calculator.getState = getState;
  RT_Calculator.calculateErgonomicHeights = calculateErgonomicHeights;
  RT_Calculator.parseHeightToInches = parseHeightToInches;
  RT_Calculator.currencies = CURRENCIES;
  RT_Calculator.init = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
