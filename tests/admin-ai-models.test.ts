import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiModelsControl, type AiModelsState } from "@/components/AdminPanel";

describe("superadmin AI model comparison", () => {
  it("shows catalogue prices and ranks options by the stated sample cost", () => {
    const initial: AiModelsState = {
      current: { planModel: "expensive", transcriptionModel: "voice" },
      options: {
        planning: [
          { id: "expensive", label: "Expensive", note: "Example", recommended: true, inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
          { id: "cheap", label: "Cheap", note: "Example", recommended: false, inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
        ],
        transcription: [{ id: "voice", label: "Voice", note: "Example", recommended: true, inputUsdPerMillion: null, outputUsdPerMillion: null }],
      },
    };
    const html = renderToStaticMarkup(createElement(AiModelsControl, { initial, editable: true, onChanged: () => undefined }));
    expect(html).toContain("Confronto costi");
    expect(html).toContain("Non misura la qualità");
    expect(html).toContain("$0,10");
    const rows = html.slice(html.indexOf("<tbody>"));
    expect(rows.indexOf("<strong>Cheap</strong>")).toBeLessThan(rows.indexOf("<strong>Expensive</strong>"));
  });
});
