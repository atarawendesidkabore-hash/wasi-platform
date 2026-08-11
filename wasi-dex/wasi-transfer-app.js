/* Pricing tiers, FX rates and the quote formula live in the shared core
   (../wasi-transfer-core.js). The DEX panel in index.html loads the same
   module, so both surfaces always quote a customer identical numbers.
   Never re-declare tiers or rates here. */
const CORE = window.WasiTransferCore;
if (!CORE) {
    console.error("wasi-transfer-core.js est introuvable — la tarification ne peut pas démarrer.");
}

const PRICING_TIERS = CORE ? CORE.PRICING_TIERS : [];
const WAVE_BENCHMARK = CORE ? CORE.WAVE_BENCHMARK : 0.02;

const els = {
    amount: document.getElementById("send-amount"),
    sendCurrency: document.getElementById("send-currency"),
    receiveCurrency: document.getElementById("receive-currency"),
    receiveAmount: document.getElementById("receive-amount"),
    corridorRate: document.getElementById("corridor-rate"),
    breakdown: document.getElementById("breakdown"),
    tierLabel: document.getElementById("pricing-tier-label"),
    pricingGrid: document.getElementById("pricing-grid"),
    overlay: document.getElementById("checkout-overlay"),
    sheet: document.getElementById("checkout-sheet"),
    sheetTitle: document.getElementById("sheet-title"),
    stepProgress: document.getElementById("step-progress"),
    sheetClose: document.getElementById("sheet-close"),
    sheetPrev: document.getElementById("sheet-prev"),
    sheetNext: document.getElementById("sheet-next"),
    stepKyc: document.getElementById("step-kyc"),
    stepBeneficiary: document.getElementById("step-beneficiary"),
    stepPayment: document.getElementById("step-payment"),
    checkoutSummary: document.getElementById("checkout-summary"),
    kycFullname: document.getElementById("kyc-fullname"),
    kycId: document.getElementById("kyc-id"),
    kycCountry: document.getElementById("kyc-country"),
    bfName: document.getElementById("bf-name"),
    bfPhone: document.getElementById("bf-phone"),
    bfChannel: document.getElementById("bf-channel"),
    payMethod: document.getElementById("pay-method"),
    confirmRisk: document.getElementById("confirm-risk"),
    chips: Array.from(document.querySelectorAll(".chip")),
    beneficiaryBtns: Array.from(document.querySelectorAll(".beneficiary")),
    continueBtn: document.getElementById("continue-btn")
};

const CHECKOUT_STEPS = CORE ? CORE.CHECKOUT_STEPS : [];

let checkoutStep = 0;

init();

function init() {
    if (!CORE) return;
    renderPricingGrid();
    renderCheckoutProgress();
    bindEvents();
    updateQuote();
    renderCheckoutStep();
    // Overlay today's FX (same data/market-live.json the platform uses) and
    // re-price once it lands. Falls back silently to reference rates.
    CORE.loadLiveRates("../").then(function (n) {
        if (n) updateQuote();
    });
}

function bindEvents() {
    [els.amount, els.sendCurrency, els.receiveCurrency].forEach((el) => {
        el.addEventListener("input", updateQuote);
        el.addEventListener("change", updateQuote);
    });

    els.chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            els.amount.value = chip.dataset.amount;
            setChipActive(chip.dataset.amount);
            updateQuote();
        });
    });

    els.beneficiaryBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            els.receiveCurrency.value = btn.dataset.currency;
            updateQuote();
        });
    });

    els.continueBtn.addEventListener("click", () => {
        const q = computeQuote();
        if (!q) return;
        openCheckout();
    });

    els.overlay.addEventListener("click", closeCheckout);
    els.sheetClose.addEventListener("click", closeCheckout);
    els.sheetPrev.addEventListener("click", onPrevStep);
    els.sheetNext.addEventListener("click", onNextStep);
}

function openCheckout() {
    checkoutStep = 0;
    els.overlay.hidden = false;
    els.sheet.hidden = false;
    document.body.style.overflow = "hidden";
    renderCheckoutStep();
}

function closeCheckout() {
    els.overlay.hidden = true;
    els.sheet.hidden = true;
    document.body.style.overflow = "";
}

function onPrevStep() {
    if (checkoutStep <= 0) {
        closeCheckout();
        return;
    }
    checkoutStep -= 1;
    renderCheckoutStep();
}

function onNextStep() {
    if (!validateCurrentStep()) return;

    if (checkoutStep < CHECKOUT_STEPS.length - 1) {
        checkoutStep += 1;
        renderCheckoutStep();
        return;
    }

    const q = computeQuote();
    if (!q) return;
    const receipt = `Transfert confirmé: ${formatAmount(q.receiveAmount, q.receiveCurrency)} ${q.receiveCurrency} vers ${els.bfName.value.trim()}. Méthode: ${paymentMethodLabel(els.payMethod.value)}.`;
    window.alert(receipt);
    closeCheckout();
}

function validateCurrentStep() {
    if (checkoutStep === 0) {
        return ensureValue(els.kycFullname, "Nom complet requis")
            && ensureValue(els.kycId, "Numéro de pièce requis")
            && ensureValue(els.kycCountry, "Pays requis");
    }
    if (checkoutStep === 1) {
        return ensureValue(els.bfName, "Nom bénéficiaire requis")
            && ensureValue(els.bfPhone, "Téléphone bénéficiaire requis")
            && ensureValue(els.bfChannel, "Canal de réception requis");
    }
    if (checkoutStep === 2) {
        if (!els.confirmRisk.checked) {
            window.alert("Veuillez confirmer l'origine des fonds.");
            return false;
        }
    }
    return true;
}

