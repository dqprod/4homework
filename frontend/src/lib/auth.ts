/**
 * Unified auth helper - works with both Supabase real auth and demo mode.
 */

import { supabase } from "./supabase";

const TOKEN_KEY = "supabase_access_token";
const USER_ID_KEY = "user_id";
const CHILD_VIEW_KEY = "childViewId";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(USER_ID_KEY);
}

/**
 * Get user ID with Supabase session fallback.
 * Checks sessionStorage first (demo mode), then Supabase session (real auth).
 */
export async function getUserIdAsync(): Promise<string | null> {
  const local = getUserId();
  if (local) return local;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export function getChildViewId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CHILD_VIEW_KEY);
}

export function setChildViewId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) sessionStorage.setItem(CHILD_VIEW_KEY, id);
  else sessionStorage.removeItem(CHILD_VIEW_KEY);
}

export function setAuth(token: string, userId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_ID_KEY, userId);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
  sessionStorage.removeItem(CHILD_VIEW_KEY);
}

export function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "X-User-Id": getUserId() || "", ...(extra || {}) };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export const STORAGE_KEYS = { TOKEN_KEY, USER_ID_KEY, CHILD_VIEW_KEY };
