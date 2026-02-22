const els = {
  sharesHave: document.getElementById("sharesHave"),
  avgPrice: document.getElementById("avgPrice"),
  targetAvg: document.getElementById("targetAvg"),
  currentPrice: document.getElementById("currentPrice"),
  calcBtn: document.getElementById("calcBtn"),
  resetBtn: document.getElementById("resetBtn"),
  liveToggle: document.getElementById("liveToggle"),
  message: document.getElementById("message"),

  sharesToBuy: document.getElementById("sharesToBuy"),
  moneyToSpend: document.getElementById("moneyToSpend"),
  moneyToSpendAlt: document.getElementById("moneyToSpendAlt"),
  newTotalShares: document.getElementById("newTotalShares"),
  newAvgPrice: document.getElementById("newAvgPrice"),

  themeBtn: document.getElementById("themeBtn"),

  mode: document.getElementById("mode"),

  // SLOT cards
  slotTarget: document.getElementById("slotTarget"),
  slotBuyX: document.getElementById("slotBuyX"),
  slotBudget: document.getElementById("slotBudget"),

  buyX: document.getElementById("buyX"),
  budgetEur: document.getElementById("budgetEur"),

  fxRate: document.getElementById("fxRate"),
  fxMeta: document.getElementById("fxMeta"),
  fxRefreshBtn: document.getElementById("fxRefreshBtn"),
};

// ---------- Helpers ----------
function fmtMoneyCurrency(n, currency) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}
function fmtNum(n, digits = 4) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
}

// Floor to N decimals (prevents exceeding budget due to rounding)
function floorTo(n, decimals = 2) {
  if (!Number.isFinite(n)) return NaN;
  const f = 10 ** decimals;
  return Math.floor(n * f) / f;
}

