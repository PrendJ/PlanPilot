/**
 * Builds the compact board context sent to the model. Large boards are pruned to the cards most
 * related to the update, so cost and latency stay flat and the model is not distracted.
 * Archived cards are never sent.
 */
export type ContextCard = {
  id: string;
  title: string;
  description: string;
  priority: string;
  dueDate: Date | string | null;
  tags: unknown;
  archived?: boolean;
  updatedAt?: Date | string;
};
export type ContextColumn = { id: string; title: string; description: string; cards: ContextCard[] };

export type CompactPlan = {
  columns: Array<{
    id: string;
    title: string;
    description: string;
    cards: Array<{ id: string; title: string; description: string; priority: string; dueDate: string | null; tags: string[] }>;
  }>;
  omittedCards?: number;
};

export const MAX_CONTEXT_CARDS = 60;
export const MAX_DESCRIPTION_CHARS = 280;

const STOPWORDS = new Set(
  "il lo la i gli le un uno una di a da in con su per tra fra e ed o che ho ha hanno abbiamo sono è non del della dei delle al alla ai alle nel nella sul sulla ma poi anche ancora già come più the a an of to in on and or is are was be it this that for with".split(
    " ",
  ),
);

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function keywords(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter(word => word.length > 2 && !STOPWORDS.has(word)),
  );
}

function toTags(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Relevance of a card for an update: shared keywords (prefix match catches plurals and conjugations). */
export function relevance(card: Pick<ContextCard, "title" | "description" | "tags">, words: Set<string>) {
  if (!words.size) return 0;
  const titleWords = [...keywords(card.title)];
  const bodyWords = [...keywords(`${card.description} ${toTags(card.tags).join(" ")}`)];
  let score = 0;
  for (const word of words) {
    const stem = word.slice(0, Math.max(4, word.length - 2));
    if (titleWords.some(candidate => candidate.startsWith(stem) || word.startsWith(candidate.slice(0, Math.max(4, candidate.length - 2)))))
      score += 3;
    else if (bodyWords.some(candidate => candidate.startsWith(stem))) score += 1;
  }
  return score;
}

export function buildCompactPlan(columns: ContextColumn[], userText: string, limit = MAX_CONTEXT_CARDS): CompactPlan {
  const active = columns.flatMap((column, columnIndex) =>
    column.cards.filter(card => !card.archived).map((card, cardIndex) => ({ card, columnIndex, cardIndex })),
  );
  let kept = new Set(active.map(entry => entry.card.id));
  if (active.length > limit) {
    const words = keywords(userText);
    const ranked = [...active].sort((left, right) => {
      const byScore = relevance(right.card, words) - relevance(left.card, words);
      if (byScore) return byScore;
      return new Date(right.card.updatedAt || 0).getTime() - new Date(left.card.updatedAt || 0).getTime();
    });
    kept = new Set(ranked.slice(0, limit).map(entry => entry.card.id));
  }
  const plan: CompactPlan = {
    columns: columns.map(column => ({
      id: column.id,
      title: column.title,
      description: column.description,
      cards: column.cards
        .filter(card => !card.archived && kept.has(card.id))
        .map(card => ({
          id: card.id,
          title: card.title,
          description:
            card.description.length > MAX_DESCRIPTION_CHARS ? `${card.description.slice(0, MAX_DESCRIPTION_CHARS)}…` : card.description,
          priority: card.priority,
          dueDate: card.dueDate ? new Date(card.dueDate).toISOString() : null,
          tags: toTags(card.tags),
        })),
    })),
  };
  const omitted = active.length - kept.size;
  if (omitted > 0) plan.omittedCards = omitted;
  return plan;
}
