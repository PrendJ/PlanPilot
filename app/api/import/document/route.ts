import { safeJson, boundedFormData } from "@/lib/security";
import { NextResponse } from "next/server";
import { inflateRawSync } from "node:zlib";
import { boundedBytes } from "@/lib/security";
import { getApiUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { DocumentTextError, documentToText, googleDocsExportUrl } from "@/lib/document-text";
import { apiError } from "@/lib/errors";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_GOOGLE_BYTES = 2 * 1024 * 1024;
const GOOGLE_HOSTS = /^(docs\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/;

const inflate = (data: Uint8Array, maxBytes: number) => inflateRawSync(data, { maxOutputLength: maxBytes });

/**
 * Follows Google's export redirects only within Google's document hosts. A private document redirects to the
 * sign-in page instead: the server never uses the person's Google account, so only "anyone with the link" works.
 */
async function fetchGoogleDoc(exportUrl: string) {
  let url = exportUrl;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { Accept: "text/plain" } });
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get("location") || "", url);
      if (next.protocol !== "https:" || !GOOGLE_HOSTS.test(next.hostname)) return null;
      url = next.toString();
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("text/plain")) return null;
    const bytes = await boundedBytes(response, MAX_GOOGLE_BYTES);
    if (bytes.length > MAX_GOOGLE_BYTES) throw new DocumentTextError("DOCUMENT_UNREADABLE");
    return new TextDecoder().decode(bytes).replace(/^﻿/, "").trim();
  }
  return null;
}

/**
 * Text of a document to dictate from: an uploaded file (Word, Google Docs download, OpenDocument, RTF, HTML, text)
 * or a Google Docs link shared with "anyone with the link". The text goes back to the browser to be reviewed
 * before any AI request; the document itself is never stored.
 */
export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const limited = await rateLimit(`import-document:${user.id}`, 20, 60_000, request);
  if (limited) return limited;
  try {
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = (await safeJson(request)) as { url?: unknown };
      const exportUrl = typeof body.url === "string" ? googleDocsExportUrl(body.url) : null;
      if (!exportUrl) return apiError(request, "GOOGLE_DOC_INVALID_LINK", 400);
      const text = await fetchGoogleDoc(exportUrl).catch(error => {
        if (error instanceof DocumentTextError) throw error;
        return null;
      });
      if (text === null) return apiError(request, "GOOGLE_DOC_NOT_SHARED", 422);
      return NextResponse.json({ text, format: "google-docs" });
    }
    if (Number(request.headers.get("content-length") || 0) > MAX_FILE_BYTES + 64 * 1024) return apiError(request, "DOCUMENT_TOO_LARGE", 413);
    const file = (await boundedFormData(request))?.get("file");
    if (!(file instanceof File) || !file.size) return apiError(request, "INVALID_INPUT", 400);
    if (file.size > MAX_FILE_BYTES) return apiError(request, "DOCUMENT_TOO_LARGE", 413);
    const { text, format } = await documentToText(file.name, new Uint8Array(await file.arrayBuffer()), inflate);
    return NextResponse.json({ text, format });
  } catch (error) {
    if (error instanceof DocumentTextError) return apiError(request, error.message as "DOCUMENT_UNSUPPORTED", 422);
    // zlib limits and malformed archives end here: never echo document content.
    console.error("Document import failed", { userId: user.id, reason: error instanceof Error ? error.name : "unknown" });
    return apiError(request, "DOCUMENT_UNREADABLE", 422);
  }
}
