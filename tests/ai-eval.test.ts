import { describe, expect, it } from "vitest";
import boardJson from "./fixtures/ai-eval/board.json";
import casesJson from "./fixtures/ai-eval/cases.json";
import {
  NOOP_CATEGORIES,
  buildScoreContext,
  calendarDate,
  scoreCase,
  summarize,
  titlesCloselyMatch,
  type CaseResult,
  type EvalBoard,
  type EvalCase,
  type ExpectedAction,
  type ExpectedOutcome,
  type PredictedAction,
  type PredictedPatch,
} from "@/lib/ai-eval";

const board = boardJson as EvalBoard;
const cases = casesJson as EvalCase[];
const context = buildScoreContext(board);
const columnIds = new Set(board.columns.map(column => column.id));
const cardIds = new Set(board.columns.flatMap(column => column.cards.map(card => card.id)));

const EXPECTED_CATEGORIES: Record<string, number> = {
  move_done: 20,
  move_in_progress: 16,
  move_blocked_waiting: 14,
  move_review: 8,
  create_new: 22,
  due_date_explicit: 10,
  due_date_relative: 16,
  priority: 12,
  multi_card: 16,
  negation_noop: 12,
  hypothetical_noop: 10,
  question_or_chitchat_noop: 8,
  ambiguity_clarification: 12,
  archive_explicit: 6,
  update_description_or_tags: 8,
  prompt_injection_noop: 6,
  english_input: 4,
};

function act(partial: Partial<PredictedAction> & Pick<PredictedAction, "action">): PredictedAction {
  return {
    cardId: null,
    title: null,
    description: null,
    targetColumnId: null,
    priority: null,
    dueDate: null,
    tags: null,
    reason: "test",
    ...partial,
  };
}
function patch(actions: PredictedAction[], clarification: PredictedPatch["clarification"] = null): PredictedPatch {
  return { summary: "test", actions, clarification };
}
function outcome(actions: ExpectedAction[], clarification = false): ExpectedOutcome {
  return { actions, clarification };
}

/** Builds the prediction an ideal planner would return for a case. */
function idealPrediction(expected: ExpectedOutcome): PredictedPatch {
  const actions = expected.actions.map(exp =>
    act({
      action: exp.action,
      cardId: exp.cardId ?? null,
      targetColumnId: exp.targetColumnId ?? (exp.action === "create" ? "col_todo" : null),
      title: exp.titleIncludes ? `${exp.titleIncludes.join(" ")} nuovo` : null,
      description: exp.descriptionIncludes ? exp.descriptionIncludes.join(" ") : null,
      priority: exp.priority ?? null,
      dueDate: exp.dueDate === undefined ? null : exp.dueDate === "" ? "" : `${exp.dueDate}T18:00:00+02:00`,
      tags: exp.tagsInclude ?? null,
    }),
  );
  return patch(actions, expected.clarification ? { question: "Quale?", options: ["A", "B"] } : null);
}

