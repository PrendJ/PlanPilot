export type HomeTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  board: string;
  slug: string;
  column: string;
  columnId: string;
  doneColumnId: string | null;
};

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

/** Calendar days in the user's timezone, including across daylight-saving changes. */
export function groupHomeTasks(cards: HomeTask[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime();
  const groups: { overdue: HomeTask[]; today: HomeTask[]; upcoming: HomeTask[] } = { overdue: [], today: [], upcoming: [] };
  for (const card of cards) {
    if (!card.dueDate) continue;
    const due = new Date(card.dueDate).getTime();
    if (due < start) groups.overdue.push(card);
    else if (due < tomorrow) groups.today.push(card);
    else if (due < end) groups.upcoming.push(card);
  }
  const priority = (a: HomeTask, b: HomeTask) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  const deadline = (a: HomeTask, b: HomeTask) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!);
  groups.overdue.sort((a, b) => deadline(a, b) || priority(a, b));
  groups.today.sort((a, b) => priority(a, b) || deadline(a, b));
  groups.upcoming.sort((a, b) => deadline(a, b) || priority(a, b));
  return groups;
}

export type HomeTaskGroups = ReturnType<typeof groupHomeTasks>;
