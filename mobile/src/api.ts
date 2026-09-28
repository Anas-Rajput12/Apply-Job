import { API_BASE_URL } from "./config";

export async function api(
  path: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail || data.error || "Request failed"
    );
  }

  return data;
}

export async function apiAuth(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  return api(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}
