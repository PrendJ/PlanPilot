import { buildLlmsTxt } from "@/lib/llms";

// Prices and the public origin come from the catalogue and APP_URL: render per request.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
