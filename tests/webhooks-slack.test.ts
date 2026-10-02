import { describe, expect, it } from "vitest";
import { escapeSlack, slackMessage } from "@/lib/webhooks";

const origin = "https://boardcue.example";
const it_ = { slug: "team-board", name: "Team <Ops> & Co", locale: "it" };
const en = { ...it_, locale: "en" };

describe("Slack incoming-webhook message", () => {
  it("escapes Slack control characters in user text", () => {
    expect(escapeSlack("<!channel> & <https://evil.test|click>")).toBe("&lt;!channel&gt; &amp; &lt;https://evil.test|click&gt;");
  });

  it("links the card and the board, localized by board locale", () => {
    const payload = { event: "card.created", data: { entityType: "CARD", entityId: "card_1", after: { title: "Pay <@U123> & rent" } } };
    expect(slackMessage("card.created", payload, it_, origin).text).toBe(
      "BoardCue · Nuova card: <https://boardcue.example/app/team-board?card=card_1|“Pay &lt;@U123&gt; &amp; rent”> · <https://boardcue.example/app/team-board|Team &lt;Ops&gt; &amp; Co>",
    );
    expect(slackMessage("card.created", payload, en, origin).text).toMatch(
      /^BoardCue · New card: <https:\/\/boardcue\.example\/app\/team-board\?card=card_1\|/,
    );
    expect(slackMessage("card.moved", payload, { ...en, locale: "de" }, origin).text).toContain("Card moved");
  });

  it("falls back to a generic card link text and links only the board for non-card events", () => {
    const comment = { data: { entityType: "CARD", entityId: "c/2", after: { commentId: "x" } } };
    expect(slackMessage("comment.created", comment, en, origin).text).toContain(
      ": <https://boardcue.example/app/team-board?card=c%2F2|Open card> · ",
    );
    const ai = { data: { entityType: "UPDATE", entityId: "log1", after: { summary: "s" } } };
    expect(slackMessage("ai.update.applied", ai, it_, origin).text).toBe(
      "BoardCue · Aggiornamento AI applicato · <https://boardcue.example/app/team-board|Team &lt;Ops&gt; &amp; Co>",
    );
  });
});
