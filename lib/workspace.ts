import { prisma } from "@/lib/prisma";

export const DEFAULT_COLUMNS = [
  { title: "Inbox", kind: "INBOX", position: 0 },
  { title: "Next", kind: "NEXT", position: 1 },
  { title: "In progress", kind: "IN_PROGRESS", position: 2 },
  { title: "Waiting", kind: "WAITING", position: 3 },
  { title: "Done", kind: "DONE", position: 4 },
  { title: "Parked", kind: "PARKED", position: 5 },
];

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export async function createWorkspace(input: {
  name: string;
  slug?: string;
  userId: string;
  openrouterKeyEnv?: string;
  planModel?: string;
  transcriptionModel?: string;
}) {
  const slug = input.slug || slugify(input.name);
  return prisma.workspace.create({
    data: {
      name: input.name,
      slug,
      openrouterKeyEnv: input.openrouterKeyEnv || `OPENROUTER_KEY_${slug.toUpperCase().replace(/-/g, "_")}`,
      planModel: input.planModel || "openai/gpt-5-nano",
      transcriptionModel: input.transcriptionModel || "openai/gpt-4o-mini-transcribe",
      createdById: input.userId,
      members: { create: { userId: input.userId, role: "OWNER" } },
      columns: { create: DEFAULT_COLUMNS },
    },
  });
}

export function getWorkspaceApiKey(workspace: { slug: string; openrouterKeyEnv: string }) {
  if (workspace.openrouterKeyEnv && process.env[workspace.openrouterKeyEnv]) {
    return process.env[workspace.openrouterKeyEnv]!;
  }
  if (process.env.OPENROUTER_WORKSPACE_KEYS) {
    try {
      const map = JSON.parse(process.env.OPENROUTER_WORKSPACE_KEYS) as Record<string, string>;
      if (map[workspace.slug]) return map[workspace.slug];
    } catch {
      // ignored: caller will return a useful configuration error
    }
  }
  return null;
}
