import { DEFAULT_COMPLEX_PLANNING_MODEL, resolvePlanningModel } from "@/lib/ai-config";

/** Conservative, deterministic routing: no extra paid classifier call. Thresholds are heuristics. */
export function selectPlanningModel(input: { text: string; plan: unknown; planModel: string; complexPlanModel?: string }) {
  const text = input.text.trim();
  const statements = text.split(/[\n;.!?]+/).filter(part => part.trim().length > 10).length;
  const reason =
    text.length >= 1200
      ? "long_update"
      : statements >= 5
        ? "many_statements"
        : /\b(tutte le (schede|attivit[àa])|tutti i (task|compiti)|all (cards|tasks)|riorganizza|riprogramma|reorganize|reschedule)(?![\p{L}\p{N}_])/iu.test(
              text,
            )
          ? "bulk_update"
          : JSON.stringify(input.plan).length >= 20_000
            ? "large_context"
            : "simple_update";
  const complex = reason !== "simple_update";
  return {
    model: resolvePlanningModel(complex ? input.complexPlanModel || DEFAULT_COMPLEX_PLANNING_MODEL : input.planModel),
    reason,
  };
}
