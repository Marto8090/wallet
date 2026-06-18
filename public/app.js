const STORAGE_KEY = "ledger-wallet-state";

let state = {
  token: "",
  user: null,
  wallets: [],
  walletIban: "",
  balance: "",
  lastTransferReference: "",
  lastTransferRequest: null,
};

let isCreateWalletFormOpen = false;
let isAdminRedirectInProgress = false;

const $ = (id) => document.getElementById(id);

const createIdempotencyKey = () =>
  `transfer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const loadState = () => {
  try {
    state = {
      ...state,
      ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}),
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
};

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const setOutput = (title, status, body) => {
  $("responseOutput").textContent = JSON.stringify(
    {
      title,
      status,
      body,
      time: new Date().toLocaleTimeString(),
    },
    null,
    2
  );
};

const setAuthOutput = (title, status, body) => {
  $("authOutput").textContent = JSON.stringify(
    {
      title,
      status,
      body,
      time: new Date().toLocaleTimeString(),
    },
    null,
    2
  );
};

const resetSession = (message) => {
  state.token = "";
  state.user = null;
  state.wallets = [];
  state.walletIban = "";
  state.balance = "";
  state.lastTransferReference = "";
  state.lastTransferRequest = null;
  isCreateWalletFormOpen = false;

  $("walletIban").value = "";
  $("walletBalance").value = "Not loaded";
  $("fromWalletIban").value = "";
  $("toWalletIban").value = "";

  saveState();
  updateView();

  if (message) {
    setAuthOutput("Session expired", 401, { error: message });
  }
};

const parseResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await parseResponse(response),
  };
};

const requireToken = () => {
  if (!state.token) {
    throw new Error("Login is required");
  }

  return state.token;
};

const authedRequest = async (path, options = {}) => {
  const result = await requestJson(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      ...(options.headers || {}),
    },
  });

  if (result.status === 401) {
    resetSession("Your session expired. Please sign in again.");
  }

  return result;
};

const readWalletIban = () => {
  const walletIban = $("walletIban").value.trim();

  if (!walletIban) {
    throw new Error("Wallet IBAN is required");
  }

  return walletIban;
};

const getSelectedWallet = () =>
  state.wallets.find((wallet) => wallet.iban === state.walletIban);

const renderWalletOptions = () => {
  const walletSelect = $("walletSelect");
  walletSelect.innerHTML = "";

  if (state.wallets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No wallets yet";
    walletSelect.appendChild(option);
    return;
  }

  if (!state.walletIban) {
    state.walletIban = state.wallets[0].iban;
  }

  for (const wallet of state.wallets) {
    const option = document.createElement("option");
    option.value = wallet.iban;
    option.textContent = `${wallet.name} - ${wallet.iban} - ${wallet.balance} ${wallet.currencyCode}`;
    walletSelect.appendChild(option);
  }

  walletSelect.value = state.walletIban || state.wallets[0].iban;
};

const syncWalletFields = () => {
  $("fromWalletIban").value = $("walletIban").value.trim();
};

const updateView = () => {
  if (isAdminRedirectInProgress) {
    return;
  }

  const isAuthenticated = Boolean(state.token);

  $("authView").classList.toggle("hidden", isAuthenticated);
  $("dashboardView").classList.toggle("hidden", !isAuthenticated);
  $("sessionName").textContent = state.user?.displayName || "Not signed in";
  $("sessionEmail").textContent = state.user?.email || "No active user";
  const selectedWallet = getSelectedWallet();
  $("selectedWalletMetric").textContent = selectedWallet
    ? selectedWallet.name
    : state.walletIban || "None";
  $("balanceMetric").textContent = state.balance || "Not loaded";
  $("transferMetric").textContent = state.lastTransferReference || "None";
  $("createWalletFields").classList.toggle("hidden", !isCreateWalletFormOpen);
  $("createWalletButton").textContent = isCreateWalletFormOpen
    ? "Save wallet"
    : "Create wallet";
  $("cancelCreateWalletButton").classList.toggle(
    "hidden",
    !isCreateWalletFormOpen
  );
  renderWalletOptions();
  $("walletIban").value = state.walletIban || $("walletIban").value;
  $("walletBalance").value = state.balance || "Not loaded";
  syncWalletFields();
};

const runAction = async (title, action) => {
  try {
    const result = await action();

    if (isAdminRedirectInProgress) {
      return;
    }

    setOutput(title, result.status, result.body);
    saveState();
    updateView();
  } catch (error) {
    setOutput(title, 0, { error: error.message });
  }
};

const register = () =>
  requestJson("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: $("registerEmail").value.trim(),
      displayName: $("registerDisplayName").value.trim(),
      baseCurrencyCode: $("registerBaseCurrencyCode").value.trim().toUpperCase(),
      password: $("registerPassword").value,
    }),
  });

const login = () =>
  requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value,
    }),
  });

const storeAuthResult = (result) => {
  if (result.ok) {
    state.token = result.body.token;
    state.user = result.body.user;
    state.wallets = [];
    state.walletIban = "";
    state.balance = "";
  }

  return result;
};

const redirectAdminUser = () => {
  if (state.token && state.user?.isAdmin) {
    isAdminRedirectInProgress = true;
    saveState();
    window.location.replace("/audit.html");
    return true;
  }

  return false;
};

const refreshWallets = async () => {
  const result = await authedRequest("/wallets");

  if (result.ok) {
    state.wallets = result.body.wallets;

    if (
      state.wallets.length > 0 &&
      !state.wallets.some((wallet) => wallet.iban === state.walletIban)
    ) {
      state.walletIban = state.wallets[0].iban;
    }

    const selectedWallet = getSelectedWallet();
    state.balance = selectedWallet ? selectedWallet.balance : "";
  }

  return result;
};

const createWallet = async () => {
  const result = await authedRequest("/wallets", {
    method: "POST",
    body: JSON.stringify({
      name: $("walletName").value.trim(),
      currencyCode: $("currencyCode").value.trim().toUpperCase(),
      initialBalance: $("initialBalance").value.trim() || "0.00",
    }),
  });

  if (result.ok) {
    state.walletIban = result.body.wallet.iban;
    isCreateWalletFormOpen = false;
    $("initialBalance").value = "0.00";
    await refreshWallets();
  }

  return result;
};

const moveMoney = async (type) => {
  const walletIban = readWalletIban();
  const path =
    type === "deposit"
      ? `/wallets/${walletIban}/deposits`
      : `/wallets/${walletIban}/withdrawals`;

  const result = await authedRequest(path, {
    method: "POST",
    body: JSON.stringify({
      amount: $("walletAmount").value.trim(),
      description: $("walletDescription").value.trim(),
    }),
  });

  if (result.ok) {
    await refreshWallets();
  }

  return result;
};

const buildTransferBody = () => ({
  fromWalletIban: $("fromWalletIban").value.trim().toUpperCase(),
  toWalletIban: $("toWalletIban").value.trim().toUpperCase(),
  amount: $("transferAmount").value.trim(),
  description: $("transferDescription").value.trim(),
});

const sendTransfer = async (repeatLastRequest = false) => {
  const transferRequest = repeatLastRequest
    ? state.lastTransferRequest
    : {
        idempotencyKey: createIdempotencyKey(),
        body: buildTransferBody(),
      };

  if (!transferRequest) {
    throw new Error("No transfer request to retry");
  }

  state.lastTransferRequest = transferRequest;
  saveState();

  const result = await authedRequest("/transfers", {
    method: "POST",
    headers: {
      "Idempotency-Key": transferRequest.idempotencyKey,
    },
    body: JSON.stringify(transferRequest.body),
  });

  if (result.ok) {
    state.lastTransferReference = result.body.transfer.transferReference;
    await refreshWallets();
  }

  return result;
};

const checkHealth = async () => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const result = await requestJson("/health", {
      signal: controller.signal,
    });
    $("apiStatus").textContent = result.ok ? "Connected" : "Unavailable";
    $("authApiStatus").textContent = result.ok ? "Connected" : "Unavailable";
  } catch {
    $("apiStatus").textContent = "Unavailable";
    $("authApiStatus").textContent = "Unavailable";
  } finally {
    window.clearTimeout(timeout);
  }
};

const runAuthAction = async (title, action) => {
  try {
    const result = await action();

    if (isAdminRedirectInProgress) {
      return;
    }

    setAuthOutput(title, result.status, result.body);
    saveState();
    updateView();
  } catch (error) {
    setAuthOutput(title, 0, { error: error.message });
  }
};

const showAuthPanel = (panel) => {
  const isLogin = panel === "login";
  $("loginPanel").classList.toggle("hidden", !isLogin);
  $("registerPanel").classList.toggle("hidden", isLogin);
  $("showLoginButton").classList.toggle("active", isLogin);
  $("showRegisterButton").classList.toggle("active", !isLogin);
};

const syncAuthFields = () => {
  if ($("loginEmail").value.trim()) {
    $("registerEmail").value = $("loginEmail").value.trim();
  }

  if ($("loginPassword").value) {
    $("registerPassword").value = $("loginPassword").value;
  }
};

$("createWalletButton").addEventListener("click", () => {
  if (!isCreateWalletFormOpen) {
    isCreateWalletFormOpen = true;
    updateView();
    return;
  }

  runAction("Create wallet", createWallet);
});

$("cancelCreateWalletButton").addEventListener("click", () => {
  isCreateWalletFormOpen = false;
  $("initialBalance").value = "0.00";
  updateView();
});

$("depositButton").addEventListener("click", () => {
  runAction("Deposit", () => moveMoney("deposit"));
});

$("withdrawButton").addEventListener("click", () => {
  runAction("Withdraw", () => moveMoney("withdraw"));
});

$("transferButton").addEventListener("click", () => {
  runAction("Transfer", sendTransfer);
});

$("repeatTransferButton").addEventListener("click", () => {
  runAction("Retry transfer", () => sendTransfer(true));
});

$("clearResponseButton").addEventListener("click", () => {
  $("responseOutput").textContent = "No request sent.";
});

$("clearStateButton").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  resetSession();
  $("responseOutput").textContent = "No request sent.";
  $("authOutput").textContent = "No request sent.";
});

$("walletSelect").addEventListener("change", (event) => {
  state.walletIban = event.target.value;
  const selectedWallet = getSelectedWallet();
  state.balance = selectedWallet ? selectedWallet.balance : "";
  saveState();
  updateView();
});

$("showLoginButton").addEventListener("click", () => {
  showAuthPanel("login");
});

$("showRegisterButton").addEventListener("click", () => {
  syncAuthFields();
  showAuthPanel("register");
});

$("authLoginButton").addEventListener("click", () => {
  runAuthAction("Login", async () => {
    const result = storeAuthResult(await login());

    if (result.ok && !redirectAdminUser()) {
      await refreshWallets();
    }

    return result;
  });
});

$("authRegisterButton").addEventListener("click", () => {
  runAuthAction("Register", async () => {
    const result = storeAuthResult(await register());

    if (result.ok && !redirectAdminUser()) {
      await refreshWallets();
    }

    return result;
  });
});

loadState();

if (!redirectAdminUser()) {
  updateView();
  checkHealth();
}

if (state.token && !isAdminRedirectInProgress) {
  refreshWallets()
    .then(() => {
      saveState();
      updateView();
    })
    .catch(() => {
      resetSession();
    });
}
