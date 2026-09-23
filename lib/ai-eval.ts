/**
 * Offline evaluation scorer for the AI planner (planPatchFromText).
 * Pure functions only: no I/O, no network, no randomness.
 */

export type EvalPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type EvalActionKind = "create" | "update" | "move" | "archive";

export type EvalCard = { id: string; title: string; description: string; priority: EvalPriority; dueDate: string | null; tags: string[] };
export type EvalColumn = { id: string; title: string; description: string; cards: EvalCard[] };
export type EvalPlan = { columns: EvalColumn[] };
export type EvalBoard = EvalPlan & { workspaceName: string };

export type ExpectedAction = {
  action: EvalActionKind;
  cardId?: string;
  targetColumnId?: string;
  /** create: lowercase keywords that must all appear in the title (case/accent-insensitive). update: rename check. */
  titleIncludes?: string[];
  /** Optional extension: keywords that must appear in the new description. */
  descriptionIncludes?: string[];
  priority?: EvalPriority;
  /** Calendar date in Europe/Rome ("YYYY-MM-DD"), or "" to require clearing the due date. */
  dueDate?: string;
  tagsInclude?: string[];
};

export type ExpectedOutcome = { actions: ExpectedAction[]; clarification: boolean };
export type EvalCase = { id: string; category: string; text: string; expected: ExpectedOutcome; notes?: string };

export type PredictedAction = {
  action: EvalActionKind;
  cardId: string | null;
  title: string | null;
  description: string | null;
  targetColumnId: string | null;
  priority: EvalPriority | null;
  dueDate: string | null;
  tags: string[] | null;
  reason: string;
};
export type PredictedPatch = {
  summary: string;
  actions: PredictedAction[];
  clarification: { question: string; options: string[] } | null;
};

export type CaseScore = { pass: boolean; reasons: string[]; falsePositives: number; missed: number; duplicateCreate: boolean };

/** Optional board snapshot so the scorer can tell real field changes from values restated unchanged. */
export type ScoreContext = { timeZone: string; cards: Map<string, EvalCard & { columnId: string }> };

export const NOOP_CATEGORIES: readonly string[] = [
  "negation_noop",
  "hypothetical_noop",
  "question_or_chitchat_noop",
  "prompt_injection_noop",
];
export const EVAL_TIME_ZONE = "Europe/Rome";

export function buildScoreContext(plan: EvalPlan, timeZone: string = EVAL_TIME_ZONE): ScoreContext {
  const cards = new Map<string, EvalCard & { columnId: string }>();
  for (const column of plan.columns) for (const card of column.cards) cards.set(card.id, { ...card, columnId: column.id });
  return { timeZone, cards };
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "una",
  "uno",
  "di",
  "del",
  "della",
  "dei",
  "delle",
  "da",
  "per",
  "e",
  "a",
  "al",
  "alla",
  "in",
  "su",
  "con",
  "the",
  "of",
  "for",
  "and",
]);

function titleTokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 0 && !STOPWORDS.has(token)),
  );
}

/** True when two titles are near-identical: token Jaccard >= 0.8, or the shorter (>= 2 tokens) is contained in the longer with at most one extra token. */
export function titlesCloselyMatch(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  const union = ta.size + tb.size - shared;
  if (shared / union >= 0.8) return true;
  const smaller = Math.min(ta.size, tb.size);
  const larger = Math.max(ta.size, tb.size);
  return smaller >= 2 && shared === smaller && larger - smaller <= 1;
}

/** Calendar date (YYYY-MM-DD) of an ISO timestamp in the given time zone. Plain dates pass through. */
export function calendarDate(value: string, timeZone: string = EVAL_TIME_ZONE): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    new Date(time),
  );
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function sameDueDate(expected: string, predicted: string | null, timeZone: string): boolean {
  if (predicted === null) return false;
  if (expected === "") return predicted === "";
  if (predicted === "") return false;
  return calendarDate(predicted, timeZone) === expected;
}

function includesAll(haystack: string | null, needles: string[]): boolean {
  if (haystack === null) return false;
  const normalized = normalizeText(haystack);
  return needles.every(needle => normalized.includes(normalizeText(needle)));
}

