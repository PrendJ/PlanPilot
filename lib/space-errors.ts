import { apiError, type ErrorCode } from "@/lib/errors";
export function spaceError(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (["FORBIDDEN", "READ_ONLY", "NOT_FOUND", "INVALID_INPUT", "MEMBER_LIMIT"].includes(code))
    return apiError(
      request,
      code as ErrorCode,
      code === "READ_ONLY" ? 423 : code === "NOT_FOUND" ? 404 : code === "INVALID_INPUT" ? 400 : code === "MEMBER_LIMIT" ? 402 : 403,
    );
  throw error;
}
