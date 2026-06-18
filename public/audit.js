const STORAGE_KEY = "ledger-wallet-state";

let state = {
  token: "",
  user: null,
};

let currentAuditLogs = [];
let currentPagination = {
  total: 0,
  limit: 50,
  offset: 0,
};

const $ = (id) => document.getElementById(id);

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

const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = "/";
};

const setOutput = (title, status, body) => {
  $("auditOutput").textContent = JSON.stringify(
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

const authedRequest = async (path, options = {}) => {
  const result = await requestJson(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });

  if (result.status === 401) {
    clearSession();
  }

  return result;
};

const requireAdminSession = () => {
  if (!state.token) {
    window.location.href = "/";
    return false;
  }

  if (!state.user?.isAdmin) {
    setOutput("Admin access", 403, {
      error: "This page is only available for admin users.",
    });
    return false;
  }

  return true;
};

const updateSessionPanel = () => {
  $("auditSessionName").textContent = state.user?.displayName || "Not signed in";
  $("auditSessionEmail").textContent = state.user?.email || "No active user";
};

const buildAuditQuery = () => {
  const params = new URLSearchParams();
  const filters = [
    ["eventType", $("auditEventType").value.trim()],
    ["status", $("auditStatus").value],
    ["userId", $("auditUserId").value.trim()],
    ["entityType", $("auditEntityType").value.trim()],
    ["search", $("auditSearch").value.trim()],
    ["limit", $("auditLimit").value],
    ["offset", currentPagination.offset.toString()],
  ];

  for (const [key, value] of filters) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `/admin/audit-logs?${query}` : "/admin/audit-logs";
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
};

const summarizeMetadata = (metadata) => {
  const parts = [];

  if (metadata?.email) {
    parts.push(metadata.email);
  }

  if (metadata?.walletIban) {
    parts.push(`wallet ${metadata.walletIban}`);
  }

  if (metadata?.fromWalletIban && metadata?.toWalletIban) {
    parts.push(`${metadata.fromWalletIban} -> ${metadata.toWalletIban}`);
  }

  if (metadata?.amount) {
    parts.push(`amount ${metadata.amount}`);
  }

  if (metadata?.errorMessage) {
    parts.push(metadata.errorMessage);
  }

  return parts.join(" | ") || JSON.stringify(metadata || {});
};

const renderAuditTable = () => {
  const tableBody = $("auditTableBody");
  tableBody.innerHTML = "";

  if (currentAuditLogs.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">No audit logs found.</td>';
    tableBody.appendChild(row);
    return;
  }

  for (const auditLog of currentAuditLogs) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.dataset.auditLogId = auditLog.id;

    const values = [
      formatDate(auditLog.createdAt),
      auditLog.eventType,
      null,
      auditLog.userId ?? "System",
      `${auditLog.entityType || ""}${
        auditLog.entityId ? ` ${auditLog.entityId}` : ""
      }`,
      summarizeMetadata(auditLog.metadata),
    ];

    for (const value of values) {
      const cell = document.createElement("td");

      if (value === null) {
        const status = document.createElement("span");
        status.className = `status-pill ${auditLog.status}`;
        status.textContent = auditLog.status;
        cell.appendChild(status);
      } else {
        cell.textContent = value.toString();
      }

      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }
};

const updateMetrics = (pagination) => {
  currentPagination = {
    total: pagination?.total ?? 0,
    limit: pagination?.limit ?? Number($("auditLimit").value),
    offset: pagination?.offset ?? currentPagination.offset,
  };

  $("auditTotalMetric").textContent = currentPagination.total.toString();
  $("auditShownMetric").textContent = currentAuditLogs.length.toString();
  $("auditRefreshMetric").textContent = new Date().toLocaleTimeString();
  updatePaginationControls();
};

const updatePaginationControls = () => {
  const totalPages = Math.max(
    1,
    Math.ceil(currentPagination.total / currentPagination.limit)
  );
  const currentPage =
    Math.floor(currentPagination.offset / currentPagination.limit) + 1;
  const hasPreviousPage = currentPagination.offset > 0;
  const hasNextPage =
    currentPagination.offset + currentPagination.limit < currentPagination.total;

  $("auditPageLabel").textContent = `Page ${Math.min(
    currentPage,
    totalPages
  )} of ${totalPages}`;
  $("auditPreviousButton").disabled = !hasPreviousPage;
  $("auditNextButton").disabled = !hasNextPage;
};

const resetAuditPagination = () => {
  currentPagination.offset = 0;
};

const loadAuditLogs = async () => {
  const result = await authedRequest(buildAuditQuery());
  setOutput("Load audit logs", result.status, result.body);

  if (result.ok) {
    currentAuditLogs = result.body.auditLogs;
    renderAuditTable();
    updateMetrics(result.body.pagination);
  }

  if (result.status === 403) {
    currentAuditLogs = [];
    renderAuditTable();
    updateMetrics({ total: 0, limit: Number($("auditLimit").value), offset: 0 });
  }
};

const cleanupAuditLogs = async () => {
  const result = await authedRequest("/admin/audit-logs/expired", {
    method: "DELETE",
  });
  setOutput("Clean expired audit logs", result.status, result.body);

  if (result.ok) {
    await loadAuditLogs();
  }
};

const resetFilters = () => {
  $("auditEventType").value = "";
  $("auditStatus").value = "";
  $("auditUserId").value = "";
  $("auditEntityType").value = "";
  $("auditSearch").value = "";
  $("auditLimit").value = "50";
  resetAuditPagination();
};

const checkHealth = async () => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const result = await requestJson("/health", {
      signal: controller.signal,
    });
    $("auditApiStatus").textContent = result.ok ? "Connected" : "Unavailable";
  } catch {
    $("auditApiStatus").textContent = "Unavailable";
  } finally {
    window.clearTimeout(timeout);
  }
};

$("auditRefreshButton").addEventListener("click", () => {
  resetAuditPagination();
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
});

$("auditResetFiltersButton").addEventListener("click", () => {
  resetFilters();
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
});

$("auditLimit").addEventListener("change", () => {
  resetAuditPagination();
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
});

$("auditPreviousButton").addEventListener("click", () => {
  currentPagination.offset = Math.max(
    0,
    currentPagination.offset - currentPagination.limit
  );
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
});

$("auditNextButton").addEventListener("click", () => {
  if (currentPagination.offset + currentPagination.limit >= currentPagination.total) {
    return;
  }

  currentPagination.offset += currentPagination.limit;
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
});

$("auditCleanupButton").addEventListener("click", () => {
  cleanupAuditLogs().catch((error) => {
    setOutput("Clean expired audit logs", 0, { error: error.message });
  });
});

$("auditClearOutputButton").addEventListener("click", () => {
  $("auditOutput").textContent = "No audit request sent.";
});

$("auditLogoutButton").addEventListener("click", clearSession);

$("auditTableBody").addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-audit-log-id]");

  if (!row) {
    return;
  }

  const auditLog = currentAuditLogs.find(
    (entry) => entry.id.toString() === row.dataset.auditLogId
  );

  if (auditLog) {
    setOutput("Selected audit log", 200, auditLog);
  }
});

loadState();
updateSessionPanel();
checkHealth();

if (requireAdminSession()) {
  loadAuditLogs().catch((error) => {
    setOutput("Load audit logs", 0, { error: error.message });
  });
}