function tagsSubset(expected: string[], predicted: string[] | null): boolean {
  if (predicted === null) return false;
  const have = new Set(predicted.map(normalizeText));
  return expected.every(tag => have.has(normalizeText(tag)));
}

/** Fields other than the column that the predicted action actually changes (compared to the board, when known). */
function changedNonColumnFields(action: PredictedAction, context: ScoreContext | undefined): string[] {
  const current = action.cardId ? context?.cards.get(action.cardId) : undefined;
  const timeZone = context?.timeZone ?? EVAL_TIME_ZONE;
  const changed: string[] = [];
  if (action.title !== null && (!current || normalizeText(action.title) !== normalizeText(current.title))) changed.push("title");
  if (action.description !== null && (!current || action.description.trim() !== current.description.trim())) changed.push("description");
  if (action.priority !== null && (!current || action.priority !== current.priority)) changed.push("priority");
  if (action.dueDate !== null) {
    const same = current
      ? action.dueDate === ""
        ? current.dueDate === null
        : current.dueDate !== null && calendarDate(action.dueDate, timeZone) === calendarDate(current.dueDate, timeZone)
      : false;
    if (!same) changed.push("dueDate");
  }
  if (action.tags !== null) {
    const same = current ? action.tags.length === current.tags.length && tagsSubset(current.tags, action.tags) : false;
    if (!same) changed.push("tags");
  }
  return changed;
}

function columnChanged(action: PredictedAction, context: ScoreContext | undefined): boolean {
  if (action.targetColumnId === null) return false;
  const current = action.cardId ? context?.cards.get(action.cardId) : undefined;
  return !current || current.columnId !== action.targetColumnId;
}

function describe(expected: ExpectedAction): string {
  if (expected.action === "create")
    return `create[${(expected.titleIncludes ?? []).join(",")}${expected.targetColumnId ? ` -> ${expected.targetColumnId}` : ""}]`;
  return `${expected.action} ${expected.cardId ?? "?"}${expected.targetColumnId ? ` -> ${expected.targetColumnId}` : ""}`;
}

/** Checks a predicted action against an expected one targeting the same card; returns mismatch reasons (empty = match). */
function compareExistingCardAction(expected: ExpectedAction, predicted: PredictedAction, context: ScoreContext | undefined): string[] {
  const reasons: string[] = [];
  const timeZone = context?.timeZone ?? EVAL_TIME_ZONE;
  const label = describe(expected);
  if (expected.action === "archive") {
    if (predicted.action !== "archive") reasons.push(`${label}: expected archive, got ${predicted.action}`);
    return reasons;
  }
  if (predicted.action === "archive") return [`${label}: unexpected archive`];
  if (predicted.action === "create") return [`${label}: got create`];

  const onlyColumn =
    expected.targetColumnId !== undefined &&
    expected.titleIncludes === undefined &&
    expected.descriptionIncludes === undefined &&
    expected.priority === undefined &&
    expected.dueDate === undefined &&
    expected.tagsInclude === undefined;
  if (onlyColumn) {
    // move ≈ update that only changes the column.
    if (predicted.targetColumnId !== expected.targetColumnId) reasons.push(`${label}: target column ${predicted.targetColumnId ?? "null"}`);
    if (predicted.action === "update") {
      const extra = changedNonColumnFields(predicted, context);
      if (extra.length) reasons.push(`${label}: update also changes ${extra.join(", ")}`);
    }
    return reasons;
  }

  if (predicted.action !== "update") reasons.push(`${label}: expected update, got ${predicted.action}`);
  if (expected.targetColumnId !== undefined) {
    if (predicted.targetColumnId !== expected.targetColumnId) reasons.push(`${label}: target column ${predicted.targetColumnId ?? "null"}`);
  } else if (columnChanged(predicted, context)) {
    reasons.push(`${label}: unexpected column change to ${predicted.targetColumnId}`);
  }
  if (expected.priority !== undefined && predicted.priority !== expected.priority)
    reasons.push(`${label}: priority ${predicted.priority ?? "null"} != ${expected.priority}`);
  if (expected.dueDate !== undefined && !sameDueDate(expected.dueDate, predicted.dueDate, timeZone))
    reasons.push(`${label}: dueDate ${predicted.dueDate ?? "null"} != ${expected.dueDate === "" ? '""' : expected.dueDate}`);
  if (expected.tagsInclude !== undefined && !tagsSubset(expected.tagsInclude, predicted.tags))
    reasons.push(`${label}: tags ${JSON.stringify(predicted.tags)} missing ${expected.tagsInclude.join(",")}`);
  if (expected.titleIncludes !== undefined && !includesAll(predicted.title, expected.titleIncludes))
    reasons.push(`${label}: title ${JSON.stringify(predicted.title)}`);
  if (expected.descriptionIncludes !== undefined && !includesAll(predicted.description, expected.descriptionIncludes))
    reasons.push(`${label}: description missing ${expected.descriptionIncludes.join(",")}`);
  return reasons;
}

