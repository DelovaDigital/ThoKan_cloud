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

// No refresh-token flow: access tokens are long-lived and users remain logged in until they log out.

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
    // No refresh flow: treat 401 as session invalid and require re-login
    localStorage.removeItem("access_token");
    throw new Error("Session expired. Please log in again.");
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
    localStorage.removeItem("access_token");
    throw new Error("Session expired. Please log in again.");
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

  if (response.status === 401) {
    localStorage.removeItem("access_token");
    throw new Error("Session expired. Please log in again.");
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
  if (!accessToken) {
    return false;
  }

  try {
    await apiRaw("/auth/me", { method: "GET" });
    return true;
  } catch {
    if (typeof window !== "undefined" && accessToken) {
      sessionStorage.setItem("auth_notice", "Sessie verlopen. Log opnieuw in om verder te gaan.");
    }
    localStorage.removeItem("access_token");
    return false;
  }
}
