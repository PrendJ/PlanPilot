import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, consumeRecoveryCode, generateRecoveryCodes, otpauthUri, totpAt, verifyTotp } from "@/lib/totp";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { parseCsv, parseCsvRows, parseTrello, toCsv } from "@/lib/import-export";
import { assertSafeWebhookUrl, publicEventName, signPayload } from "@/lib/webhooks";
import { planDemoUpdate, type DemoCard, type DemoColumn } from "@/lib/demo-planner";
import { buildCompactPlan, relevance, keywords } from "@/lib/ai-context";
import { orderWithCard } from "@/lib/board";
import { selectActions, validateAiPatch } from "@/lib/ai-patch";
import { dueState } from "@/components/board/types";

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vector at T=59s", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("accepts ±1 step of clock drift and rejects replays", () => {
    const now = 1_111_111_109_000;
    const code = totpAt(secret, Math.floor(now / 30000) - 1);
    const step = verifyTotp(secret, code, { now });
    expect(step).toBe(Math.floor(now / 30000) - 1);
    expect(verifyTotp(secret, code, { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
  });
  it("builds an otpauth URI and single-use recovery codes", () => {
    expect(otpauthUri({ secret, account: "a@b.it" })).toMatch(/^otpauth:\/\/totp\/BoardCue%3Aa%40b\.it\?secret=/);
    const { codes, hashes } = generateRecoveryCodes(3);
    const remaining = consumeRecoveryCode(hashes, codes[1].toLowerCase());
    expect(remaining).toHaveLength(2);
    expect(consumeRecoveryCode(remaining, codes[1])).toBeNull();
  });
  it("encrypts secrets with authenticated encryption", () => {
    const sealed = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("import and export", () => {
  it("parses CSV with quotes, semicolons and Italian dates", () => {
    expect(parseCsvRows('a;"b;c";"d ""e"""\n1;2;3')).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    const board = parseCsv("Titolo,Colonna,Priorità,Scadenza,Tag\nFoto,In attesa,urgente,30/09/2026,a|b\nSenza colonna,,,,\n");
    expect(board.columns.map(column => column.title)).toEqual(["In attesa", "Inbox"]);
    expect(board.columns[0].cards[0]).toMatchObject({ priority: "URGENT", tags: ["a", "b"] });
    expect(board.columns[0].cards[0].dueDate?.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(() => parseCsv("descrizione\nx")).toThrow();
  });
  it("maps a Trello export: lists, labels, checklists, closed cards", () => {
    const board = parseTrello({
      lists: [
        { id: "l2", name: "Fatto", pos: 2 },
        { id: "l1", name: "Da fare", pos: 1 },
        { id: "l3", name: "Vecchia", closed: true },
      ],
      cards: [
        {
          id: "c1",
          name: "Sito",
          idList: "l1",
          labels: [{ name: "Alta priorità" }],
          idChecklists: ["k1"],
          due: "2026-10-01T10:00:00.000Z",
        },
        { id: "c2", name: "Chiusa", idList: "l2", closed: true },
      ],
      checklists: [
        {
          id: "k1",
          idCard: "c1",
          checkItems: [
            { id: "i1", name: "Home", state: "complete" },
            { id: "i2", name: "Blog", state: "incomplete" },
          ],
        },
      ],
    });
    expect(board.columns.map(column => column.title)).toEqual(["Da fare", "Fatto"]);
    expect(board.columns[0].cards[0]).toMatchObject({
      priority: "HIGH",
      tags: ["Alta priorità"],
      checklist: [
        { text: "Home", done: true },
        { text: "Blog", done: false },
      ],
    });
    expect(board.columns[1].cards[0].archived).toBe(true);
  });
  it("writes Excel-friendly CSV", () => {
    expect(toCsv([{ a: 'x,"y"', b: 1 }], ["a", "b"])).toBe('﻿a,b\r\n"x,""y""",1\r\n');
  });
});

describe("webhooks", () => {
  it("signs payloads with HMAC-SHA256 over timestamp.body", () => {
    expect(signPayload("whsec_test", 1700000000, "{}")).toMatch(/^[a-f0-9]{64}$/);
    expect(signPayload("whsec_test", 1700000000, "{}")).not.toBe(signPayload("whsec_other", 1700000000, "{}"));
  });
  it("maps internal activity to public event names", () => {
    expect(publicEventName("AI_CARD_CREATED")).toBe("card.created");
    expect(publicEventName("CARD_UPDATED", { columnChanged: true })).toBe("card.moved");
    expect(publicEventName("COLUMNS_REORDERED")).toBeNull();
  });
  it("refuses non-HTTPS and private destinations (SSRF)", async () => {
    for (const url of [
      "http://example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://user:pw@example.com/x",
      "https://[::1]/x",
    ]) {
      await expect(assertSafeWebhookUrl(url)).rejects.toThrow();
    }
  });
});

describe("public demo planner", () => {
  const columns: DemoColumn[] = [
    { id: "todo", title: "Da fare", intent: "todo" },
    { id: "doing", title: "In corso", intent: "doing" },
    { id: "done", title: "Fatto", intent: "done" },
  ];
  const cards: DemoCard[] = [
    { id: "n", title: "Newsletter di ottobre", description: "", columnId: "doing", priority: "NORMAL", dueDate: null, tags: [] },
    { id: "p", title: "Preventivo per Studio Rossi", description: "", columnId: "todo", priority: "HIGH", dueDate: null, tags: [] },
  ];
  it("moves the existing card instead of creating a duplicate", () => {
    expect(planDemoUpdate("Ho finito la newsletter di ottobre", cards, columns).actions).toEqual([
      expect.objectContaining({ action: "move", cardId: "n", targetColumnId: "done" }),
    ]);
  });
  it("does nothing on negations and questions", () => {
    expect(planDemoUpdate("Non ho ancora finito il preventivo", cards, columns).noop).toBe("negation");
    expect(planDemoUpdate("Quando consegniamo il preventivo?", cards, columns).noop).toBe("question");
  });
  it("updates due date and priority, and creates only when nothing matches", () => {
    const now = new Date("2026-09-23T09:00:00");
    const update = planDemoUpdate("Il preventivo per Studio Rossi è urgente, va consegnato venerdì", cards, columns, "it", now).actions[0];
    expect(update).toMatchObject({ action: "update", cardId: "p", priority: "URGENT" });
    expect(new Date(update.dueDate!).getDay()).toBe(5);
    expect(planDemoUpdate("Devo chiamare il commercialista", cards, columns).actions[0]).toMatchObject({
      action: "create",
      targetColumnId: "todo",
    });
  });
});

describe("AI context and patch helpers", () => {
  it("prunes large boards to the most relevant cards and never sends archived ones", () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      id: `c${index}`,
      title: index === 42 ? "Migrazione newsletter clienti" : `Attività ${index}`,
      description: "x".repeat(500),
      priority: "NORMAL",
      dueDate: null,
      tags: [],
      archived: index === 7,
    }));
    const plan = buildCompactPlan(
      [{ id: "col", title: "Da fare", description: "", cards: many }],
      "ho finito la migrazione della newsletter",
      10,
    );
    const ids = plan.columns[0].cards.map(card => card.id);
    expect(ids).toHaveLength(10);
    expect(ids).toContain("c42");
    expect(ids).not.toContain("c7");
    expect(plan.omittedCards).toBe(69);
    expect(plan.columns[0].cards[0].description.length).toBeLessThanOrEqual(281);
    expect(relevance({ title: "Newsletter clienti", description: "", tags: [] }, keywords("newsletter"))).toBeGreaterThan(0);
  });
  it("drops a clarification when actions are proposed and selects chosen actions", () => {
    const patch = validateAiPatch(
      {
        summary: "",
        actions: [
          {
            action: "create",
            cardId: null,
            title: "X",
            description: null,
            targetColumnId: "a",
            priority: null,
            dueDate: null,
            tags: null,
            reason: "",
          },
        ],
        clarification: { question: "?", options: [] },
      },
      { columnIds: new Set(["a"]), cardIds: new Set() },
    );
    expect(patch.clarification).toBeNull();
    expect(selectActions(["a", "b", "c"], [2, 0, 9])).toEqual(["a", "c"]);
  });
  it("orders cards inside a column", () => {
    expect(orderWithCard(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(orderWithCard(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
  });
  it("classifies due dates", () => {
    const now = new Date("2026-09-23T12:00:00");
    expect(dueState("2026-09-22T18:00:00", now)).toBe("overdue");
    expect(dueState("2026-09-24T18:00:00", now)).toBe("soon");
    expect(dueState("2026-10-10T18:00:00", now)).toBe("later");
    expect(dueState("2026-09-22T18:00:00", now, true)).toBe("done");
  });
});
