import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["create", "update", "move", "archive"]), cardId: z.string().nullable(), title: z.string().nullable(), description: z.string().nullable(), targetColumnId: z.string().nullable(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).nullable(), dueDate: z.string().nullable(), tags: z.array(z.string()).nullable(), reason: z.string() });
export const aiPatchSchema = z.object({ summary: z.string(), actions: z.array(actionSchema).max(30) });
export type AiPatch = z.infer<typeof aiPatchSchema>;

const responseSchema = { name: "plan_patch", strict: true, schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" }, actions: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["create", "update", "move", "archive"] }, cardId: { type: ["string", "null"] }, title: { type: ["string", "null"] }, description: { type: ["string", "null"] }, targetColumnId: { type: ["string", "null"] }, priority: { type: ["string", "null"], enum: ["LOW", "NORMAL", "HIGH", "URGENT", null] }, dueDate: { type: ["string", "null"] }, tags: { type: ["array", "null"], items: { type: "string" } }, reason: { type: "string" } }, required: ["action", "cardId", "title", "description", "targetColumnId", "priority", "dueDate", "tags", "reason"] } } }, required: ["summary", "actions"] } };

export async function planPatchFromText(input: { apiKey: string; model: string; workspaceName: string; userText: string; plan: unknown }) {
  const system = `You are BoardCue AI, a transparent board assistant. Convert the user's update into the smallest safe set of board mutations.

The CURRENT PLAN contains the exact, workspace-specific columns. Interpret status only from each column's ID, title and description. Never assume a fixed workflow or English status names. Never invent an existing card ID or column ID. Prefer updating a matching card over creating a duplicate. Preserve useful detail. Archive only when explicitly requested.

Never assign people, infer employee performance, rank workers, make employment decisions, or recommend work based on individual behaviour. If the update does not change the board, return zero actions. Dates must be ISO-8601 only when explicit or clearly inferable. Keep the summary concise and in the user's language.`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://boardcue.draftapps.it", "X-OpenRouter-Title": "BoardCue AI" },
    body: JSON.stringify({ model: input.model, messages: [{ role: "system", content: system }, { role: "user", content: `Workspace: ${input.workspaceName}\n\nCURRENT PLAN JSON:\n${JSON.stringify(input.plan)}\n\nUSER UPDATE:\n${input.userText}` }], response_format: { type: "json_schema", json_schema: responseSchema }, provider: { require_parameters: true, data_collection: "deny", zdr: true, allow_fallbacks: false } }),
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw?.error?.message || `OpenRouter error ${response.status}`);
  const content = raw?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no structured content");
  return { patch: aiPatchSchema.parse(typeof content === "string" ? JSON.parse(content) : content), usage: raw.usage || null, requestId: raw.id as string | undefined };
}
