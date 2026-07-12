/**
 * Unified API client for 4homework.
 * All server-side API calls go through /api/* which rewrites to Supabase Edge Functions.
 */

import { getAccessToken, getUserId, getChildViewId, buildHeaders } from "./auth";

const BASE = "/api";

async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = buildHeaders();
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
}

// ── Auth ──────────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function register(email: string, password: string, fullName: string, role: string, username?: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName, role, username }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCurrentUser() {
  const res = await api("/auth/me");
  if (!res.ok) throw new Error("Failed to get current user");
  return res.json();
}

// ── Profile ───────────────────────────────────────────

export async function getProfile() {
  const res = await api("/profiles/me");
  if (!res.ok) throw new Error("Failed to get profile");
  return res.json();
}

export async function updateProfile(fullName?: string, username?: string, avatarUrl?: string) {
  const res = await api("/profiles", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName, username, avatar_url: avatarUrl }),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

// ── Subjects ──────────────────────────────────────────

export async function getSubjects() {
  const res = await api("/subjects");
  if (!res.ok) throw new Error("Failed to get subjects");
  return res.json();
}

// ── Problems ──────────────────────────────────────────

export interface Problem {
  id: string;
  user_id: string;
  subject_id: number;
  subject_name: string;
  original_image_url: string;
  problem_text: string;
  solution_steps: string | null;
  final_answer: string | null;
  estimated_study_time: number | null;
  memo: string | null;
  created_at: string;
  latest_review?: any | null;
  processing?: boolean;
}

export async function getProblems(page = 1, limit = 20, subjectId?: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const childId = getChildViewId();
  if (childId) params.set("user_id", childId);
  if (subjectId) params.set("subject_id", String(subjectId));

  const res = await api(`/problems?${params}`);
  if (!res.ok) throw new Error("Failed to get problems");
  return res.json() as Promise<{ problems: Problem[]; total: number; page: number; limit: number; user_name?: string | null }>;
}

export async function getProblemById(id: string) {
  const res = await api(`/problems/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to get problem");
  }
  return res.json();
}

export async function deleteProblem(id: string) {
  const res = await api(`/problems/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete problem");
}

export async function updateProblemMemo(id: string, memo: string) {
  const res = await api(`/problems/${id}/memo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo }),
  });
  if (!res.ok) throw new Error("Failed to update memo");
  return res.json();
}

export async function addManualReview(problemId: string, scheduledDate: string, note?: string) {
  const res = await api(`/problems/${problemId}/manual-reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_date: scheduledDate, note: note || null }),
  });
  if (!res.ok) throw new Error("Failed to add manual review");
  return res.json();
}

// ── Upload ────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wamljmirzqviipsomjyu.supabase.co";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "X-User-Id": getUserId() || "" };
  const token = getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function uploadProblem(file: File, subjectId: number) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("subject_id", String(subjectId));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function getProblem(id: string) {
  const res = await fetch(`/api/problems/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch problem");
  return res.json();
}

// ── Reviews ───────────────────────────────────────────

export async function getReviews(page = 1, limit = 20, filters?: {
  scheduledDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  completed?: string;
}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const childId = getChildViewId();
  if (childId) params.set("user_id", childId);
  if (filters?.scheduledDate) params.set("scheduled_date", filters.scheduledDate);
  if (filters?.rangeStart) params.set("range_start", filters.rangeStart);
  if (filters?.rangeEnd) params.set("range_end", filters.rangeEnd);
  if (filters?.completed !== undefined) params.set("completed", filters.completed);

  const res = await api(`/reviews?${params}`);
  if (!res.ok) throw new Error("Failed to get reviews");
  return res.json();
}

export async function updateReviewStatus(reviewId: string, completed: boolean) {
  const res = await api(`/reviews/${reviewId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!res.ok) throw new Error("Failed to update review status");
  return res.json();
}

export async function submitFeedback(reviewId: string, difficultyRating?: number, notes?: string) {
  const res = await api(`/reviews/${reviewId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty_rating: difficultyRating, notes }),
  });
  if (!res.ok) throw new Error("Failed to submit feedback");
  return res.json();
}

// ── Parent ────────────────────────────────────────────

export interface ChildSummary {
  child_id: string;
  child_name: string;
  total_problems: number;
  study_time_minutes: number;
  due_reviews: number;
  completed_reviews: number;
  completion_rate: number;
}

export async function getParentChildren() {
  const res = await api("/parent/children");
  if (!res.ok) throw new Error("Failed to get children");
  return res.json();
}

export async function addChild(childIdOrEmail: string) {
  const isEmail = childIdOrEmail.includes("@");
  const body = isEmail ? { email: childIdOrEmail } : { child_id: childIdOrEmail };
  const res = await api("/parent/child", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to add child");
  return res.json();
}

export async function removeChild(childId: string) {
  const res = await api(`/parent/child/${childId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove child");
  return res.json();
}
