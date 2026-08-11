/**
 * WASI Transfer — shared pricing core.
 *
 * Single source of truth for the transfer product. Loaded by BOTH:
 *   - wasi-dex/wasi-transfer-app.html  (WASI Transfer Mobile)
 *   - index.html                        (DEX → Transfert WASI panel)
 *
 * Any change to tiers, rates or quote math must happen here so the two
 * surfaces can never quote a customer different numbers.
 *
 * Quote math (do not "simplify" — it defines the product's pricing):
 *   fee      = send × tier.feePct           (taken off the send amount)
 *   delivered= (send − fee) × sendRate × (1 − tier.fxPct)   in XOF
 *   received = delivered / receiveRate
 * Worked example: 200 EUR → XOF, Growth tier (1.00% + 0.40%)
 *   fee 2 EUR → 198 × 655.957 = 129 879.5 → ×0.996 = 129 360 XOF
 */
(function (global) {
  'use strict';

  // Reference rates: XOF per 1 unit of currency. Overridden by live FX
  // when data/market-live.json is available (see applyLiveRates).
  var SEND_RATES_XOF = {
    EUR: 655.957, // fixed BCEAO peg
    USD: 615.0,
    GBP: 782.0,
    CAD: 455.0
  };

  var RECEIVE_RATES_XOF = {
    XOF: 1,
    XAF: 1, // XOF/XAF parity
    NGN: 0.389,
    GHS: 39.7,
    KES: 4.77,
    ZAR: 33.8
  };

  // Fee tiers keyed on the send amount, in the send currency.
  var PRICING_TIERS = [
    { min: 0,    max: 199,                      feePct: 0.012, fxPct: 0.004, label: 'Starter' },
    { min: 200,  max: 999,                      feePct: 0.010, fxPct: 0.004, label: 'Growth'  },
    { min: 1000, max: Number.POSITIVE_INFINITY, feePct: 0.008, fxPct: 0.004, label: 'Pro'     }
  ];

  // All-in cost of the closest comparable operator, used for the savings line.
  var WAVE_BENCHMARK = 0.02;

  var SEND_CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD'];

  var RECEIVE_CURRENCIES = [
    { code: 'XOF', label: 'XOF - UEMOA' },
    { code: 'XAF', label: 'XAF - CEMAC' },
    { code: 'NGN', label: 'NGN - Nigeria' },
    { code: 'GHS', label: 'GHS - Ghana' },
    { code: 'KES', label: 'KES - Kenya' },
    { code: 'ZAR', label: 'ZAR - Afrique du Sud' }
  ];

  var SEND_COUNTRIES = [
    { code: 'FR', label: 'France' },
    { code: 'CA', label: 'Canada' },
    { code: 'UK', label: 'Royaume-Uni' },
    { code: 'US', label: 'États-Unis' }
  ];

  var CHANNELS = [
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank',         label: 'Compte bancaire' },
    { value: 'cash',         label: 'Retrait cash partenaire' }
  ];

  var PAY_METHODS = [
    { value: 'card',          label: 'Carte bancaire' },
    { value: 'bank_transfer', label: 'Virement bancaire' },
    { value: 'wallet',        label: 'Wallet WASI' }
  ];

  var CHECKOUT_STEPS = [
    { key: 'kyc',         title: 'Étape 1 · Vérification identité' },
    { key: 'beneficiary', title: 'Étape 2 · Bénéficiaire' },
    { key: 'payment',     title: 'Étape 3 · Paiement' }
  ];

  var AMOUNT_CHIPS = [50, 200, 500, 1000];

  var rateSource = 'Taux de référence';

  function getTier(amount) {
    var value = isFinite(amount) ? amount : 0;
    for (var i = 0; i < PRICING_TIERS.length; i++) {
      if (value >= PRICING_TIERS[i].min && value <= PRICING_TIERS[i].max) return PRICING_TIERS[i];
    }
    return PRICING_TIERS[0];
  }

  /**
   * Overlay live FX from data/market-live.json (fx.pairs holds "<CUR>/XOF"
   * → XOF per unit, the same semantics as our rate tables). XOF and XAF
   * stay pegged. Returns the number of rates replaced.
   */
  function applyLiveRates(marketLive) {
    var pairs = marketLive && marketLive.fx && marketLive.fx.pairs;
    if (!pairs) return 0;
    var n = 0;
    Object.keys(SEND_RATES_XOF).forEach(function (cur) {
      if (cur === 'EUR') return; // pegged to XOF — never override
      var mid = pairs[cur + '/XOF'];
      if (mid) { SEND_RATES_XOF[cur] = mid; n++; }
    });
    Object.keys(RECEIVE_RATES_XOF).forEach(function (cur) {
      if (cur === 'XOF' || cur === 'XAF') return; // peg / parity
      var mid = pairs[cur + '/XOF'];
      if (mid) { RECEIVE_RATES_XOF[cur] = mid; n++; }
    });
    if (n) {
      var d = marketLive.fetchedAt ? new Date(marketLive.fetchedAt) : null;
      rateSource = 'Taux du ' + (d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '?');
    }
    return n;
  }

  /** Fetch market-live.json and apply it. Safe to call from any page depth. */
  function loadLiveRates(basePath) {
    var url = (basePath || '') + 'data/market-live.json?v=' + Date.now();
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j ? applyLiveRates(j) : 0; })
      .catch(function () { return 0; });
  }

  /**
   * Price a transfer. Returns null when the inputs cannot be priced.
   * @param {{sendAmount:number, sendCurrency:string, receiveCurrency:string}} input
   */
  function quote(input) {
    var sendAmount = parseFloat(input && input.sendAmount);
    var sendCurrency = input && input.sendCurrency;
    var receiveCurrency = input && input.receiveCurrency;

    if (!isFinite(sendAmount) || sendAmount <= 0) return null;
    var sendRateXof = SEND_RATES_XOF[sendCurrency];
    var receiveRateXof = RECEIVE_RATES_XOF[receiveCurrency];
    if (!sendRateXof || !receiveRateXof) return null;

    var tier = getTier(sendAmount);
    var feeAmount = sendAmount * tier.feePct;
    var netAmount = sendAmount - feeAmount;

    var grossXof = sendAmount * sendRateXof;
    var deliveredXof = netAmount * sendRateXof * (1 - tier.fxPct);
    var receiveAmount = deliveredXof / receiveRateXof;

    var midRate = sendRateXof / receiveRateXof;
    var appliedRate = midRate * (1 - tier.fxPct);
    var effectivePct = tier.feePct + tier.fxPct;

    return {
      sendAmount: sendAmount,
      sendCurrency: sendCurrency,
      receiveCurrency: receiveCurrency,
      tier: tier,
      feeAmount: feeAmount,
      receiveAmount: receiveAmount,
      midRate: midRate,
      appliedRate: appliedRate,
      effectivePct: effectivePct,
      waveReceive: (grossXof * (1 - WAVE_BENCHMARK)) / receiveRateXof,
      savedVsWave: ((deliveredXof / receiveRateXof) - (grossXof * (1 - WAVE_BENCHMARK)) / receiveRateXof)
    };
  }

  // ── Shared formatters, so both surfaces render numbers identically ──
  // Format kept identical to the shipped mobile app: "1,40%" (no space).
  function toPct(value) { return (value * 100).toFixed(2).replace('.', ',') + '%'; }

  function formatAmount(value, currency) {
    if (!isFinite(value)) return '-';
    var noDecimals = currency === 'XOF' || currency === 'XAF' || currency === 'NGN';
    return value.toLocaleString('fr-FR', {
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2
    });
  }

  function formatRate(rate) {
    if (!isFinite(rate)) return '-';
    var digits = rate >= 100 ? 2 : rate >= 1 ? 4 : 6;
    return rate.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function channelLabel(v) {
    for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].value === v) return CHANNELS[i].label;
    return v || '';
  }
  function payMethodLabel(v) {
    for (var i = 0; i < PAY_METHODS.length; i++) if (PAY_METHODS[i].value === v) return PAY_METHODS[i].label;
    return v || '';
  }

  global.WasiTransferCore = {
    SEND_RATES_XOF: SEND_RATES_XOF,
    RECEIVE_RATES_XOF: RECEIVE_RATES_XOF,
    PRICING_TIERS: PRICING_TIERS,
    WAVE_BENCHMARK: WAVE_BENCHMARK,
    SEND_CURRENCIES: SEND_CURRENCIES,
    RECEIVE_CURRENCIES: RECEIVE_CURRENCIES,
    SEND_COUNTRIES: SEND_COUNTRIES,
    CHANNELS: CHANNELS,
    PAY_METHODS: PAY_METHODS,
    CHECKOUT_STEPS: CHECKOUT_STEPS,
    AMOUNT_CHIPS: AMOUNT_CHIPS,
    getTier: getTier,
    quote: quote,
    applyLiveRates: applyLiveRates,
    loadLiveRates: loadLiveRates,
    toPct: toPct,
    formatAmount: formatAmount,
    formatRate: formatRate,
    channelLabel: channelLabel,
    payMethodLabel: payMethodLabel,
    rateSourceLabel: function () { return rateSource; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
