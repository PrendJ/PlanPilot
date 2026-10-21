import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiModelsControl, type AiModelsState } from "@/components/AdminPanel";

describe("superadmin AI model comparison", () => {
  it("shows catalogue prices and ranks options by the stated sample cost", () => {
    const initial: AiModelsState = {
      current: { planModel: "expensive", complexPlanModel: "cheap", transcriptionModel: "voice" },
      options: {
        planning: [
          { id: "expensive", label: "Expensive", note: "Example", recommended: true, inputUsdPerMillion: 1, outputUsdPerMillion: 2, audioUsdPerMinute: null },
          { id: "cheap", label: "Cheap", note: "Example", recommended: false, inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4, audioUsdPerMinute: null },
        ],
        transcription: [
          { id: "voice", label: "Voice", note: "Example", recommended: true, inputUsdPerMillion: null, outputUsdPerMillion: null, audioUsdPerMinute: 0.0035 },
          { id: "turbo", label: "Turbo", note: "Example", recommended: false, inputUsdPerMillion: null, outputUsdPerMillion: null, audioUsdPerMinute: 0.0001998 },
          { id: "unknown", label: "Unknown", note: "Example", recommended: false, inputUsdPerMillion: null, outputUsdPerMillion: null, audioUsdPerMinute: null },
        ],
      },
    };
    const html = renderToStaticMarkup(createElement(AiModelsControl, { initial, editable: true, onChanged: () => undefined }));
    expect(html).toContain("Confronto costi");
    expect(html).toContain("Non misura la qualità");
    expect(html).toContain("$0,10");
    const rows = html.slice(html.indexOf("<tbody>"));
    expect(rows.indexOf("<strong>Cheap</strong>")).toBeLessThan(rows.indexOf("<strong>Expensive</strong>"));
    expect(rows.indexOf("<strong>Turbo</strong>")).toBeLessThan(rows.indexOf("<strong>Voice</strong>"));
    expect(html).toContain("Confronto costi dei modelli di dettatura");
    expect(html).toContain("$0,0002");
    expect(html).toContain("$0,007");
    expect(html).toContain("n.d.");
    expect(html).toContain("Modello per aggiornamenti complessi");
  });
});
