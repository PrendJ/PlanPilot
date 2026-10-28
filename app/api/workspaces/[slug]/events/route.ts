import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { acquireStreamSlot } from "@/lib/stream-slots";

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
  const release = acquireStreamSlot(userId);
  if (!release) return new Response("Too many open streams", { status: 429, headers: { "Retry-After": "5" } });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closeStream = () => release();
  const stream = new ReadableStream({
    start(controller) {
      const started = Date.now();
      let lastRevision = -1;
      let lastBeat = Date.now();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        release();
        if (timer) clearTimeout(timer);
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      closeStream = close;
      request.signal.addEventListener("abort", close);
      if (request.signal.aborted) return close();
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      send("retry: 3000\n\n");
      const tick = async () => {
        if (closed) return;
        try {
          const row = await prisma.workspace.findFirst({
            where: { id: workspaceId, lifecycleStatus: "ACTIVE", organization: { lifecycleStatus: "ACTIVE" }, members: { some: { userId, user: { lifecycleStatus: "ACTIVE" } } } },
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
        if (closed) return;
        if (Date.now() - started > MAX_STREAM_MS) return close();
        timer = setTimeout(tick, POLL_MS);
      };
      void tick();
    },
    cancel() {
      closeStream();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
