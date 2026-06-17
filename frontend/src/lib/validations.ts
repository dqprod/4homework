import { z } from "zod";

// Auth
export const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(6, "パスワードは6文字以上必要です"),
});

export const signupSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(6, "パスワードは6文字以上必要です"),
  full_name: z.string().min(1, "名前を入力してください").max(64, "名前は64文字以内"),
  role: z.enum(["student", "parent"], { message: "ロールを選択してください" }),
  username: z.string().max(32).optional(),
});

// Upload
export const uploadSchema = z.object({
  subject_id: z.number().int().min(1, "教科を選択してください"),
  file: z.instanceof(File, { message: "画像ファイルを選択してください" }).refine(
    (f) => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type),
    "対応形式: JPEG / PNG / WebP / GIF"
  ).refine(
    (f) => f.size <= 5 * 1024 * 1024,
    "ファイルサイズは5MB以下"
  ),
});

// Profile
export const profileUpdateSchema = z.object({
  full_name: z.string().max(64).optional(),
  username: z.string().max(32).optional(),
});

// Child management
export const addChildSchema = z.object({
  child_id: z.string().uuid("有効な子供ID（UUID形式）を入力してください"),
});

// Review feedback
export const reviewFeedbackSchema = z.object({
  difficulty_rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(500).optional(),
});

// Manual review
export const manualReviewSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付形式 YYYY-MM-DD"),
  note: z.string().max(200).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type UploadInput = z.infer<typeof uploadSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ReviewFeedbackInput = z.infer<typeof reviewFeedbackSchema>;
export type ManualReviewInput = z.infer<typeof manualReviewSchema>;
