/**
 * Offline evaluation of the AI planner against tests/fixtures/ai-eval.
 *
 *   OPENROUTER_API_KEY=... npx tsx scripts/ai-eval.ts [--model id] [--limit n] [--category c]
 *
 * Writes ai-eval-report.json in the current directory (do not commit it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { planPatchFromText } from "../lib/openrouter";
import {
  buildScoreContext,
  scoreCase,
  summarize,
  type CaseResult,
  type EvalBoard,
  type EvalCase,
  type PredictedPatch,
} from "../lib/ai-eval";

const NOW = new Date("2026-09-23T09:00:00+02:00");
const TIME_ZONE = "Europe/Rome";
const LOCALE = "it";
const CONCURRENCY = 4;
const DEFAULT_MODEL = process.env.AI_EVAL_MODEL || "google/gemini-2.5-flash-lite"; // same default as Workspace.planModel

type Args = { model: string; limit: number | null; category: string | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { model: DEFAULT_MODEL, limit: null, category: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--model" && value) {
      args.model = value;
      i += 1;
    } else if (flag === "--limit" && value) {
      args.limit = Math.max(1, Number.parseInt(value, 10) || 1);
      i += 1;
    } else if (flag === "--category" && value) {
      args.category = value;
      i += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log("Usage: npx tsx scripts/ai-eval.ts [--model id] [--limit n] [--category c]");
      process.exit(0);
    } else {
      console.error(`Unknown or incomplete argument: ${flag}`);
      process.exit(1);
    }
  }
  return args;
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(path.resolve(__dirname, "..", relative), "utf8")) as T;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const pct = (value: number | null) => (value === null ? "   n/a" : `${(value * 100).toFixed(1).padStart(5)}%`);

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is required.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const board = readJson<EvalBoard>("tests/fixtures/ai-eval/board.json");
  let cases = readJson<EvalCase[]>("tests/fixtures/ai-eval/cases.json");
  if (args.category) cases = cases.filter(c => c.category === args.category);
  if (args.limit !== null) cases = cases.slice(0, args.limit);
  if (cases.length === 0) {
    console.error("No cases selected.");
    process.exit(1);
  }

  const plan = { columns: board.columns };
  const context = buildScoreContext(plan, TIME_ZONE);
  console.log(`Evaluating ${cases.length} cases with ${args.model} (concurrency ${CONCURRENCY})...`);
  const started = Date.now();
  let completed = 0;

  const results = await mapWithConcurrency(
    cases,
    CONCURRENCY,
    async (evalCase): Promise<CaseResult & { text: string; latencyMs: number }> => {
      let predicted: PredictedPatch | null = null;
      let cost: number | null = null;
      let error: string | undefined;
      const t0 = Date.now();
      for (let attempt = 0; attempt < 2 && predicted === null; attempt += 1) {
        try {
          const result = await planPatchFromText({
            apiKey,
            model: args.model,
            workspaceName: board.workspaceName,
            userText: evalCase.text,
            plan,
            now: NOW,
            timeZone: TIME_ZONE,
            locale: LOCALE,
          });
          predicted = { summary: result.patch.summary, actions: result.patch.actions, clarification: result.patch.clarification ?? null };
          cost = typeof result.usage?.cost === "number" ? result.usage.cost : null;
          error = undefined;
        } catch (err) {
          error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        }
      }
      const score = scoreCase(evalCase.expected, predicted, context);
      completed += 1;
      process.stdout.write(`\r${completed}/${cases.length}`);
      return {
        id: evalCase.id,
        category: evalCase.category,
        text: evalCase.text,
        expected: evalCase.expected,
        predicted,
        score,
        cost,
        latencyMs: Date.now() - t0,
        ...(error !== undefined ? { error } : {}),
      };
    },
  );
  process.stdout.write("\n\n");

  const summary = summarize(results);
  const categories = Object.entries(summary.byCategory).sort(([a], [b]) => a.localeCompare(b));
  const width = Math.max(8, ...categories.map(([name]) => name.length));
  console.log(`${"category".padEnd(width)}  pass/total    rate`);
  console.log("-".repeat(width + 22));
  for (const [name, bucket] of categories)
    console.log(`${name.padEnd(width)}  ${`${bucket.passed}/${bucket.total}`.padStart(10)}  ${pct(bucket.passRate)}`);
  console.log("-".repeat(width + 22));
  console.log(`${"TOTAL".padEnd(width)}  ${`${summary.passed}/${summary.total}`.padStart(10)}  ${pct(summary.passRate)}`);
  console.log("");
  console.log(`Noop false-positive rate: ${pct(summary.noop.falsePositiveRate)} (${summary.noop.withActions}/${summary.noop.total})`);
  console.log(`Clarification precision:  ${pct(summary.clarification.precision)}  recall: ${pct(summary.clarification.recall)}`);
  console.log(
    `False positives: ${summary.falsePositives}  missed: ${summary.missed}  duplicate creates: ${summary.duplicateCreates}  errors: ${summary.errors}`,
  );
  console.log(`Cost: $${summary.totalCost.toFixed(4)}  elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const failures = results.filter(r => !r.score.pass);
  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures)
      console.log(
        `  ${failure.id} [${failure.category}] ${failure.text}\n    - ${failure.score.reasons.join("\n    - ")}${failure.error ? `\n    - error: ${failure.error}` : ""}`,
      );
  }

  const reportPath = path.resolve(process.cwd(), "ai-eval-report.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      { model: args.model, now: NOW.toISOString(), timeZone: TIME_ZONE, generatedAt: new Date().toISOString(), summary, results },
      null,
      2,
    ),
  );
  console.log(`\nReport written to ${reportPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
