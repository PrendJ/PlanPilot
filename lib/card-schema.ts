import { z } from "zod";

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const checklistSchema = z
  .array(z.object({ id: z.string().trim().min(1).max(40), text: z.string().trim().min(1).max(300), done: z.boolean() }).strict())
  .max(50);
export type ChecklistItem = z.infer<typeof checklistSchema>[number];

const tags = z.array(z.string().trim().min(1).max(40)).max(20);
const dueDate = z.string().datetime({ offset: true }).nullable();

export const cardCreateSchema = z.object({
  columnId: z.string().cuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().max(10000).default(""),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  dueDate: dueDate.optional(),
  tags: tags.default([]),
  checklist: checklistSchema.default([]),
  assigneeIds: z.array(z.string().cuid()).max(16).default([]),
  index: z.number().int().min(0).max(10000).optional(),
});

export const cardPatchSchema = z.object({
  version: z.number().int().positive().optional(),
  columnId: z.string().cuid().optional(),
  index: z.number().int().min(0).max(10000).optional(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: dueDate.optional(),
  tags: tags.optional(),
  checklist: checklistSchema.optional(),
  assigneeIds: z.array(z.string().cuid()).max(16).optional(),
  archived: z.boolean().optional(),
});

export function checklistProgress(value: unknown) {
  const parsed = checklistSchema.safeParse(value);
  const items = parsed.success ? parsed.data : [];
  return { done: items.filter(item => item.done).length, total: items.length };
}