function ensureValue(el, message) {
    if (String(el.value || "").trim()) return true;
    el.focus();
    window.alert(message);
    return false;
}

function renderCheckoutProgress() {
    els.stepProgress.innerHTML = CHECKOUT_STEPS.map((step, idx) => {
        return `<div class="progress-pill${idx === checkoutStep ? " active" : ""}">${escapeHtml(step.key.toUpperCase())}</div>`;
    }).join("");
}

function renderCheckoutStep() {
    const step = CHECKOUT_STEPS[checkoutStep];
    els.sheetTitle.textContent = step.title;

    els.stepKyc.hidden = checkoutStep !== 0;
    els.stepBeneficiary.hidden = checkoutStep !== 1;
    els.stepPayment.hidden = checkoutStep !== 2;

    els.sheetPrev.textContent = checkoutStep === 0 ? "Annuler" : "Retour";
    els.sheetNext.textContent = checkoutStep === CHECKOUT_STEPS.length - 1 ? "Confirmer" : "Suivant";

    renderCheckoutProgress();
    renderCheckoutSummary();
}

function renderCheckoutSummary() {
    const q = computeQuote();
    if (!q) {
        els.checkoutSummary.innerHTML = `<div class="summary-title">Résumé transfert</div><div class="summary-line"><span>Montant invalide</span><span>-</span></div>`;
        return;
    }

    const feeAndFx = `${toPct(q.tier.feePct)} + ${toPct(q.tier.fxPct)}`;
    els.checkoutSummary.innerHTML = `
        <div class="summary-title">Résumé transfert</div>
        <div class="summary-value">${formatAmount(q.receiveAmount, q.receiveCurrency)} ${q.receiveCurrency}</div>
        <div class="summary-line"><span>Vous envoyez</span><span>${formatAmount(q.sendAmount, q.sendCurrency)} ${q.sendCurrency}</span></div>
        <div class="summary-line"><span>Palier</span><span>${escapeHtml(q.tier.label)} (${feeAndFx})</span></div>
        <div class="summary-line"><span>Coût total</span><span>${toPct(q.effectivePct)}</span></div>
        <div class="summary-line"><span>Bénéficiaire</span><span>${escapeHtml(els.bfName.value || "Non renseigné")}</span></div>
    `;
}

function paymentMethodLabel(value) {
    if (value === "card") return "Carte bancaire";
    if (value === "bank_transfer") return "Virement bancaire";
    if (value === "wallet") return "Wallet WASI";
    return value;
}

function getTier(amount) {
    return CORE.getTier(amount);
}

function computeQuote() {
    return CORE.quote({
        sendAmount: Number.parseFloat(els.amount.value),
        sendCurrency: els.sendCurrency.value,
        receiveCurrency: els.receiveCurrency.value
    });
}

function updateQuote() {
    const quote = computeQuote();
    if (!quote) {
        els.receiveAmount.textContent = "-";
        els.corridorRate.textContent = "Montant invalide";
        els.breakdown.innerHTML = "";
        return;
    }

    els.receiveAmount.textContent = `${formatAmount(quote.receiveAmount, quote.receiveCurrency)} ${quote.receiveCurrency}`;
    els.corridorRate.textContent = `1 ${quote.sendCurrency} = ${formatRate(quote.appliedRate)} ${quote.receiveCurrency} (appliqué)`;
    els.tierLabel.textContent = `Palier ${quote.tier.label} • Coût ${toPct(quote.effectivePct)}`;

    els.breakdown.innerHTML = [
        row("Taux mid-market", `1 ${quote.sendCurrency} = ${formatRate(quote.midRate)} ${quote.receiveCurrency}`),
        row(`Frais WASI (${toPct(quote.tier.feePct)})`, `-${formatAmount(quote.feeAmount, quote.sendCurrency)} ${quote.sendCurrency}`, true),
        row(`Marge FX (${toPct(quote.tier.fxPct)})`, `Taux final ${formatRate(quote.appliedRate)}`),
        row("Coût total", toPct(quote.effectivePct), false, true),
        row("Comparatif Wave", `Wave: ${formatAmount(quote.waveReceive, quote.receiveCurrency)} ${quote.receiveCurrency}`)
    ].join("");

    highlightTier(quote.tier.label);
    setChipActive(String(Math.round(quote.sendAmount)));
    renderCheckoutSummary();
}

function renderPricingGrid() {
    els.pricingGrid.innerHTML = PRICING_TIERS.map((tier) => {
        const upper = Number.isFinite(tier.max) ? `${tier.max}` : "+";
        const amountLabel = Number.isFinite(tier.max) ? `${tier.min}-${upper}` : `${tier.min}+`;
        const total = tier.feePct + tier.fxPct;
        return `
      <div class="pricing-item" data-tier="${tier.label}">
        <strong>${tier.label} • ${amountLabel}</strong>
        <span>Frais ${toPct(tier.feePct)} + FX ${toPct(tier.fxPct)} = ${toPct(total)}</span>
      </div>
    `;
    }).join("");
}

function highlightTier(label) {
    document.querySelectorAll(".pricing-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.tier === label);
    });
}

function setChipActive(amount) {
    els.chips.forEach((chip) => chip.classList.toggle("active", chip.dataset.amount === String(amount)));
}

function row(label, value, negative = false, total = false) {
    const classes = ["break-row"];
    if (negative) classes.push("negative");
    if (total) classes.push("total");
    return `<div class="${classes.join(" ")}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

/* Formatters delegate to the shared core so the DEX panel and this app
   render every amount, rate and percentage identically. */
function formatAmount(value, currency) {
    return CORE.formatAmount(value, currency);
}

function formatRate(value) {
    return CORE.formatRate(value);
}

function toPct(value) {
    return CORE.toPct(value);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