// Round to N decimals (useful for normalizing typed input)
function roundTo(n, decimals = 2) {
  if (!Number.isFinite(n)) return NaN;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function setMessage(text, kind = "") {
  els.message.textContent = text || "";
  els.message.className = "message" + (kind ? ` ${kind}` : "");
}

function readInputs() {
  const N = Number(els.sharesHave.value);
  const A = Number(els.avgPrice.value);
  const T = Number(els.targetAvg.value);
  const C = Number(els.currentPrice.value);
  return { N, A, T, C };
}

// ---------- FX ----------
const FX = {
  usdToEur: NaN,        // 1 USD = usdToEur EUR
  fetchedAtISO: "",
};

function setFxUI() {
  els.fxRate.textContent = Number.isFinite(FX.usdToEur) ? fmtNum(FX.usdToEur, 6) : "—";
  els.fxMeta.textContent = FX.fetchedAtISO
    ? `Source: Frankfurter (ECB). Fetched: ${new Date(FX.fetchedAtISO).toLocaleString()}`
    : "Source: Frankfurter (ECB).";
}

function loadFxCache() {
  try {
    const raw = localStorage.getItem("ap_fx");
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (Number.isFinite(cached.usdToEur)) {
      FX.usdToEur = cached.usdToEur;
      FX.fetchedAtISO = cached.fetchedAtISO || "";
    }
  } catch {
    // ignore
  }
  setFxUI();
}

async function fetchUsdEurRate() {
  const url = "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR";
  try {
    els.fxMeta.textContent = "Fetching live rate…";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.EUR;
    if (!Number.isFinite(rate)) throw new Error("Bad FX payload");

    FX.usdToEur = rate;
    FX.fetchedAtISO = new Date().toISOString();
    localStorage.setItem("ap_fx", JSON.stringify(FX));
    setFxUI();

    compute(); // refresh conversion outputs
  } catch {
    els.fxMeta.textContent = "Couldn’t fetch FX rate (offline / endpoint issue). EUR conversions may be unavailable.";
    setFxUI();
  }
}

// ---------- Mode UI (slot replacement) ----------
function updateModeUI() {
  const m = els.mode.value;
  els.slotTarget.style.display = (m === "targetAvg") ? "block" : "none";
  els.slotBuyX.style.display   = (m === "buyX") ? "block" : "none";
  els.slotBudget.style.display = (m === "spendBudget") ? "block" : "none";
}

// ---------- Core compute ----------
/**
 * Solve:
 * (N*A + x*C) / (N + x) = T
 * => x = N*(T - A) / (C - T)
 */
function compute() {
  const { N, A, T, C } = readInputs();
  const mode = els.mode.value;

  // Shared validation
  if (![N, A, C].every(Number.isFinite) || N < 0 || A < 0 || C < 0) {
    setMessage("Enter valid non-negative numbers for shares, avg price (USD), and current price (USD).", "warn");
    clearOutputs();
    return;
  }

  // Mode 1: Reach target average (kept as whole shares)
  if (mode === "targetAvg") {
    if (!Number.isFinite(T) || T < 0) {
      setMessage("Enter a valid non-negative target average (USD).", "warn");
      clearOutputs();
      return;
    }

    if (N === 0) {
      setMessage("You have 0 shares. Any buy sets your average to the buy price.", "ok");
      updateOutputs({ N, A: 0, C, sharesToBuy: 0 });
      return;
    }
    if (A <= T) {
      setMessage("Your current average is already at or below your target. No additional shares are required.", "ok");
      updateOutputs({ N, A, C, sharesToBuy: 0 });
      return;
    }
    if (C === T) {
      setMessage("Current price equals your target average. You can’t reach the target by buying exactly at the target price (unless you’re already there).", "err");
      clearOutputs();
      return;
    }
    if (C > T) {
      setMessage("Current price is above your target average. Averaging down to that target is impossible at the current price.", "err");
      clearOutputs();
      return;
    }

    const xExact = (N * (T - A)) / (C - T);
    if (!Number.isFinite(xExact) || xExact <= 0) {
      setMessage("With these inputs, buying more shares won’t move your average to the target.", "warn");
      clearOutputs();
      return;
    }

    const xRounded = Math.ceil(xExact); // whole shares here
    updateOutputs({ N, A, C, sharesToBuy: xRounded });

    const avgAfterRounded = (N * A + xRounded * C) / (N + xRounded);
    if (avgAfterRounded <= T + 1e-10) {
      setMessage("Calculated. Rounding up ensures you meet (or go below) your target average.", "ok");
    } else {
      setMessage("Calculated. Due to rounding, you may be slightly above your target; try adding 1 more share.", "warn");
    }
    return;
  }

  // Mode 2: What if I buy X shares? (ALLOW decimals, 2dp)
  if (mode === "buyX") {
    const Xraw = Number(els.buyX.value);
    if (!Number.isFinite(Xraw) || Xraw < 0) {
      setMessage("Enter a valid non-negative number of shares to buy (X).", "warn");
      clearOutputs();
      return;
    }

    const sharesToBuy = roundTo(Xraw, 2);
    updateOutputs({ N, A, C, sharesToBuy });

    const newAvg = (N * A + sharesToBuy * C) / (N + sharesToBuy);
    setMessage(`If you buy ${fmtNum(sharesToBuy, 2)} shares, your new average becomes ${fmtNum(newAvg, 6)} USD.`, "ok");
    return;
  }

  // Mode 3: Spend a EUR budget (ALLOW decimals, 2dp, and DO NOT exceed budget)
  if (mode === "spendBudget") {
    const budgetEur = Number(els.budgetEur.value);
    if (!Number.isFinite(budgetEur) || budgetEur < 0) {
      setMessage("Enter a valid non-negative budget in EUR.", "warn");
      clearOutputs();
      return;
    }
    if (C === 0) {
      setMessage("Current price is 0, budget calculation doesn’t make sense.", "err");
      clearOutputs();
      return;
    }
    if (!Number.isFinite(FX.usdToEur) || FX.usdToEur <= 0) {
      setMessage("Please fetch the USD→EUR rate first (Refresh), then try again.", "warn");
      clearOutputs();
      return;
    }

    // 1 USD = r EUR  => USD = EUR / r
    const budgetUsd = budgetEur / FX.usdToEur;

    // fractional shares allowed: floor to 2dp so spent <= budget
    const sharesRaw = budgetUsd / C;
    const sharesToBuy = floorTo(sharesRaw, 2);

    if (!Number.isFinite(sharesToBuy) || sharesToBuy <= 0) {
      setMessage("Budget is too small to buy any shares at the current price.", "warn");
      clearOutputs();
      return;
    }

    updateOutputs({ N, A, C, sharesToBuy });

    const spentUsd = sharesToBuy * C;
    const spentEur = spentUsd * FX.usdToEur;
    const newAvg = (N * A + sharesToBuy * C) / (N + sharesToBuy);

    setMessage(
      `EUR budget ≈ ${fmtMoneyCurrency(budgetUsd, "USD")} → buys ${fmtNum(sharesToBuy, 2)} shares. ` +
      `Spending: ${fmtMoneyCurrency(spentUsd, "USD")} (~${fmtMoneyCurrency(spentEur, "EUR")}). ` +
      `New average: ${fmtNum(newAvg, 6)} USD.`,
      "ok"
    );
    return;
  }
}

// ---------- Outputs ----------
function updateOutputs({ N, A, C, sharesToBuy }) {
  const moneyUsd = sharesToBuy * C;

  const newShares = N + sharesToBuy;
  const newAvg = newShares > 0 ? ((N * A + sharesToBuy * C) / newShares) : NaN;

  // Shares can be decimal now -> show up to 2 decimals
  els.sharesToBuy.textContent = fmtNum(sharesToBuy, 2);
  els.moneyToSpend.textContent = fmtMoneyCurrency(moneyUsd, "USD");

  if (Number.isFinite(FX.usdToEur) && FX.usdToEur > 0) {
    const moneyEur = moneyUsd * FX.usdToEur;
    els.moneyToSpendAlt.textContent = `≈ ${fmtMoneyCurrency(moneyEur, "EUR")}`;
  } else {
    els.moneyToSpendAlt.textContent = "≈ EUR: — (fetch rate)";
  }

  // total shares can be decimal too
  els.newTotalShares.textContent = fmtNum(newShares, 2);
  els.newAvgPrice.textContent = fmtNum(newAvg, 6);
}

function clearOutputs() {
  els.sharesToBuy.textContent = "—";
  els.moneyToSpend.textContent = "—";
  els.moneyToSpendAlt.textContent = "—";
  els.newTotalShares.textContent = "—";
  els.newAvgPrice.textContent = "—";
}

// ---------- Live calculate ----------
function attachLiveCalc() {
  const inputs = [
    els.sharesHave,
    els.avgPrice,
    els.targetAvg,
    els.currentPrice,
    els.buyX,
    els.budgetEur,
    els.mode,
  ];

  inputs.forEach((el) => {
    el.addEventListener("input", () => {
      updateModeUI();
      if (els.liveToggle.checked) compute();
      saveState();
    });
    el.addEventListener("change", () => {
      updateModeUI();
      if (els.liveToggle.checked) compute();
      saveState();
    });
  });
}

function resetAll() {
  els.sharesHave.value = "";
  els.avgPrice.value = "";
  els.targetAvg.value = "";
  els.currentPrice.value = "";
  els.buyX.value = "";
  els.budgetEur.value = "";
  els.mode.value = "targetAvg";

  setMessage("", "");
  clearOutputs();
  updateModeUI();
  saveState(true);
}

// ---------- Theme + persistence ----------
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ap_theme", theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(current === "dark" ? "light" : "dark");
}

