import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["create", "update", "move", "archive"]),
  cardId: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  targetColumnId: z.string().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).nullable(),
  dueDate: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  reason: z.string(),
});

export const aiPatchSchema = z.object({
  summary: z.string(),
  actions: z.array(actionSchema).max(30),
});

export type AiPatch = z.infer<typeof aiPatchSchema>;

const responseSchema = {
  name: "plan_patch",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      actions: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["create", "update", "move", "archive"] },
            cardId: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            targetColumnId: { type: ["string", "null"] },
            priority: { type: ["string", "null"], enum: ["LOW", "NORMAL", "HIGH", "URGENT", null] },
            dueDate: { type: ["string", "null"] },
            tags: { type: ["array", "null"], items: { type: "string" } },
            reason: { type: "string" }
          },
          required: ["action", "cardId", "title", "description", "targetColumnId", "priority", "dueDate", "tags", "reason"]
        }
      }
    },
    required: ["summary", "actions"]
  }
};

export async function planPatchFromText(input: {
  apiKey: string;
  model: string;
  workspaceName: string;
  userText: string;
  plan: unknown;
}) {
  const system = `You are PlanPilot, an operations-plan maintainer. Convert the user's natural-language update into a minimal set of safe board mutations.

The board is the source of truth. You receive exact column and card IDs. Never invent an existing card ID or column ID.
Interpret status naturally: currently working/started -> In progress; completed/done -> Done; blocked/waiting on someone -> Waiting; later/not a priority -> Parked; clear next action -> Next; vague new item -> Inbox.
Prefer updating an existing matching card over creating duplicates. Preserve useful existing detail unless the user explicitly replaces it.
Only archive a card when the user explicitly says it should be removed/archived/cancelled. Never infer deletion.
If the user merely reports information that does not change the plan, return zero actions.
Dates must be ISO-8601 when explicit or clearly inferable; otherwise null.
Keep summaries concise and in the user's language.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://planpilot.draftapps.io",
      "X-OpenRouter-Title": "PlanPilot",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Workspace: ${input.workspaceName}\n\nCURRENT PLAN JSON:\n${JSON.stringify(input.plan)}\n\nUSER UPDATE:\n${input.userText}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: responseSchema },
      provider: { require_parameters: true },
    }),
  });

  const raw = await response.json();
  if (!response.ok) throw new Error(raw?.error?.message || `OpenRouter error ${response.status}`);
  const content = raw?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no structured content");
  const parsed = aiPatchSchema.parse(typeof content === "string" ? JSON.parse(content) : content);
  return { patch: parsed, usage: raw.usage || null };
}