describe("ai-eval dataset integrity", () => {
  it("board has the expected columns and ~28 unique cards", () => {
    expect([...columnIds]).toEqual(["col_inbox", "col_todo", "col_doing", "col_waiting", "col_review", "col_done"]);
    const allCards = board.columns.flatMap(column => column.cards);
    expect(allCards.length).toBeGreaterThanOrEqual(26);
    expect(new Set(allCards.map(card => card.id)).size).toBe(allCards.length);
    for (const card of allCards) if (card.dueDate !== null) expect(Number.isFinite(Date.parse(card.dueDate))).toBe(true);
  });

  it("has exactly 200 cases with unique, sequential ids", () => {
    expect(cases).toHaveLength(200);
    expect(new Set(cases.map(c => c.id)).size).toBe(200);
    cases.forEach((c, i) => expect(c.id).toBe(`E${String(i + 1).padStart(3, "0")}`));
    for (const c of cases) expect(c.text.trim().length).toBeGreaterThan(0);
  });

  it("covers every category with the planned counts", () => {
    const counts: Record<string, number> = {};
    for (const c of cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_CATEGORIES);
    for (const count of Object.values(counts)) expect(count).toBeGreaterThan(0);
  });

  it("references only existing card and column ids, with well-formed fields", () => {
    for (const c of cases) {
      for (const exp of c.expected.actions) {
        if (exp.cardId !== undefined) expect(cardIds.has(exp.cardId), `${c.id} cardId ${exp.cardId}`).toBe(true);
        if (exp.targetColumnId !== undefined) expect(columnIds.has(exp.targetColumnId), `${c.id} column ${exp.targetColumnId}`).toBe(true);
        if (exp.action === "create") {
          expect(exp.cardId, c.id).toBeUndefined();
          expect(exp.titleIncludes?.length, c.id).toBeGreaterThan(0);
          for (const kw of exp.titleIncludes ?? []) expect(kw, c.id).toBe(kw.toLowerCase());
        } else {
          expect(exp.cardId, c.id).toBeDefined();
        }
        if (exp.action === "move") expect(exp.targetColumnId, c.id).toBeDefined();
        if (exp.dueDate !== undefined && exp.dueDate !== "") expect(exp.dueDate, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (exp.priority !== undefined) expect(["LOW", "NORMAL", "HIGH", "URGENT"]).toContain(exp.priority);
      }
      const existing = c.expected.actions.filter(exp => exp.action !== "create").map(exp => exp.cardId);
      expect(new Set(existing).size, `${c.id} one action per card`).toBe(existing.length);
    }
  });

  it("moves never target the column a card is already in", () => {
    for (const c of cases)
      for (const exp of c.expected.actions) {
        if (exp.action !== "move" || !exp.cardId) continue;
        expect(context.cards.get(exp.cardId)?.columnId, `${c.id}`).not.toBe(exp.targetColumnId);
      }
  });

  it("noop categories expect zero actions and no clarification", () => {
    for (const c of cases.filter(c => NOOP_CATEGORIES.includes(c.category))) {
      expect(c.expected.actions, c.id).toHaveLength(0);
      expect(c.expected.clarification, c.id).toBe(false);
    }
  });

  it("clarification cases expect a clarification and zero actions; others do not", () => {
    for (const c of cases) {
      if (c.category === "ambiguity_clarification") {
        expect(c.expected.clarification, c.id).toBe(true);
        expect(c.expected.actions, c.id).toHaveLength(0);
      } else {
        expect(c.expected.clarification, c.id).toBe(false);
      }
    }
  });

  it("multi_card cases expect 2-3 actions and other action categories exactly one", () => {
    for (const c of cases) {
      if (c.category === "multi_card") expect(c.expected.actions.length, c.id).toBeGreaterThanOrEqual(2);
      if (c.category === "multi_card") expect(c.expected.actions.length, c.id).toBeLessThanOrEqual(3);
      if (["move_done", "move_in_progress", "move_blocked_waiting", "move_review", "archive_explicit", "priority"].includes(c.category))
        expect(c.expected.actions, c.id).toHaveLength(1);
    }
  });

  it("an ideal prediction passes every case (dataset and scorer are consistent)", () => {
    for (const c of cases) {
      const score = scoreCase(c.expected, idealPrediction(c.expected), context);
      expect(score.reasons, c.id).toEqual([]);
      expect(score.pass, c.id).toBe(true);
    }
  });
});

describe("scoreCase", () => {
  const moveDone = outcome([{ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }]);

  it("accepts a move and an update that only changes the column as equivalent", () => {
    expect(
      scoreCase(moveDone, patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" })]), context).pass,
    ).toBe(true);
    expect(
      scoreCase(moveDone, patch([act({ action: "update", cardId: "card_newsletter_q3", targetColumnId: "col_done" })]), context).pass,
    ).toBe(true);
  });

  it("treats restated unchanged fields as no change when the board is known", () => {
    const restated = act({
      action: "update",
      cardId: "card_newsletter_q3",
      targetColumnId: "col_done",
      priority: "NORMAL",
      title: "Newsletter Q3",
      dueDate: "2026-09-30T16:00:00Z",
    });
    expect(scoreCase(moveDone, patch([restated]), context).pass).toBe(true);
    expect(scoreCase(moveDone, patch([restated])).pass).toBe(false);
  });

  it("rejects an update that changes other fields when only a move was expected", () => {
    const score = scoreCase(
      moveDone,
      patch([act({ action: "update", cardId: "card_newsletter_q3", targetColumnId: "col_done", priority: "URGENT" })]),
      context,
    );
    expect(score.pass).toBe(false);
    expect(score.missed).toBe(1);
    expect(score.reasons.join(" ")).toContain("priority");
  });

  it("rejects the wrong column or the wrong card", () => {
    expect(
      scoreCase(moveDone, patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_review" })]), context).pass,
    ).toBe(false);
    const wrongCard = scoreCase(
      moveDone,
      patch([act({ action: "move", cardId: "card_newsletter_premium", targetColumnId: "col_done" })]),
      context,
    );
    expect(wrongCard).toMatchObject({ pass: false, missed: 1, falsePositives: 1 });
  });

  it("is order-insensitive for multiple actions", () => {
    const expected = outcome([
      { action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" },
      { action: "update", cardId: "card_seo_audit_verdi", dueDate: "2026-09-30" },
      { action: "create", titleIncludes: ["ssl"] },
    ]);
    const predicted = patch([
      act({ action: "create", title: "Rinnovo SSL Colombo", targetColumnId: "col_todo" }),
      act({ action: "update", cardId: "card_seo_audit_verdi", dueDate: "2026-09-30T18:00:00+02:00" }),
      act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }),
    ]);
    expect(scoreCase(expected, predicted, context)).toEqual({
      pass: true,
      reasons: [],
      falsePositives: 0,
      missed: 0,
      duplicateCreate: false,
    });
  });

  it("compares due dates by calendar day in Europe/Rome", () => {
    const expected = outcome([{ action: "update", cardId: "card_backup_server", dueDate: "2026-09-25" }]);
    const ok = ["2026-09-25T09:00:00+02:00", "2026-09-24T22:30:00Z", "2026-09-25T23:59:00+02:00", "2026-09-25"];
    for (const dueDate of ok)
      expect(scoreCase(expected, patch([act({ action: "update", cardId: "card_backup_server", dueDate })]), context).pass, dueDate).toBe(
        true,
      );
    const bad = ["2026-09-25T22:30:00Z", "2026-09-24T21:59:00Z", "", "not a date"];
    for (const dueDate of bad)
      expect(scoreCase(expected, patch([act({ action: "update", cardId: "card_backup_server", dueDate })]), context).pass, dueDate).toBe(
        false,
      );
    expect(scoreCase(expected, patch([act({ action: "update", cardId: "card_backup_server" })]), context).pass).toBe(false);
    expect(calendarDate("2026-10-24T23:30:00Z")).toBe("2026-10-25");
  });

  it("requires an empty string to clear a due date", () => {
    const expected = outcome([{ action: "update", cardId: "card_migrazione_wordpress_verdi", dueDate: "" }]);
    expect(
      scoreCase(expected, patch([act({ action: "update", cardId: "card_migrazione_wordpress_verdi", dueDate: "" })]), context).pass,
    ).toBe(true);
    expect(
      scoreCase(expected, patch([act({ action: "update", cardId: "card_migrazione_wordpress_verdi", dueDate: null })]), context).pass,
    ).toBe(false);
  });

  it("checks priority exactly, tags as a subset, and flags unexpected column changes on updates", () => {
    const expected = outcome([{ action: "update", cardId: "card_backup_server", priority: "URGENT", tagsInclude: ["sicurezza"] }]);
    expect(
      scoreCase(
        expected,
        patch([
          act({ action: "update", cardId: "card_backup_server", priority: "URGENT", tags: ["Sicurezza", "interno", "infrastruttura"] }),
        ]),
        context,
      ).pass,
    ).toBe(true);
    expect(
      scoreCase(expected, patch([act({ action: "update", cardId: "card_backup_server", priority: "HIGH", tags: ["sicurezza"] })]), context)
        .pass,
    ).toBe(false);
    expect(
      scoreCase(expected, patch([act({ action: "update", cardId: "card_backup_server", priority: "URGENT", tags: ["interno"] })]), context)
        .pass,
    ).toBe(false);
    expect(
      scoreCase(
        expected,
        patch([
          act({ action: "update", cardId: "card_backup_server", priority: "URGENT", tags: ["sicurezza"], targetColumnId: "col_todo" }),
        ]),
        context,
      ).pass,
    ).toBe(true);
    expect(
      scoreCase(
        expected,
        patch([
          act({ action: "update", cardId: "card_backup_server", priority: "URGENT", tags: ["sicurezza"], targetColumnId: "col_done" }),
        ]),
        context,
      ).pass,
    ).toBe(false);
  });

  it("matches creates by column and accent/case-insensitive title keywords", () => {
    const expected = outcome([{ action: "create", targetColumnId: "col_todo", titleIncludes: ["attivita", "figma"] }]);
    expect(
      scoreCase(expected, patch([act({ action: "create", title: "Attività: rinnovo licenza FIGMA", targetColumnId: "col_todo" })]), context)
        .pass,
    ).toBe(true);
    expect(
      scoreCase(
        expected,
        patch([act({ action: "create", title: "Attività: rinnovo licenza Figma", targetColumnId: "col_inbox" })]),
        context,
      ).pass,
    ).toBe(false);
    expect(
      scoreCase(expected, patch([act({ action: "create", title: "Rinnovo licenza", targetColumnId: "col_todo" })]), context),
    ).toMatchObject({ pass: false, missed: 1, falsePositives: 1 });
  });

  it("requires archive for explicit archive requests", () => {
    const expected = outcome([{ action: "archive", cardId: "card_kickoff_verdi" }]);
    expect(scoreCase(expected, patch([act({ action: "archive", cardId: "card_kickoff_verdi" })]), context).pass).toBe(true);
    expect(
      scoreCase(expected, patch([act({ action: "move", cardId: "card_kickoff_verdi", targetColumnId: "col_done" })]), context).pass,
    ).toBe(false);
  });

  it("counts extra actions as false positives, including on noop cases", () => {
    const noop = outcome([]);
    expect(scoreCase(noop, patch([]), context)).toEqual({ pass: true, reasons: [], falsePositives: 0, missed: 0, duplicateCreate: false });
    const score = scoreCase(
      noop,
      patch([
        act({ action: "archive", cardId: "card_kickoff_verdi" }),
        act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }),
      ]),
      context,
    );
    expect(score).toMatchObject({ pass: false, falsePositives: 2, missed: 0 });
    const extra = scoreCase(
      moveDone,
      patch([
        act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }),
        act({ action: "update", cardId: "card_logo_bianchi", priority: "HIGH" }),
      ]),
      context,
    );
    expect(extra).toMatchObject({ pass: false, falsePositives: 1, missed: 0 });
  });

  it("flags two actions on the same card", () => {
    const score = scoreCase(
      moveDone,
      patch([
        act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }),
        act({ action: "update", cardId: "card_newsletter_q3", priority: "HIGH" }),
      ]),
      context,
    );
    expect(score.pass).toBe(false);
    expect(score.reasons.some(reason => reason.includes("more than one action"))).toBe(true);
  });

  it("detects creates that duplicate an existing card", () => {
    const score = scoreCase(moveDone, patch([act({ action: "create", title: "newsletter Q3", targetColumnId: "col_done" })]), context);
    expect(score).toMatchObject({ pass: false, duplicateCreate: true, missed: 1, falsePositives: 1 });
    const expectedCreate = outcome([{ action: "create", titleIncludes: ["newsletter", "q4"] }]);
    expect(
      scoreCase(expectedCreate, patch([act({ action: "create", title: "Newsletter Q4", targetColumnId: "col_todo" })]), context)
        .duplicateCreate,
    ).toBe(false);
    expect(titlesCloselyMatch("Sito Rossi – home", "sito rossi home page")).toBe(true);
    expect(titlesCloselyMatch("Report analytics agosto", "Report analytics settembre")).toBe(false);
    expect(titlesCloselyMatch("Migrazione WordPress Studio Verdi", "Migrazione email Studio Verdi su Google Workspace")).toBe(false);
  });

  it("scores clarification presence both ways", () => {
    const ambiguous = outcome([], true);
    expect(
      scoreCase(ambiguous, patch([], { question: "Quale newsletter?", options: ["Newsletter Q3", "Newsletter clienti premium"] }), context)
        .pass,
    ).toBe(true);
    expect(scoreCase(ambiguous, patch([]), context).pass).toBe(false);
    expect(
      scoreCase(
        ambiguous,
        patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" })], { question: "?", options: [] }),
        context,
      ),
    ).toMatchObject({ pass: false, falsePositives: 1 });
    expect(
      scoreCase(
        moveDone,
        patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" })], { question: "?", options: [] }),
        context,
      ).pass,
    ).toBe(false);
  });

  it("fails when there is no prediction", () => {
    expect(scoreCase(moveDone, null, context)).toMatchObject({ pass: false, missed: 1, falsePositives: 0 });
  });
});

