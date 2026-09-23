import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 1500;
const HEARTBEAT_MS = 20_000;
const MAX_STREAM_MS = 5 * 60_000;

/**
 * Server-Sent Events: pushes the board revision as soon as it changes, so every open board refreshes
 * within ~2 s without client polling. The server-side check is a single indexed read per board.
 * Streams close after 5 minutes and EventSource reconnects automatically (access is re-checked).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const workspaceId = ctx.workspace.id;
  const userId = ctx.user.id;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const started = Date.now();
      let lastRevision = -1;
      let lastBeat = Date.now();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      send("retry: 3000\n\n");
      const tick = async () => {
        if (closed) return;
        try {
          const row = await prisma.workspace.findFirst({
            where: { id: workspaceId, members: { some: { userId } } },
            select: { revision: true },
          });
          if (!row) {
            send("event: gone\ndata: {}\n\n");
            return close();
          }
          if (row.revision !== lastRevision) {
            lastRevision = row.revision;
            send(`event: revision\ndata: ${row.revision}\n\n`);
          }
          if (Date.now() - lastBeat > HEARTBEAT_MS) {
            lastBeat = Date.now();
            send(": ping\n\n");
          }
        } catch {
          // Transient database error: keep the stream, try again on the next tick.
        }
        if (Date.now() - started > MAX_STREAM_MS) return close();
        timer = setTimeout(tick, POLL_MS);
      };
      void tick();
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
