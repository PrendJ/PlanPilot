import { NextResponse } from "next/server";
import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceApiKey } from "@/lib/workspace";

function formatFromMime(mime: string) { if (mime.includes("webm")) return "webm"; if (mime.includes("ogg")) return "ogg"; if (mime.includes("mp4") || mime.includes("m4a")) return "m4a"; if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3"; if (mime.includes("wav")) return "wav"; return "webm"; }

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!workspace.dictationEnabled) return NextResponse.json({ error: "La dettatura è disattivata per questo workspace" }, { status: 403 });
  const apiKey = getWorkspaceApiKey(workspace);
  if (!apiKey) return NextResponse.json({ error: "OpenRouter key missing" }, { status: 503 });
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "Audio required" }, { status: 400 });
  if (audio.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Audio too large (20 MB max)" }, { status: 413 });
  const buffer = Buffer.from(await audio.arrayBuffer());
  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://boardcue.draftapps.it", "X-OpenRouter-Title": "BoardCue AI" }, body: JSON.stringify({ model: workspace.transcriptionModel, input_audio: { data: buffer.toString("base64"), format: formatFromMime(audio.type) }, language: "it" }) });
  const raw = await response.json();
  if (!response.ok) return NextResponse.json({ error: raw?.error?.message || "Transcription failed" }, { status: response.status });
  return NextResponse.json({ text: raw.text, usage: raw.usage || null });
}