function saveState(clear = false) {
  if (clear) {
    localStorage.removeItem("ap_state");
    return;
  }
  const state = {
    N: els.sharesHave.value,
    A: els.avgPrice.value,
    T: els.targetAvg.value,
    C: els.currentPrice.value,
    live: els.liveToggle.checked,
    mode: els.mode.value,
    buyX: els.buyX.value,
    budgetEur: els.budgetEur.value,
  };
  localStorage.setItem("ap_state", JSON.stringify(state));
}

function loadState() {
  const theme = localStorage.getItem("ap_theme") || "dark";
  setTheme(theme);

  const raw = localStorage.getItem("ap_state");
  if (raw) {
    try {
      const s = JSON.parse(raw);
      els.sharesHave.value = s.N ?? "";
      els.avgPrice.value = s.A ?? "";
      els.targetAvg.value = s.T ?? "";
      els.currentPrice.value = s.C ?? "";
      els.liveToggle.checked = s.live ?? true;
      els.mode.value = s.mode ?? "targetAvg";
      els.buyX.value = s.buyX ?? "";
      els.budgetEur.value = s.budgetEur ?? "";
    } catch {
      // ignore
    }
  }

  updateModeUI();
  if (els.liveToggle.checked) compute();
}

// ---------- Events ----------
els.calcBtn.addEventListener("click", compute);
els.resetBtn.addEventListener("click", resetAll);
els.themeBtn.addEventListener("click", toggleTheme);
els.fxRefreshBtn.addEventListener("click", fetchUsdEurRate);

attachLiveCalc();
loadState();
loadFxCache();
clearOutputs();
updateModeUI();
setMessage("Ready. Fill the inputs and click Calculate.", "warn");

// Optional: fetch FX rate on load
fetchUsdEurRate();