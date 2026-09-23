import { NextResponse } from "next/server";
import { translator, type UiLocale } from "@/lib/i18n/core";
import { requestLocale } from "@/lib/i18n/server";

/** Stable error codes: clients branch on `code`, people read `error` (localized, never provider details). */
export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "ORIGIN_REJECTED",
  "READ_ONLY",
  "BOARD_CONFLICT",
  "CARD_CONFLICT",
  "QUOTA_EXHAUSTED",
  "AI_UNAVAILABLE",
  "AI_INVALID_PATCH",
  "AI_NOT_CONFIGURED",
  "PROPOSAL_EXPIRED",
  "PROPOSAL_STALE",
  "UNDO_CONFLICT",
  "NOT_UNDOABLE",
  "DICTATION_DISABLED",
  "AUDIO_REQUIRED",
  "AUDIO_TOO_LARGE",
  "TRANSCRIPTION_FAILED",
  "EMAIL_NOT_VERIFIED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_INACTIVE",
  "TWO_FACTOR_REQUIRED",
  "TWO_FACTOR_INVALID",
  "TWO_FACTOR_SETUP_REQUIRED",
  "MEMBER_LIMIT",
  "WORKSPACE_LIMIT",
  "COLUMN_LIMIT",
  "LAST_COLUMN",
  "LAST_OWNER",
  "INVITE_INVALID",
  "INVITE_WRONG_EMAIL",
  "BILLING_UNAVAILABLE",
  "OWNER_ONLY",
  "IMPORT_INVALID",
  "SERVER_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function errorMessage(code: ErrorCode, locale: UiLocale = "it", vars?: Record<string, string | number>) {
  return translator(locale)(`errors.${code}`, vars);
}

export function apiError(
  request: Request | null,
  code: ErrorCode,
  status: number,
  extra?: Record<string, unknown>,
  vars?: Record<string, string | number>,
) {
  const locale = request ? requestLocale(request) : "it";
  return NextResponse.json({ error: errorMessage(code, locale, vars), code, ...extra }, { status });
}