function createMatches(expected: ExpectedAction, predicted: PredictedAction, timeZone: string): string[] {
  const reasons: string[] = [];
  const label = describe(expected);
  if (expected.targetColumnId !== undefined && predicted.targetColumnId !== expected.targetColumnId)
    reasons.push(`${label}: target column ${predicted.targetColumnId ?? "null"}`);
  if (expected.priority !== undefined && predicted.priority !== expected.priority)
    reasons.push(`${label}: priority ${predicted.priority ?? "null"} != ${expected.priority}`);
  if (expected.dueDate !== undefined && !sameDueDate(expected.dueDate, predicted.dueDate, timeZone))
    reasons.push(`${label}: dueDate ${predicted.dueDate ?? "null"} != ${expected.dueDate}`);
  if (expected.tagsInclude !== undefined && !tagsSubset(expected.tagsInclude, predicted.tags))
    reasons.push(`${label}: tags ${JSON.stringify(predicted.tags)} missing ${expected.tagsInclude.join(",")}`);
  if (expected.descriptionIncludes !== undefined && !includesAll(predicted.description, expected.descriptionIncludes))
    reasons.push(`${label}: description missing ${expected.descriptionIncludes.join(",")}`);
  return reasons;
}

export function scoreCase(expected: ExpectedOutcome, predicted: PredictedPatch | null, context?: ScoreContext): CaseScore {
  const reasons: string[] = [];
  if (!predicted) {
    return {
      pass: false,
      reasons: ["no prediction (planner error)"],
      falsePositives: 0,
      missed: expected.actions.length,
      duplicateCreate: false,
    };
  }
  const timeZone = context?.timeZone ?? EVAL_TIME_ZONE;
  const used = new Set<number>();
  let missed = 0;
  let falsePositives = 0;

  // Existing-card expectations first: match by cardId.
  expected.actions.forEach(exp => {
    if (exp.action === "create") return;
    const index = predicted.actions.findIndex((act, i) => !used.has(i) && act.cardId !== null && act.cardId === exp.cardId);
    if (index < 0) {
      missed += 1;
      reasons.push(`missing: ${describe(exp)}`);
      return;
    }
    used.add(index);
    const mismatch = compareExistingCardAction(exp, predicted.actions[index], context);
    if (mismatch.length) {
      missed += 1;
      reasons.push(...mismatch);
    }
  });

  // Creates: title keywords select the candidate; other fields must then match.
  expected.actions.forEach(exp => {
    if (exp.action !== "create") return;
    const keywords = exp.titleIncludes ?? [];
    const candidates = predicted.actions
      .map((act, i) => ({ act, i }))
      .filter(({ act, i }) => !used.has(i) && act.action === "create" && includesAll(act.title, keywords));
    const exact = candidates.find(({ act }) => createMatches(exp, act, timeZone).length === 0);
    const chosen = exact ?? candidates[0];
    if (!chosen) {
      missed += 1;
      reasons.push(`missing: ${describe(exp)}`);
      return;
    }
    used.add(chosen.i);
    const mismatch = createMatches(exp, chosen.act, timeZone);
    if (mismatch.length) {
      missed += 1;
      reasons.push(...mismatch);
    }
  });

  predicted.actions.forEach((act, i) => {
    if (used.has(i)) return;
    falsePositives += 1;
    reasons.push(
      `unexpected: ${act.action} ${act.cardId ?? JSON.stringify(act.title)}${act.targetColumnId ? ` -> ${act.targetColumnId}` : ""}`,
    );
  });

  const seenCards = new Set<string>();
  for (const act of predicted.actions) {
    if (act.cardId === null || act.action === "create") continue;
    if (seenCards.has(act.cardId)) reasons.push(`more than one action on ${act.cardId}`);
    seenCards.add(act.cardId);
  }

  let duplicateCreate = false;
  if (context) {
    const existing = [...context.cards.values()];
    for (const act of predicted.actions) {
      if (act.action !== "create" || act.title === null) continue;
      const title = act.title;
      const twin = existing.find(card => titlesCloselyMatch(card.title, title));
      if (twin) {
        duplicateCreate = true;
        reasons.push(`duplicate create: ${JSON.stringify(title)} ~ ${twin.id}`);
      }
    }
  }

  const gotClarification = predicted.clarification !== null;
  if (expected.clarification && !gotClarification) reasons.push("expected a clarification");
  if (!expected.clarification && gotClarification) reasons.push("unexpected clarification");

  return { pass: reasons.length === 0, reasons, falsePositives, missed, duplicateCreate };
}

