import { describe, expect, it } from "vitest";
import { selectPlanningModel } from "@/lib/planning-model";

const input = { planModel: "openai/gpt-5-nano", complexPlanModel: "openai/gpt-5-mini", plan: { columns: [] } };
describe("planning complexity routing", () => {
  it("uses Nano for a short update even with multiple field changes", () => {
    expect(selectPlanningModel({ ...input, text: "Sposta il preventivo in completati e imposta la scadenza a domani." })).toEqual({
      model: input.planModel,
      reason: "simple_update",
    });
  });
  it.each([
    ["Aggiornamento dettagliato ".repeat(60), "long_update"],
    ["Ho finito il preventivo. Ho iniziato il sito. Chiama il fornitore. Conferma la consegna. Archivia il contratto.", "many_statements"],
    ["Sposta tutte le schede in completati", "bulk_update"],
    ["Archivia tutte le attività", "bulk_update"],
  ])("uses Mini for complex updates (%s)", (text, reason) => {
    expect(selectPlanningModel({ ...input, text })).toEqual({ model: input.complexPlanModel, reason });
  });
  it("uses Mini for large contexts", () => {
    expect(selectPlanningModel({ ...input, text: "Aggiorna la scadenza", plan: { description: "x".repeat(20_000) } }).model).toBe(
      input.complexPlanModel,
    );
  });
  it("honours the admin choice including using the same model for both tiers", () => {
    expect(selectPlanningModel({ ...input, text: "Sposta tutte le schede", complexPlanModel: input.planModel }).model).toBe(
      input.planModel,
    );
  });
});
