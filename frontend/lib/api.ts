function resolveApiBase() {
  const configuredWebBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const nativeBase = process.env.NEXT_PUBLIC_NATIVE_API_BASE_URL;

  if (typeof window !== "undefined" && window.location.protocol === "capacitor:") {
    return nativeBase || configuredWebBase || "http://localhost:8000/api/v1";
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

function authHeaders() {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

let refreshInFlight: Promise<boolean> | null = null;

async function doRefreshAccessToken(): Promise<boolean> {
  try {
    const refresh_token = localStorage.getItem("refresh_token");
    if (!refresh_token) return false;

    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    const response = await fetch(`${getApiBase()}/auth/refresh`, {
      method: "POST",
      headers,
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ refresh_token }),
    });

    if (!response.ok) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      return false;
    }

    const data = await response.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    return false;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
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
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw new Error("Session expired. Please log in again.");
    }

    const retryHeaders = new Headers(options?.headers);
    const newAuth = authHeaders();
    if (newAuth.Authorization) {
      retryHeaders.set("Authorization", newAuth.Authorization);
    }
    if (csrf && (options?.method || "GET").toUpperCase() !== "GET") {
      retryHeaders.set("x-csrf-token", csrf);
    }

    try {
      response = await fetch(`${getApiBase()}${path}`, {
        ...options,
        headers: retryHeaders,
        credentials: "include",
        cache: "no-store",
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }
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

  // If 401, try refreshing token and retry once
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers(options?.headers);
      retryHeaders.set("Content-Type", "application/json");
      const newAuth = authHeaders();
      if (newAuth.Authorization) {
        retryHeaders.set("Authorization", newAuth.Authorization);
      }
      if (csrf && (options?.method || "GET").toUpperCase() !== "GET") {
        retryHeaders.set("x-csrf-token", csrf);
      }

      try {
        response = await fetch(`${getApiBase()}${path}`, {
          ...options,
          headers: retryHeaders,
          credentials: "include",
          cache: "no-store",
        });
      } catch (error) {
        throw normalizeFetchError(error);
      }
    } else {
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export async function uploadFile(file: File, folderId?: string) {
  const token = localStorage.getItem("access_token");
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

  // If 401, try refreshing token and retry once
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers();
      const newToken = localStorage.getItem("access_token");
      if (newToken) {
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
      }
      if (csrf) {
        retryHeaders.set("x-csrf-token", csrf);
      }

      const formData2 = new FormData();
      formData2.append("upload", file);
      try {
        response = await fetch(`${getApiBase()}/files/upload${query}`, {
          method: "POST",
          headers: retryHeaders,
          credentials: "include",
          body: formData2,
        });
      } catch (error) {
        throw normalizeFetchError(error);
      }
    } else {
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Upload failed");
  }

  return response.json();
}

export async function ensureSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  if (!accessToken && !refreshToken) {
    return false;
  }

  try {
    await apiRaw("/auth/me", { method: "GET" });
    return true;
  } catch {
    if (typeof window !== "undefined" && (accessToken || refreshToken)) {
      sessionStorage.setItem("auth_notice", "Sessie verlopen. Log opnieuw in om verder te gaan.");
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    return false;
  }
}