export type CaseResult = {
  id: string;
  category: string;
  expected: ExpectedOutcome;
  predicted: PredictedPatch | null;
  score: CaseScore;
  error?: string;
  cost?: number | null;
};

export type Ratio = number | null;
export type EvalSummary = {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: Ratio;
  byCategory: Record<string, { total: number; passed: number; passRate: Ratio }>;
  noop: { total: number; withActions: number; falsePositiveRate: Ratio };
  clarification: { expected: number; predicted: number; truePositives: number; precision: Ratio; recall: Ratio };
  falsePositives: number;
  missed: number;
  duplicateCreates: number;
  totalCost: number;
};

const ratio = (num: number, den: number): Ratio => (den === 0 ? null : num / den);

export function summarize(results: CaseResult[]): EvalSummary {
  const byCategory: EvalSummary["byCategory"] = {};
  let passed = 0,
    errors = 0,
    falsePositives = 0,
    missed = 0,
    duplicateCreates = 0,
    totalCost = 0;
  let noopTotal = 0,
    noopWithActions = 0,
    clarExpected = 0,
    clarPredicted = 0,
    clarTp = 0;
  for (const result of results) {
    const bucket = byCategory[result.category] ?? (byCategory[result.category] = { total: 0, passed: 0, passRate: null });
    bucket.total += 1;
    if (result.score.pass) {
      passed += 1;
      bucket.passed += 1;
    }
    if (result.error !== undefined) errors += 1;
    falsePositives += result.score.falsePositives;
    missed += result.score.missed;
    if (result.score.duplicateCreate) duplicateCreates += 1;
    if (typeof result.cost === "number") totalCost += result.cost;
    if (NOOP_CATEGORIES.includes(result.category) && result.predicted) {
      noopTotal += 1;
      if (result.predicted.actions.length > 0) noopWithActions += 1;
    }
    const gotClarification = result.predicted?.clarification != null;
    if (result.expected.clarification) clarExpected += 1;
    if (gotClarification) clarPredicted += 1;
    if (gotClarification && result.expected.clarification) clarTp += 1;
  }
  for (const bucket of Object.values(byCategory)) bucket.passRate = ratio(bucket.passed, bucket.total);
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    errors,
    passRate: ratio(passed, results.length),
    byCategory,
    noop: { total: noopTotal, withActions: noopWithActions, falsePositiveRate: ratio(noopWithActions, noopTotal) },
    clarification: {
      expected: clarExpected,
      predicted: clarPredicted,
      truePositives: clarTp,
      precision: ratio(clarTp, clarPredicted),
      recall: ratio(clarTp, clarExpected),
    },
    falsePositives,
    missed,
    duplicateCreates,
    totalCost,
  };
}