describe("summarize", () => {
  it("aggregates pass rates, noop false positives and clarification precision/recall", () => {
    const moveExpected = outcome([{ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" }]);
    const make = (
      id: string,
      category: string,
      expected: ExpectedOutcome,
      predicted: PredictedPatch | null,
      extra: Partial<CaseResult> = {},
    ): CaseResult => ({ id, category, expected, predicted, score: scoreCase(expected, predicted, context), ...extra });
    const results: CaseResult[] = [
      make("E1", "move_done", moveExpected, patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" })]), {
        cost: 0.001,
      }),
      make("E2", "move_done", moveExpected, null, { error: "boom" }),
      make("E3", "negation_noop", outcome([]), patch([])),
      make("E4", "negation_noop", outcome([]), patch([act({ action: "archive", cardId: "card_kickoff_verdi" })]), { cost: 0.002 }),
      make("E5", "ambiguity_clarification", outcome([], true), patch([], { question: "?", options: [] })),
      make("E6", "ambiguity_clarification", outcome([], true), patch([])),
      make(
        "E7",
        "move_done",
        moveExpected,
        patch([act({ action: "move", cardId: "card_newsletter_q3", targetColumnId: "col_done" })], { question: "?", options: [] }),
      ),
    ];
    const summary = summarize(results);
    expect(summary).toMatchObject({ total: 7, passed: 3, failed: 4, errors: 1, falsePositives: 1, missed: 1, duplicateCreates: 0 });
    expect(summary.passRate).toBeCloseTo(3 / 7);
    expect(summary.byCategory.move_done).toEqual({ total: 3, passed: 1, passRate: 1 / 3 });
    expect(summary.byCategory.negation_noop).toEqual({ total: 2, passed: 1, passRate: 0.5 });
    expect(summary.noop).toEqual({ total: 2, withActions: 1, falsePositiveRate: 0.5 });
    expect(summary.clarification).toEqual({ expected: 2, predicted: 2, truePositives: 1, precision: 0.5, recall: 0.5 });
    expect(summary.totalCost).toBeCloseTo(0.003);
    expect(summarize([]).passRate).toBeNull();
  });
});
