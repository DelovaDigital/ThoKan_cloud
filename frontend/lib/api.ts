function resolveApiBase() {
  const configuredWebBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const nativeBase = process.env.NEXT_PUBLIC_NATIVE_API_BASE_URL;

  if (typeof window !== "undefined" && window.location.protocol === "capacitor:") {
    return nativeBase || configuredWebBase || "https://thokan.cloud/api/v1";
  }

  if (configuredWebBase) {
    return configuredWebBase;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/v1`;
  }

  return "http://localhost:8000/api/v1";
}

export function getApiBase() {
  return resolveApiBase();
}

async function extractErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  } else {
    const bodyText = await response.text().catch(() => "");
    if (bodyText.trim()) {
      const compactText = bodyText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (compactText) {
        return `${response.status} ${response.statusText}: ${compactText}`;
      }
    }
  }

  return `${response.status} ${response.statusText || "Request failed"}`;
}

function normalizeFetchError(error: unknown): Error {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error("Cannot reach API server. Check backend URL, proxy routing, CORS, and that the API is running.");
  }
  return error instanceof Error ? error : new Error("Request failed");
}

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("sessie verlopen");
}

const SESSION_CHECK_CACHE_MS = 5000;
const SESSION_CHECK_RATE_LIMIT_COOLDOWN_MS = 15000;

let redirectingToLogin = false;
let inflightSessionCheck: Promise<boolean> | null = null;
let lastSessionCheckAt = 0;
let lastSessionCheckResult = false;
let sessionCheckRateLimitedUntil = 0;

function authHeaders() {
  if (typeof window === "undefined") return {};
  let token: string | null = null;
  try {
    token = localStorage.getItem("access_token");
  } catch {
    token = null;
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// No refresh-token flow: access tokens are long-lived and users remain logged in until they log out.

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  try {
    sessionStorage.setItem("auth_notice", "Sessie verlopen. Log opnieuw in om verder te gaan.");
    sessionStorage.setItem("auth_notice_type", "warning");
  } catch {
    // Ignore storage errors; redirect should still happen.
  }
  window.location.replace(`/login?r=${Date.now()}`);
}

export async function apiRaw(path: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  const auth = authHeaders();
  if (auth.Authorization) {
    headers.set("Authorization", auth.Authorization);
  }

  const csrf = csrfToken();
  if (csrf && (options?.method || "GET").toUpperCase() !== "GET") {
    headers.set("x-csrf-token", csrf);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }

  if (response.status === 401) {
    try {
      localStorage.removeItem("access_token");
    } catch {
      // Ignore storage errors; redirect should still happen.
    }
    redirectToLogin();
    throw new Error("Sessie verlopen. Log opnieuw in om verder te gaan.");
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");

  const auth = authHeaders();
  if (auth.Authorization) {
    headers.set("Authorization", auth.Authorization);
  }

  const csrf = csrfToken();
  if (csrf && (options?.method || "GET").toUpperCase() !== "GET") {
    headers.set("x-csrf-token", csrf);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }

  if (response.status === 401) {
    try {
      localStorage.removeItem("access_token");
    } catch {
      // Ignore storage errors; redirect should still happen.
    }
    redirectToLogin();
    throw new Error("Sessie verlopen. Log opnieuw in om verder te gaan.");
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export async function uploadFile(file: File, folderId?: string) {
  let token: string | null = null;
  try {
    token = localStorage.getItem("access_token");
  } catch {
    token = null;
  }
  const csrf = csrfToken();
  const formData = new FormData();
  formData.append("upload", file);
  const query = folderId ? `?folder_id=${folderId}` : "";

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (csrf) {
    headers.set("x-csrf-token", csrf);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/files/upload${query}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }

  if (response.status === 401) {
    try {
      localStorage.removeItem("access_token");
    } catch {
      // Ignore storage errors; redirect should still happen.
    }
    redirectToLogin();
    throw new Error("Sessie verlopen. Log opnieuw in om verder te gaan.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Upload failed");
  }

  return response.json();
}

export async function ensureSession(options?: { requireConfirmedAuth?: boolean }): Promise<boolean> {
  if (typeof window === "undefined") return false;

  let accessToken: string | null = null;
  try {
    accessToken = localStorage.getItem("access_token");
  } catch {
    return false;
  }
  if (!accessToken) return false;

  const requireConfirmedAuth = options?.requireConfirmedAuth === true;
  const now = Date.now();

  if (!requireConfirmedAuth && now - lastSessionCheckAt < SESSION_CHECK_CACHE_MS) {
    return lastSessionCheckResult;
  }

  if (sessionCheckRateLimitedUntil > now) {
    return requireConfirmedAuth ? false : true;
  }

  if (inflightSessionCheck) {
    const result = await inflightSessionCheck;
    return requireConfirmedAuth ? result : result || true;
  }

  inflightSessionCheck = (async () => {
    try {
      const response = await fetch(`${getApiBase()}/auth/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        try {
          localStorage.removeItem("access_token");
        } catch {
          // Ignore storage errors.
        }
        try {
          sessionStorage.setItem("auth_notice", "Sessie verlopen. Log opnieuw in om verder te gaan.");
          sessionStorage.setItem("auth_notice_type", "warning");
        } catch {
          // Ignore storage errors.
        }
        return false;
      }

      if (response.status === 429) {
        sessionCheckRateLimitedUntil = Date.now() + SESSION_CHECK_RATE_LIMIT_COOLDOWN_MS;
        return false;
      }

      if (response.ok) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  })();

  const checked = await inflightSessionCheck;
  inflightSessionCheck = null;
  lastSessionCheckAt = Date.now();
  lastSessionCheckResult = checked;

  if (requireConfirmedAuth) {
    return checked;
  }

  return checked || true;
}
