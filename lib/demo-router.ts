import { keywords, normalizeText, relevance } from "@/lib/ai-context";
import type { DemoCard } from "@/lib/demo-planner";

/**
 * Deterministic stand-in for the home router in the public demo (no AI call, no network): splits free text
 * into excerpts and sends each one to the work or the personal board, or leaves it unassigned so the visitor
 * picks the board, exactly like the real home does when the model is unsure.
 */
export type DemoBoardKind = "work" | "personal";
export type DemoRouteBoard = { id: string; kind: DemoBoardKind; cards: DemoCard[] };
export type DemoSegment = { text: string; boardId: string | null };

const HINTS: Record<DemoBoardKind, RegExp> = {
  personal:
    /\b(casa|famiglia|banca|bollett|prato|giardin|spesa|latte|medico|dentist|donazion|sangue|auto\b|tagliando|compleann|regal|figli|scuola|palestra|carta d identita|mamma|papa|vacanz|condominio|home|family|bank|bills?\b|lawn|garden|grocer|milk|doctor|donation|blood|car\b|birthday|gift|kids|school|gym|passport|mum|mom|dad|holiday)/,
  work: /\b(client|preventiv|newsletter|gestional|catalog|report|fattur|riunion|meeting|progett|team|sito|campagn|offert|contratt|quote|invoice|project|website|campaign|proposal|contract|crm|analytics)/,
};

// Split before a new instruction joined by "e"/"and" ("chiama la banca e prepara il preventivo"), never inside a phrase.
const VERB_JOIN =
  /,?\s+(?:e|poi|e poi|and|then|and then)\s+(?=(?:chiama|prepara|prenota|ricorda|ricordami|devo|compra|paga|manda|scrivi|fissa|sposta|finisci|call|prepare|book|remind|buy|pay|send|write|schedule|move|finish)\b)/i;

export function splitDemoText(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .flatMap(part => part.split(VERB_JOIN))
    .map(part =>
      part
        .trim()
        .replace(/^[;,.]\s*/, "")
        .replace(/\s*[;,]$/, ""),
    )
    .filter(Boolean);
}

function score(text: string, board: DemoRouteBoard) {
  const value = ` ${normalizeText(text)} `;
  const words = keywords(text);
  const best = Math.max(0, ...board.cards.map(card => relevance(card, words)));
  return (HINTS[board.kind].test(value) ? 3 : 0) + (best >= 3 ? best : 0);
}

export function routeDemoText(text: string, boards: DemoRouteBoard[]): DemoSegment[] {
  return splitDemoText(text).map(part => {
    const ranked = boards.map(board => ({ board, score: score(part, board) })).sort((a, b) => b.score - a.score);
    const [first, second] = ranked;
    const sure = first && first.score > 0 && (!second || first.score > second.score);
    return { text: part, boardId: sure ? first.board.id : null };
  });
}
