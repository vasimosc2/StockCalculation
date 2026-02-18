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
  newTotalShares: document.getElementById("newTotalShares"),
  newAvgPrice: document.getElementById("newAvgPrice"),
  currentCost: document.getElementById("currentCost"),
  newCost: document.getElementById("newCost"),

  themeBtn: document.getElementById("themeBtn"),
};

function fmtMoney(n) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}
function fmtNum(n, digits = 4) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
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

/**
 * Solve:
 * (N*A + x*C) / (N + x) = T
 * => x = N*(T - A) / (C - T)
 */
function compute() {
  const { N, A, T, C } = readInputs();

  // Basic validation
  if (![N, A, T, C].every(Number.isFinite)) {
    setMessage("Enter all four numbers to calculate.", "warn");
    clearOutputs();
    return;
  }
  if (N < 0 || A < 0 || T < 0 || C < 0) {
    setMessage("Values must be non-negative.", "err");
    clearOutputs();
    return;
  }

  // If you already have 0 shares, target average is simply current price if you buy now
  if (N === 0) {
    setMessage("You have 0 shares. Your next buy average equals the current price.", "ok");
    const x = 0;
    updateOutputs({ N, A: 0, T, C, xExact: x, xRounded: x });
    return;
  }

  // If current average already <= target, you don't need to buy more to be <= target
  if (A <= T) {
    setMessage("Your current average is already at or below your target. No additional shares are required.", "ok");
    const x = 0;
    updateOutputs({ N, A, T, C, xExact: x, xRounded: x });
    return;
  }

  // If current price equals target, denominator is 0 -> cannot hit exactly by buying at that price unless already at target
  if (C === T) {
    setMessage("Current price equals your target average. You cannot reach the target by buying at exactly the target price (unless you’re already there).", "err");
    clearOutputs();
    return;
  }

  // If current price is above target while your average is above target, you can't average down to that target by buying higher than it
  if (C > T) {
    setMessage("Current price is above your target average. Averaging down to that target is impossible by buying at the current price.", "err");
    clearOutputs();
    return;
  }

  const xExact = (N * (T - A)) / (C - T);

  if (!Number.isFinite(xExact)) {
    setMessage("Calculation failed due to invalid inputs.", "err");
    clearOutputs();
    return;
  }

  // x should be positive if it’s achievable; if not, explain
  if (xExact <= 0) {
    setMessage("With these inputs, buying more shares does not move your average toward the target in a meaningful way.", "warn");
    clearOutputs();
    return;
  }

  // Round up to whole shares
  const xRounded = Math.ceil(xExact);

  updateOutputs({ N, A, T, C, xExact, xRounded });

  // Inform about rounding effect
  const avgAfterRounded = (N * A + xRounded * C) / (N + xRounded);
  if (avgAfterRounded <= T + 1e-10) {
    setMessage("Calculated. Rounding up ensures you meet (or go below) your target average.", "ok");
  } else {
    setMessage("Calculated. Due to rounding, you may be slightly above your target; try adding 1 more share.", "warn");
  }
}

function updateOutputs({ N, A, T, C, xExact, xRounded }) {
  const sharesToBuy = xRounded;
  const money = sharesToBuy * C;

  const currentCost = N * A;
  const newCost = currentCost + money;
  const newShares = N + sharesToBuy;
  const newAvg = newShares > 0 ? (newCost / newShares) : NaN;

  els.sharesToBuy.textContent = fmtNum(sharesToBuy, 0);
  els.moneyToSpend.textContent = fmtMoney(money);
  els.newTotalShares.textContent = fmtNum(newShares, 0);
  els.newAvgPrice.textContent = fmtNum(newAvg, 6);

  els.currentCost.textContent = fmtMoney(currentCost);
  els.newCost.textContent = fmtMoney(newCost);
}

function clearOutputs() {
  els.sharesToBuy.textContent = "—";
  els.moneyToSpend.textContent = "—";
  els.newTotalShares.textContent = "—";
  els.newAvgPrice.textContent = "—";
  els.currentCost.textContent = "—";
  els.newCost.textContent = "—";
}

// Live calculate
function attachLiveCalc() {
  const inputs = [els.sharesHave, els.avgPrice, els.targetAvg, els.currentPrice];
  inputs.forEach((el) => {
    el.addEventListener("input", () => {
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
  setMessage("", "");
  clearOutputs();
  saveState(true);
}

// Theme + persistence
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
    live: els.liveToggle.checked
  };
  localStorage.setItem("ap_state", JSON.stringify(state));
}

function loadState() {
  const theme = localStorage.getItem("ap_theme") || "dark";
  setTheme(theme);

  const raw = localStorage.getItem("ap_state");
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    els.sharesHave.value = s.N ?? "";
    els.avgPrice.value = s.A ?? "";
    els.targetAvg.value = s.T ?? "";
    els.currentPrice.value = s.C ?? "";
    els.liveToggle.checked = s.live ?? true;
    if (els.liveToggle.checked) compute();
  } catch {
    // ignore
  }
}

// Events
els.calcBtn.addEventListener("click", compute);
els.resetBtn.addEventListener("click", resetAll);
els.themeBtn.addEventListener("click", toggleTheme);

attachLiveCalc();
loadState();
clearOutputs();
setMessage("Ready. Fill the inputs and click Calculate.", "warn");

