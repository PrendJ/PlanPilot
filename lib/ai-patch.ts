import { aiPatchSchema, type AiPatch } from "@/lib/openrouter";

export class InvalidAiPatchError extends Error {
  constructor() { super("L’AI ha proposto modifiche non valide. Nessuna modifica applicata: rivedi il testo e riprova."); }
}

/** Validate the entire batch before the first write. Do not resolve foreign IDs. */
export function validateAiPatch(
  input: unknown,
  scope: { columnIds: ReadonlySet<string>; cardIds: ReadonlySet<string> },
): AiPatch {
  const parsed = aiPatchSchema.safeParse(input);
  if (!parsed.success) throw new InvalidAiPatchError();
  const patch = parsed.data;
  const touched = new Set<string>();
  for (const action of patch.actions) {
    if (action.targetColumnId !== null && !scope.columnIds.has(action.targetColumnId)) throw new InvalidAiPatchError();
    if (action.action === "create") {
      if (action.cardId !== null || !action.title || !action.targetColumnId) throw new InvalidAiPatchError();
      continue;
    }
    if (!action.cardId || !scope.cardIds.has(action.cardId) || touched.has(action.cardId)) throw new InvalidAiPatchError();
    // One mutation per existing card also makes the existing per-card undo coherent.
    touched.add(action.cardId);
    const hasFields = [action.title, action.description, action.priority, action.dueDate, action.tags].some(value => value !== null);
    if (action.action === "move" && (!action.targetColumnId || hasFields)) throw new InvalidAiPatchError();
    if (action.action === "archive" && (action.targetColumnId !== null || hasFields)) throw new InvalidAiPatchError();
    if (action.action === "update" && !hasFields && action.targetColumnId === null) throw new InvalidAiPatchError();
  }
  return patch;
}
