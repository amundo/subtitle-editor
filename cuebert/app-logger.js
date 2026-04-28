const LOG_QUEUE_LIMIT = 100;
const MAX_FIELD_LENGTH = 4000;

let pendingEntries = [];
let installed = false;

function getInvoke() {
  return window.__TAURI__?.core?.invoke;
}

function clip(value) {
  const text = String(value ?? "");
  return text.length > MAX_FIELD_LENGTH
    ? `${text.slice(0, MAX_FIELD_LENGTH)}...`
    : text;
}

function serializeError(error) {
  if (!error) return null;

  return {
    name: clip(error.name || "Error"),
    message: clip(error.message || error),
    stack: clip(error.stack || ""),
  };
}

function serializeValue(value) {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return clip(value);

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return clip(value);
  }
}

async function flushEntry(entry) {
  const invoke = getInvoke();
  if (!invoke) return false;

  await invoke("append_log", { entry });
  return true;
}

async function flushQueue() {
  if (!pendingEntries.length) return;

  const queue = pendingEntries;
  pendingEntries = [];

  for (const entry of queue) {
    try {
      const sent = await flushEntry(entry);
      if (!sent) {
        pendingEntries.unshift(entry);
        break;
      }
    } catch {
      pendingEntries.unshift(entry);
      break;
    }
  }

  if (pendingEntries.length > LOG_QUEUE_LIMIT) {
    pendingEntries = pendingEntries.slice(-LOG_QUEUE_LIMIT);
  }
}

export function cuebertLog(level, message, detail = {}) {
  const entry = {
    level,
    source: "webview",
    message: clip(message),
    detail: serializeValue(detail),
    url: location.href,
    userAgent: navigator.userAgent,
    timeOrigin: performance.timeOrigin,
    performanceNow: Math.round(performance.now()),
  };

  pendingEntries.push(entry);
  if (pendingEntries.length > LOG_QUEUE_LIMIT) {
    pendingEntries = pendingEntries.slice(-LOG_QUEUE_LIMIT);
  }

  void flushQueue();
}

export function installCuebertLogger() {
  if (installed) return;
  installed = true;

  window.cuebertLog = cuebertLog;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args) => {
    cuebertLog("error", "console.error", { args: args.map(serializeValue) });
    originalError(...args);
  };

  console.warn = (...args) => {
    cuebertLog("warn", "console.warn", { args: args.map(serializeValue) });
    originalWarn(...args);
  };

  window.addEventListener("error", (event) => {
    cuebertLog("error", "window.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serializeError(event.error),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    cuebertLog("error", "unhandledrejection", {
      reason: serializeValue(event.reason),
    });
  });

  document.addEventListener("visibilitychange", () => {
    cuebertLog("info", "visibilitychange", {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("pagehide", () => {
    cuebertLog("info", "pagehide");
  });

  window.addEventListener("pageshow", () => {
    cuebertLog("info", "pageshow");
  });

  cuebertLog("info", "logger-installed");
  window.setInterval(() => {
    cuebertLog("info", "heartbeat", {
      visibilityState: document.visibilityState,
      memory: performance.memory
        ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
        : null,
    });
  }, 30000);
  window.setInterval(flushQueue, 2000);
}
