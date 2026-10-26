"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { aiRequestError, api, MenuButton, useFeedback } from "./ui";
import { useUpdateBlocker } from "./PwaProvider";
import { ProposalPanel } from "./board/ProposalPanel";
import type { Proposal } from "./board/types";
import { clearSharedCapture, consumeSharedCapture } from "@/lib/share-inbox";
import {
  cutImport,
  groupTasks,
  MAX_INPUT,
  MAX_TRANSCRIPT,
  recordingSeconds,
  speechMinutes,
  splitTranscript,
  taskRequests,
} from "@/lib/home-capture";

type BoardChoice = { id: string; name: string; slug: string; dictationEnabled?: boolean };
/** A task found in the notes; key is local, so rows survive edits, moves and removals. */
type Segment = { key: string; text: string; workspaceId: string | null; newBoardName?: string | null };
/** Select value for "put this task on a new board". */
const NEW_BOARD = "__new__";
type Pending = { board: BoardChoice; proposal: Proposal };
type TodayCard = {
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

/** How many of today's tasks the home shows before "Show all". */
const TODAY_PREVIEW = 5;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

/**
 * Board chooser used to move a task (or a whole group) elsewhere. Values: b:<board id>, n:<proposed name> or
 * NEW_BOARD. A menu instead of a native select so boards read as a list with their own icon, a proposed
 * board is told apart and "new board" sits apart at the bottom.
 */
function BoardPicker({
  label,
  buttonLabel,
  boards,
  proposedNames = [],
  canCreate = false,
  disabled,
  onPick,
}: {
  label: string;
  buttonLabel: string;
  boards: BoardChoice[];
  proposedNames?: string[];
  canCreate?: boolean;
  disabled?: boolean;
  onPick: (value: string) => void;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <Icon name="kanban" size={14} />
      <span className="board-picker-label">{buttonLabel}</span>
      <Icon name="chevronDown" size={14} />
    </>
  );
  if (disabled)
    return (
      <button type="button" className="btn sm board-picker" aria-label={label} disabled>
        {content}
      </button>
    );
  return (
    <MenuButton label={label} className="btn sm board-picker" buttonContent={content}>
      {close => {
        const pick = (value: string) => () => {
          close();
          onPick(value);
        };
        return (
          <div className="board-picker-menu">
            {boards.length > 0 && <div className="menu-label">{t("home.assistant.pickerBoards")}</div>}
            {boards.map(board => (
              <button type="button" role="menuitem" className="menu-item" key={board.id} onClick={pick(`b:${board.id}`)}>
                <Icon name="kanban" size={14} />
                <span className="board-picker-name">{board.name}</span>
              </button>
            ))}
            {proposedNames.length > 0 && <div className="menu-label">{t("home.assistant.proposedBadge")}</div>}
            {proposedNames.map(name => (
              <button type="button" role="menuitem" className="menu-item" key={`n:${name}`} onClick={pick(`n:${name}`)}>
                <Icon name="sparkles" size={14} />
                <span className="board-picker-name">{name}</span>
              </button>
            ))}
            {canCreate && (
              <>
                <div className="menu-sep" />
                <button type="button" role="menuitem" className="menu-item" onClick={pick(NEW_BOARD)}>
                  <Icon name="plus" size={14} />
                  <span className="board-picker-name">{t("home.assistant.newBoardOption")}</span>
                </button>
              </>
            )}
          </div>
        );
      }}
    </MenuButton>
  );
}

/**
 * Review of the tasks found in the notes: one block per board with its tasks underneath, instead of repeating the
 * board on every row. Proposed boards are created with one button; any task can be moved, edited or removed.
 */
function RoutingReview({
  segments,
  boards,
  canCreate,
  busy,
  working,
  onText,
  onAssign,
  onRemove,
  onCreate,
  onCancel,
  onConfirm,
}: {
  segments: Segment[];
  boards: BoardChoice[];
  canCreate: boolean;
  busy: boolean;
  /** The AI is preparing the proposals for these tasks. */
  working: boolean;
  onText: (key: string, value: string) => void;
  onAssign: (keys: string[], target: { workspaceId: string } | { newBoardName: string }) => void;
  onRemove: (key: string) => void;
  onCreate: (keys: string[], suggestion?: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const groups = groupTasks(segments, boards);
  const proposedNames = groups.flatMap(group => (group.kind === "proposed" ? [group.name] : []));
  // A task is ready only on a board that exists: proposed boards must be created (or their tasks moved) first.
  const unresolved = groups.some(group => group.kind !== "board");
  /** Select values: b:<board id>, n:<proposed name>, or NEW_BOARD to name and create one now. */
  const choose = (keys: string[], value: string) => {
    if (value === NEW_BOARD) onCreate(keys);
    else if (value.startsWith("b:")) onAssign(keys, { workspaceId: value.slice(2) });
    else if (value.startsWith("n:")) onAssign(keys, { newBoardName: value.slice(2) });
  };
  const picker = (keys: string[], current: string | undefined, label: string, buttonLabel: string) => (
    <BoardPicker
      label={label}
      buttonLabel={buttonLabel}
      boards={boards.filter(board => `b:${board.id}` !== current)}
      proposedNames={proposedNames.filter(name => `n:${name}` !== current)}
      canCreate={canCreate}
      disabled={busy}
      onPick={value => choose(keys, value)}
    />
  );
  return (
    <section className="home-routing" aria-labelledby="home-routing-title">
      <h3 id="home-routing-title">
        {segments.length === 1 ? t("home.assistant.routeTitleOne") : t("home.assistant.routeTitle", { count: segments.length })}
      </h3>
      <p className="subtle">{t("home.assistant.routeHint")}</p>
      {groups.map(group => {
        const keys = group.tasks.map(task => task.key);
        const current = group.kind === "board" ? `b:${group.id}` : group.kind === "proposed" ? `n:${group.name}` : undefined;
        return (
          <div className={`route-group ${group.kind}`} key={current || "unassigned"}>
            <div className="route-group-head">
              {group.kind === "proposed" && <span className="badge primary">{t("home.assistant.proposedBadge")}</span>}
              <strong>
                {group.kind === "unassigned" ? t("home.assistant.unassigned") : group.name}
                <span className="subtle">
                  {" "}
                  ·{" "}
                  {group.tasks.length === 1
                    ? t("home.assistant.taskCountOne")
                    : t("home.assistant.taskCount", { count: group.tasks.length })}
                </span>
              </strong>
              <span className="spacer" />
              {group.kind === "proposed" && canCreate && (
                <button type="button" className="btn sm primary" disabled={busy} onClick={() => onCreate(keys, group.name)}>
                  <Icon name="plus" size={14} />
                  {t("home.assistant.createBoard")}
                </button>
              )}
              {group.kind !== "board" && picker(keys, current, t("home.assistant.moveAll"), t("home.assistant.moveAll"))}
            </div>
            <ul>
              {group.tasks.map(task => {
                const label = task.text.trim() || t("home.assistant.taskLabel", { number: segments.indexOf(task) + 1 });
                return (
                  <li key={task.key} className="route-task">
                    <input
                      aria-label={t("home.assistant.taskLabel", { number: segments.indexOf(task) + 1 })}
                      value={task.text}
                      maxLength={2000}
                      onChange={event => onText(task.key, event.target.value)}
                    />
                    {picker([task.key], current, t("home.assistant.moveTask", { title: label }), t("home.assistant.moveTaskShort"))}
                    <button
                      type="button"
                      className="route-remove"
                      aria-label={t("home.assistant.removeTask", { title: label })}
                      title={t("home.assistant.removeTask", { title: label })}
                      onClick={() => onRemove(task.key)}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {unresolved && <p className="subtle">{t("home.assistant.unresolvedHint")}</p>}
      {working && (
        <p className="home-working" role="status">
          <span className="spinner" />
          {t("home.assistant.working")}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={working} onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn primary"
          disabled={busy || unresolved || segments.every(segment => !segment.text.trim())}
          aria-busy={working}
          onClick={onConfirm}
        >
          {working ? <span className="spinner" /> : null}
          {working ? t("home.assistant.workingShort") : t("home.assistant.preview")}
        </button>
      </div>
    </section>
  );
}

/** One task of the day: opens the card in its board, or is marked done right here (it moves to the board's done column). */
function TodayItem({ card, due, overdue, onDone }: { card: TodayCard; due?: string; overdue?: boolean; onDone: () => void }) {
  const { t } = useI18n();
  return (
    <li className="home-today-item">
      {card.doneColumnId && (
        <button type="button" className="home-today-done" onClick={onDone} aria-label={t("home.today.markDone", { title: card.title })}>
          <Icon name="check" size={14} strokeWidth={3} />
        </button>
      )}
      <Link href={`/app/${card.slug}?card=${card.id}`}>
        <strong>
          {(card.priority === "URGENT" || card.priority === "HIGH") && (
            <span className={`today-priority ${card.priority.toLowerCase()}`}>{t(`priority.${card.priority}`)}</span>
          )}
          {card.title}
        </strong>
        <span>
          {card.board} · {card.column}
        </span>
        {due && <small className={overdue ? "overdue" : ""}>{due}</small>}
      </Link>
    </li>
  );
}
type Capture = { id: string; source: string; text: string; status: string; createdAt: string; retryable?: boolean };

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
/** Documents whose text can be imported (see lib/document-text.ts); .pages is accepted to explain how to export it. */
const DOCUMENT_ACCEPT =
  ".txt,.md,.markdown,.docx,.odt,.rtf,.html,.htm,.pages,text/plain,text/markdown,text/rtf,application/rtf,text/html," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text";

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function audioName(audio: Blob, fallback?: string | null) {
  if (audio instanceof File && audio.name) return audio.name;
  if (fallback) return fallback;
  if (audio.type.includes("mp4")) return "capture.m4a";
  if (audio.type.includes("ogg") || audio.type.includes("opus")) return "capture.ogg";
  return "capture.webm";
}

export function HomeAssistant({
  initialBoards,
  paused,
  quick = false,
  shared = false,
  shareError = false,
  personalBoardOffer = null,
  newBoardTarget = null,
  boardList,
  sidebar,
}: {
  initialBoards: BoardChoice[];
  paused: boolean;
  quick?: boolean;
  shared?: boolean;
  shareError?: boolean;
  personalBoardOffer?: { organizationId: string; locale: string; name: string } | null;
  /** Where a task can get a new board (null when the person cannot create one, e.g. at the board limit). */
  newBoardTarget?: { organizationId: string; locale: string } | null;
  boardList: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const { t, tag } = useI18n();
  const router = useRouter();
  const [boards, setBoards] = useState(initialBoards);
  const [text, setText] = useState("");
  const [source, setSource] = useState<"text" | "voice">("text");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [today, setToday] = useState<TodayCard[]>([]);
  const [active, setActive] = useState<TodayCard[]>([]);
  const [todayError, setTodayError] = useState(false);
  const [todayExpanded, setTodayExpanded] = useState(false);
  const { toast, prompt } = useFeedback();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [parts, setParts] = useState<{ queue: string[]; current: number; total: number } | null>(null);
  const [busy, setBusy] = useState<"" | "routing" | "transcribing" | "proposing" | "applying" | "creating">("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const results = useRef<HTMLDivElement>(null);
  const scrollToResults = useRef(false);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [googleDocOpen, setGoogleDocOpen] = useState(false);
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const quickStarted = useRef(false);
  const shareStarted = useRef(false);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const visibleToday = today.filter(card => card.dueDate && new Date(card.dueDate).getTime() < tomorrowStart.getTime());
  const dictation = boards.some(item => item.dictationEnabled);
  // Recording time left before the transcript would fill one request; under 10 seconds the microphone waits.
  const recordSeconds = recordingSeconds(text.trim().length);
  const textFull = recordSeconds < 10;
  const micDisabled = paused || Boolean(busy) || pending.length > 0 || !dictation || textFull;
  const number = (value: number) => value.toLocaleString(tag);
  const clock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

  const loadToday = useCallback(async () => {
    const response = await api<{ cards: TodayCard[]; active?: TodayCard[] }>(`/api/home/today?date=${localDate(new Date())}`);
    if (response.ok) {
      setToday(response.data.cards);
      setActive(response.data.active || []);
      setTodayError(false);
    } else setTodayError(true);
  }, []);
  const loadCaptures = useCallback(async () => {
    const response = await api<{ captures: Capture[] }>("/api/captures");
    if (response.ok) setCaptures(response.data.captures);
  }, []);
  useEffect(() => {
    void loadToday();
    void loadCaptures();
  }, [loadToday, loadCaptures]);
  useEffect(() => {
    if (!shared || shareStarted.current) return;
    shareStarted.current = true;
    void consumeSharedCapture()
      .then(async value => {
        if (!value) {
          setError(t("home.assistant.shareError"));
          return;
        }
        if (value.text) setText(current => (current.trim() ? `${current.trim()}\n${value.text}` : value.text));
        if (value.truncated) setNotice(t("home.assistant.sharedTruncated"));
        setSegments([]);
        // The share stays in the browser until it has been used, so a failed transcription can be retried.
        if (value.audio) {
          if (await transcribe(value.audio, value.audioName)) await clearSharedCapture();
        } else await clearSharedCapture();
        textArea.current?.focus();
      })
      .catch(() => setError(t("home.assistant.shareError")));
    const url = new URL(location.href);
    url.searchParams.delete("shared");
    history.replaceState(null, "", url);
    // One-time PWA share handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);
  useEffect(() => {
    if (shareError) setError(t("home.assistant.shareError"));
  }, [shareError, t]);
  useEffect(() => {
    try {
      setText(sessionStorage.getItem("boardcue:home-draft") || "");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem("boardcue:home-draft", text);
      else sessionStorage.removeItem("boardcue:home-draft");
    } catch {
      /* storage unavailable */
    }
  }, [text]);
  useEffect(
    () => () => {
      clearInterval(timer.current);
      stream.current?.getTracks().forEach(track => track.stop());
    },
    [],
  );
  // A long transcript is worked through one part at a time: the next part arrives once this one is settled.
  useEffect(() => {
    if (!parts?.queue.length || text.trim() || pending.length || segments.length || busy) return;
    const [next, ...queue] = parts.queue;
    setText(next);
    setSource("text");
    setParts({ queue, current: parts.current + 1, total: parts.total });
  }, [parts, text, pending.length, segments.length, busy]);
  // After "Organize", bring the result (task list or previews) into view: the capture panel can scroll away.
  useEffect(() => {
    if (!scrollToResults.current || busy || (!segments.length && !pending.length)) return;
    scrollToResults.current = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    results.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [segments.length, pending.length, busy]);
  useUpdateBlocker("home-capture", Boolean(text.trim()) || recording || Boolean(busy) || pending.length > 0);

  function stop(cancel = false) {
    cancelled.current = cancel;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function transcribe(audio: Blob, name?: string | null) {
    const board = boards.find(item => item.dictationEnabled);
    if (!board) {
      setError(t("home.assistant.noDictation"));
      return false;
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      setError(t("home.assistant.audioTooLarge"));
      return false;
    }
    setBusy("transcribing");
    const form = new FormData();
    form.append("audio", audio, audioName(audio, name));
    const response = await api<{ text: string }>(`/api/workspaces/${board.slug}/transcribe`, { method: "POST", body: form });
    setBusy("");
    if (!response.ok || !response.data.text) {
      setError(response.data.error ? aiRequestError(response, t) : t("errors.TRANSCRIPTION_FAILED"));
      return false;
    }
    setText(current => (current.trim() ? `${current.trim()}\n${response.data.text}` : response.data.text));
    setSegments([]);
    setSource("voice");
    textArea.current?.focus();
    return true;
  }

  async function importAudio(file: File | null) {
    if (!file) return;
    setError("");
    await transcribe(file);
  }

  /** Plain text is read in the browser; other documents go to the server, which returns only their text. */
  async function importTranscript(file: File | null) {
    if (!file) return;
    const plain = /\.(txt|md|markdown)$/i.test(file.name) || file.type === "text/plain" || file.type === "text/markdown";
    if (plain) {
      addImportedText(await file.text());
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setImporting(true);
    const response = await api<{ text: string }>("/api/import/document", { method: "POST", body: form });
    setImporting(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.DOCUMENT_UNREADABLE"));
      return;
    }
    addImportedText(response.data.text);
  }

  async function importGoogleDoc(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!googleDocUrl.trim()) return;
    setImporting(true);
    const response = await api<{ text: string }>("/api/import/document", { method: "POST", json: { url: googleDocUrl.trim() } });
    setImporting(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.GOOGLE_DOC_NOT_SHARED"));
      return;
    }
    setGoogleDocUrl("");
    setGoogleDocOpen(false);
    addImportedText(response.data.text);
  }

  /** Imported text joins the draft; long documents are worked through in parts, one AI request each. */
  function addImportedText(raw: string) {
    if (!raw.trim()) {
      setError(t("home.assistant.transcriptTooLong"));
      return;
    }
    setError("");
    // Above the import ceiling the start is kept and the person is told exactly how much was left out.
    const { content, cut } = cutImport(raw.trim());
    setWarning(
      cut
        ? t("home.assistant.importCut", { total: number(cut.total), kept: number(cut.kept), minutes: speechMinutes(MAX_TRANSCRIPT) })
        : "",
    );
    setSource("text");
    setSegments([]);
    const combined = text.trim() ? `${text.trim()}\n${content}` : content;
    if (combined.length <= MAX_INPUT) {
      setText(combined);
      setParts(null);
    } else {
      const [first, ...queue] = splitTranscript(content);
      // Whatever was already typed is kept as its own first part.
      const all = text.trim() ? [text.trim(), first, ...queue] : [first, ...queue];
      setText(all[0]);
      setParts({ queue: all.slice(1), current: 1, total: all.length });
    }
    textArea.current?.focus();
  }

  async function toggleMic(automatic = false) {
    if (recording) {
      stop();
      return;
    }
    if (micDisabled) return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      stream.current = media;
      recorder.current = next;
      chunks.current = [];
      cancelled.current = false;
      next.ondataavailable = event => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = () => {
        clearInterval(timer.current);
        media.getTracks().forEach(track => track.stop());
        stream.current = null;
        setRecording(false);
        const audio = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        if (!cancelled.current && audio.size) void transcribe(audio);
      };
      next.start(1000);
      setSeconds(0);
      setRecording(true);
      // Stops on its own before the transcript would push the text past one request (or after 2 minutes).
      const limit = recordSeconds;
      timer.current = setInterval(
        () =>
          setSeconds(value => {
            if (value >= limit - 1) stop();
            return value + 1;
          }),
        1000,
      );
      setError("");
      setNotice("");
    } catch {
      // Some browsers only open the microphone after a tap: the quick shortcut then just points at the button.
      if (automatic) setNotice(t("home.assistant.tapToStart"));
      else setError(t("board.composer.micDenied"));
    }
  }

  useEffect(() => {
    if (quick && !quickStarted.current) {
      quickStarted.current = true;
      void toggleMic(true);
    }
    // The quick shortcut should start recording only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  async function propose(routed: Array<Pick<Segment, "text" | "workspaceId">>, choices: BoardChoice[]) {
    setBusy("proposing");
    const grouped = new Map<string, string[]>();
    for (const segment of routed) {
      if (!segment.workspaceId) continue;
      grouped.set(segment.workspaceId, [...(grouped.get(segment.workspaceId) || []), segment.text]);
    }
    const created: Pending[] = [];
    const failed: string[] = [];
    for (const [id, groupedParts] of grouped) {
      const board = choices.find(item => item.id === id);
      if (!board) {
        failed.push(...groupedParts);
        continue;
      }
      // Several tasks for the same board go as a list, so the planner keeps one card per task; a list longer
      // than one request is sent in more requests rather than cut.
      for (const content of taskRequests(groupedParts)) {
        const response = await api<{ proposal: Proposal }>(`/api/workspaces/${board.slug}/ingest`, {
          method: "POST",
          json: { text: content, source, autoApply: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        });
        if (response.ok) created.push({ board, proposal: response.data.proposal });
        else {
          failed.push(content);
          setError(aiRequestError(response, t));
        }
      }
    }
    setPending(current => [...current, ...created]);
    setText(failed.join("\n\n"));
    setSegments([]);
    setBusy("");
  }

  async function route() {
    let input = text.trim();
    if (!input || busy || pending.length || paused) return;
    setError("");
    setNotice("");
    // Too long for one request: the text is split into parts handled one after the other, never cut.
    if (input.length > MAX_INPUT) {
      const [first, ...queue] = splitTranscript(input);
      setText(first);
      setParts({ queue, current: 1, total: queue.length + 1 });
      setNotice(t("home.assistant.splitNotice", { count: queue.length + 1 }));
      input = first;
    }
    setBusy("routing");
    scrollToResults.current = true;
    const response = await api<{ segments: Segment[]; boards: BoardChoice[] }>("/api/home/route", {
      method: "POST",
      json: { text: input },
    });
    setBusy("");
    if (!response.ok) {
      setError(aiRequestError(response, t));
      return;
    }
    const routedBoards = response.data.boards.map(board => ({
      ...board,
      dictationEnabled: boards.find(item => item.id === board.id)?.dictationEnabled,
    }));
    setBoards(routedBoards);
    const routed: Segment[] = response.data.segments.map((segment, index) => ({
      ...segment,
      key: `${Date.now()}-${index}`,
      newBoardName: newBoardTarget && !segment.workspaceId ? segment.newBoardName?.trim() || null : null,
    }));
    // One task with a board goes straight to the preview; several tasks are listed first so each placement can be checked.
    if (routed.length === 1 && routed[0].workspaceId) void propose(routed, routedBoards);
    else setSegments(routed);
  }

  /** Moves tasks (by key) to an existing board or to a proposed new one. */
  function assign(keys: string[], target: { workspaceId: string } | { newBoardName: string }) {
    setSegments(current =>
      current.map(segment =>
        keys.includes(segment.key)
          ? "workspaceId" in target
            ? { ...segment, workspaceId: target.workspaceId, newBoardName: null }
            : { ...segment, workspaceId: null, newBoardName: target.newBoardName }
          : segment,
      ),
    );
  }

  /** Asks for a name (pre-filled with the suggestion) and creates the board now; its tasks then belong to it. */
  async function createBoardFor(keys: string[], suggestion = "") {
    if (!newBoardTarget || busy) return;
    const name = (
      await prompt({
        title: t("home.assistant.newBoardPrompt"),
        input: { label: t("home.assistant.newBoardName"), defaultValue: suggestion },
        confirmLabel: t("home.assistant.createBoard"),
      })
    )?.trim();
    if (!name) return;
    setBusy("creating");
    const response = await api<{ workspace: BoardChoice }>("/api/workspaces", {
      method: "POST",
      json: { organizationId: newBoardTarget.organizationId, name, presetKey: "GENERAL", locale: newBoardTarget.locale },
    });
    setBusy("");
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    setBoards(current => [...current, { ...response.data.workspace, dictationEnabled: true }]);
    assign(keys, { workspaceId: response.data.workspace.id });
    router.refresh();
  }

  /** Every task has an existing board (proposed boards are created first with their button): preview them all. */
  async function confirmRouting() {
    if (busy || groupTasks(segments, boards).some(group => group.kind !== "board")) return;
    await propose(
      segments.map(segment => ({ ...segment, text: segment.text.trim() })).filter(segment => segment.text),
      boards,
    );
  }

  async function apply(item: Pending, indexes: number[]) {
    setBusy("applying");
    const response = await api<{ receipt: { applied: number } }>(`/api/workspaces/${item.board.slug}/proposals/${item.proposal.id}/apply`, {
      method: "POST",
      json: { actionIndexes: indexes },
    });
    setBusy("");
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    setPending(current => current.filter(value => value.proposal.id !== item.proposal.id));
    if (response.data.receipt.applied > 0 && pending.length === 1 && selectedCaptureIds.length && !text.trim()) {
      await Promise.all(selectedCaptureIds.map(id => api(`/api/captures/${id}`, { method: "DELETE" })));
      setSelectedCaptureIds([]);
      void loadCaptures();
    }
    void loadToday();
    // The board list under the assistant (counts, recent activity) is rendered by the server: refresh it in place.
    router.refresh();
  }

  async function dropProposal(item: Pending) {
    await api(`/api/workspaces/${item.board.slug}/proposals/${item.proposal.id}`, { method: "DELETE" });
    setPending(current => current.filter(value => value.proposal.id !== item.proposal.id));
  }

  async function discard(item: Pending) {
    await dropProposal(item);
    setText(current => (current ? `${current}\n${item.proposal.inputText}` : item.proposal.inputText));
  }

  /** The router can be wrong even when it is sure: any proposal can be rebuilt on another board. */
  async function moveTo(item: Pending, workspaceId: string) {
    if (!workspaceId || workspaceId === item.board.id) return;
    setBusy("proposing");
    await dropProposal(item);
    await propose([{ text: item.proposal.inputText, workspaceId }], boards);
  }

  async function clarify(item: Pending, answer: string) {
    setBusy("proposing");
    await dropProposal(item);
    const content =`${item.proposal.inputText}\n(${t("board.proposal.clarifiedAs")}: ${answer})`;
    await propose([{ text: content, workspaceId: item.board.id }], boards);
  }

  async function createPersonalBoard() {
    if (!personalBoardOffer) return;
    setBusy("creating");
    const response = await api<{ workspace: BoardChoice }>("/api/workspaces", {
      method: "POST",
      json: {
        organizationId: personalBoardOffer.organizationId,
        name: personalBoardOffer.name,
        presetKey: "PERSONAL",
        locale: personalBoardOffer.locale,
      },
    });
    setBusy("");
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    setBoards(current => [...current, { ...response.data.workspace, dictationEnabled: true }]);
    setNotice(t("home.assistant.personalCreated"));
    router.refresh();
  }

  async function archiveCapture(id: string) {
    const response = await api(`/api/captures/${id}`, { method: "DELETE" });
    if (response.ok) {
      setCaptures(current => current.filter(item => item.id !== id));
      setSelectedCaptureIds(current => current.filter(value => value !== id));
    } else setError(response.data.error || t("errors.SERVER_ERROR"));
  }

  async function retryCapture(id: string) {
    const response = await api(`/api/captures/${id}/retry`, { method: "POST" });
    if (response.ok) {
      setCaptures(current => current.map(item => (item.id === id ? { ...item, status: "PROCESSING" } : item)));
      setTimeout(() => void loadCaptures(), 15_000);
    } else setError(response.data.error || t("errors.SERVER_ERROR"));
  }

  const isOverdue = (card: TodayCard) => Boolean(card.dueDate && new Date(card.dueDate).getTime() < todayStart.getTime());
  const dueLabel = (card: TodayCard) => (isOverdue(card) ? t("home.today.overdue") : t("home.today.dueToday"));
  // Most important first: priority, then the oldest deadline. The same cards as the boards, never copies.
  const rankedToday = [...visibleToday].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
      new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
  );
  const shownToday = todayExpanded ? rankedToday : rankedToday.slice(0, TODAY_PREVIEW);

  /** Moves the card to its board's done column through the board API (activity log, revision, permissions). */
  async function markDone(card: TodayCard) {
    if (!card.doneColumnId) return;
    const remove = (list: TodayCard[]) => list.filter(item => item.id !== card.id);
    setToday(remove);
    setActive(remove);
    const response = await api(`/api/workspaces/${card.slug}/cards/${card.id}`, {
      method: "PATCH",
      json: { columnId: card.doneColumnId },
    });
    if (!response.ok) {
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      void loadToday();
      return;
    }
    toast({
      message: t("home.today.doneToast", { title: card.title }),
      action: {
        label: t("activity.undo.cta"),
        onClick: async () => {
          await api(`/api/workspaces/${card.slug}/cards/${card.id}`, { method: "PATCH", json: { columnId: card.columnId } });
          void loadToday();
        },
      },
    });
  }

  return (
    <div className="home-dashboard">
      <div className="home-main">
        <div className="panel home-capture">
          <span className="eyebrow">{t("home.assistant.eyebrow")}</span>
          <div className="home-capture-main">
            <button
              type="button"
              className={`home-mic ${recording ? "active" : ""}`}
              onClick={() => void toggleMic()}
              disabled={micDisabled && !recording}
              aria-label={recording ? t("home.assistant.stop") : t("home.assistant.speak")}
            >
              <Icon name={recording ? "stop" : "mic"} size={44} />
            </button>
            <div className="home-capture-copy">
              <h2>{t("home.assistant.title")}</h2>
              <strong className="home-capture-status" aria-live="polite">
                {busy === "transcribing"
                  ? t("home.assistant.transcribing")
                  : recording
                    ? t("home.assistant.recording", { seconds })
                    : t("home.assistant.speak")}
              </strong>
              <span className="subtle">
                {recording
                  ? t("board.composer.maxDuration", { max: clock(recordSeconds) })
                  : dictation && textFull
                    ? t("home.assistant.textFull")
                    : dictation
                      ? t("home.assistant.body")
                      : t("home.assistant.noDictation")}
              </span>
            </div>
            {recording && (
              <button type="button" className="btn sm" onClick={() => stop(true)}>
                {t("common.cancel")}
              </button>
            )}
          </div>
          <label htmlFor="home-thoughts" className="field-label">
            {t("home.assistant.textLabel")}
          </label>
          <textarea
            id="home-thoughts"
            ref={textArea}
            rows={3}
            value={text}
            aria-describedby="home-thoughts-count"
            disabled={Boolean(busy) || pending.length > 0}
            placeholder={t("home.assistant.placeholder")}
            onChange={event => {
              setText(event.target.value);
              setSource("text");
              setSegments([]);
              setSelectedCaptureIds([]);
            }}
          />
          {/* Nothing is cut: past the per-request limit the text is split into parts, and the counter says so up front. */}
          <p
            id="home-thoughts-count"
            className={`home-counter ${text.trim().length > MAX_INPUT ? "over" : ""}`}
            aria-live={text.trim().length > MAX_INPUT ? "polite" : "off"}
          >
            <span>{t("home.assistant.counter", { count: number(text.trim().length), max: number(MAX_INPUT) })}</span>
            <span>
              {text.trim().length > MAX_INPUT
                ? t("home.assistant.counterOver", { parts: splitTranscript(text).length })
                : t("home.assistant.counterHint", { minutes: speechMinutes(MAX_INPUT) })}
            </span>
          </p>
          {warning && (
            <div className="notice warning" role="status">
              <Icon name="alert" />
              <div className="notice-body">{warning}</div>
              <button type="button" className="btn sm" onClick={() => setWarning("")}>
                {t("common.close")}
              </button>
            </div>
          )}
          {parts && (
            <p className="subtle" role="status">
              {t("home.assistant.transcriptParts", { current: parts.current, total: parts.total })}
            </p>
          )}
          <div className="row home-capture-actions">
            <span className="subtle">{t("home.assistant.previewHint")}</span>
            <span className="spacer" />
            <button
              type="button"
              className="btn primary"
              disabled={!text.trim() || Boolean(busy) || recording || pending.length > 0 || paused}
              onClick={() => void route()}
            >
              {busy && busy !== "transcribing" ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
              {t("home.assistant.organize")}
            </button>
          </div>
          <div className="home-imports">
            <label className="home-audio-import">
              <Icon name="upload" size={16} /> {t("home.assistant.importAudio")}
              <input
                type="file"
                accept="audio/*,.ogg,.oga,.opus,.mp3,.m4a,.aac,.webm,.wav"
                disabled={micDisabled || recording}
                onChange={event => {
                  void importAudio(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="home-audio-import" title={t("home.assistant.importTranscriptHint")}>
              {importing ? <span className="spinner" /> : <Icon name="file" size={16} />}{" "}
              {importing ? t("home.assistant.importing") : t("home.assistant.importTranscript")}
              <input
                type="file"
                accept={DOCUMENT_ACCEPT}
                aria-describedby="home-import-formats"
                disabled={importing || Boolean(busy) || recording || paused || pending.length > 0}
                onChange={event => {
                  void importTranscript(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="home-audio-import text-button"
              aria-expanded={googleDocOpen}
              aria-controls="home-google-doc"
              disabled={importing || Boolean(busy) || recording || paused || pending.length > 0}
              onClick={() => setGoogleDocOpen(value => !value)}
            >
              <Icon name="link" size={16} /> {t("home.assistant.importGoogleDoc")}
            </button>
            <Link href="/app/integrations" className="home-audio-import">
              <Icon name="settings" size={16} /> {t("home.assistant.integrations")}
            </Link>
          </div>
          <p className="subtle home-import-formats" id="home-import-formats">
            {t("home.assistant.importTranscriptHint")}
          </p>
          {googleDocOpen && (
            <form className="home-google-doc" id="home-google-doc" onSubmit={event => void importGoogleDoc(event)}>
              <label htmlFor="home-google-doc-url" className="field-label">
                {t("home.assistant.googleDocLabel")}
              </label>
              <div className="row">
                <input
                  id="home-google-doc-url"
                  type="url"
                  inputMode="url"
                  required
                  value={googleDocUrl}
                  placeholder={t("home.assistant.googleDocPlaceholder")}
                  onChange={event => setGoogleDocUrl(event.target.value)}
                  aria-describedby="home-google-doc-hint"
                />
                <button type="submit" className="btn" disabled={importing || !googleDocUrl.trim()}>
                  {importing ? <span className="spinner" /> : null}
                  {t("home.assistant.googleDocImport")}
                </button>
              </div>
              <p className="subtle" id="home-google-doc-hint">
                {t("home.assistant.googleDocHint")}
              </p>
            </form>
          )}
          {!boards.length && <p className="subtle">{t("home.assistant.noBoards")}</p>}
          {notice && (
            <p className="subtle" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div ref={results} className="home-results-anchor" aria-hidden="true" />
          {segments.length > 0 && (
            <RoutingReview
              segments={segments}
              boards={boards}
              canCreate={Boolean(newBoardTarget)}
              busy={Boolean(busy)}
              working={busy === "proposing"}
              onText={(key, value) => setSegments(current => current.map(item => (item.key === key ? { ...item, text: value } : item)))}
              onAssign={assign}
              onRemove={key => setSegments(current => current.filter(item => item.key !== key))}
              onCreate={(keys, suggestion) => void createBoardFor(keys, suggestion)}
              onCancel={() => setSegments([])}
              onConfirm={() => void confirmRouting()}
            />
          )}
          {pending.map(item => (
            <div className="home-pending" key={item.proposal.id}>
              <div className="row">
                <Icon name="file" size={15} />
                <strong>{item.board.name}</strong>
                <span className="spacer" />
                {boards.length > 1 && (
                  <BoardPicker
                    label={t("home.assistant.changeBoard")}
                    buttonLabel={t("home.assistant.changeBoard")}
                    boards={boards.filter(board => board.id !== item.board.id)}
                    disabled={Boolean(busy)}
                    onPick={value => void moveTo(item, value.slice(2))}
                  />
                )}
              </div>
              <ProposalPanel
                proposal={item.proposal}
                busy={Boolean(busy)}
                onApply={indexes => void apply(item, indexes)}
                onDiscard={() => void discard(item)}
                onClarify={answer => void clarify(item, answer)}
              />
            </div>
          ))}
          {busy === "proposing" && segments.length === 0 && (
            <p className="home-working" role="status">
              <span className="spinner" />
              {t("home.assistant.working")}
            </p>
          )}
          {personalBoardOffer && (
            <div className="home-personal-offer">
              <div>
                <strong>{t("home.assistant.personalTitle")}</strong>
                <p className="subtle">{t("home.assistant.personalBody")}</p>
              </div>
              <button type="button" className="btn sm" disabled={Boolean(busy)} onClick={() => void createPersonalBoard()}>
                {t("home.assistant.personalCta")}
              </button>
            </div>
          )}
          {captures.length > 0 && (
            <div className="home-inbox">
              <div className="row">
                <div>
                  <h3>{t("home.assistant.inbox")}</h3>
                  <p className="subtle">{t("home.assistant.inboxHint")}</p>
                </div>
                <span className="spacer" />
                <Link href="/app/integrations" className="btn sm">
                  {t("home.assistant.integrations")}
                </Link>
                <button type="button" className="btn sm" onClick={() => void loadCaptures()}>
                  {t("home.assistant.refresh")}
                </button>
              </div>
              {captures.map(capture => (
                <div className="home-inbox-item" key={capture.id}>
                  <span className="subtle">{capture.source === "TELEGRAM" ? "Telegram" : t("home.assistant.shared")}</span>
                  <p>
                    {capture.status === "READY"
                      ? capture.text.slice(0, 260)
                      : capture.status === "FAILED" && !capture.retryable
                        ? t("home.assistant.captureStatus.FAILED_FINAL")
                        : t(`home.assistant.captureStatus.${capture.status}`)}
                  </p>
                  <div className="row">
                    {capture.status === "READY" && (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={Boolean(busy) || recording || pending.length > 0 || selectedCaptureIds.includes(capture.id)}
                        onClick={() => {
                          setText(current => (current.trim() ? `${current.trim()}\n${capture.text}` : capture.text));
                          setSource("text");
                          setSegments([]);
                          setSelectedCaptureIds(current => (current.includes(capture.id) ? current : [...current, capture.id]));
                          textArea.current?.focus();
                        }}
                      >
                        {selectedCaptureIds.includes(capture.id) ? t("home.assistant.captureAdded") : t("home.assistant.useCapture")}
                      </button>
                    )}
                    {capture.status === "FAILED" && capture.retryable && (
                      <button type="button" className="btn sm" onClick={() => void retryCapture(capture.id)}>
                        {t("home.assistant.retryCapture")}
                      </button>
                    )}
                    <button type="button" className="btn sm" onClick={() => void archiveCapture(capture.id)}>
                      {t("home.assistant.removeCapture")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {boardList}
      </div>
      <div className="home-side">
        <section className="panel home-today" aria-labelledby="home-today-title">
          <span className="eyebrow">{t("home.today.eyebrow")}</span>
          <h2 id="home-today-title">{t("home.today.title")}</h2>
          <p className="subtle">{new Date().toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}</p>
          {todayError ? (
            <p className="subtle">{t("home.today.error")}</p>
          ) : visibleToday.length ? (
            <ul id="home-today-list">
              {shownToday.map(card => (
                <TodayItem key={card.id} card={card} due={dueLabel(card)} overdue={isOverdue(card)} onDone={() => void markDone(card)} />
              ))}
            </ul>
          ) : (
            <div className="home-today-empty">
              <Icon name="checkCircle" size={23} />
              <p>{t("home.today.empty")}</p>
            </div>
          )}
          {!todayError && visibleToday.length > TODAY_PREVIEW && (
            <button
              type="button"
              className="btn sm block home-today-more"
              aria-expanded={todayExpanded}
              aria-controls="home-today-list"
              onClick={() => setTodayExpanded(value => !value)}
            >
              <Icon name={todayExpanded ? "chevronUp" : "chevronDown"} size={15} />
              {todayExpanded ? t("home.today.showLess") : t("home.today.showAll", { count: visibleToday.length })}
            </button>
          )}
          {!todayError && active.length > 0 && (todayExpanded || visibleToday.length < TODAY_PREVIEW) && (
            <>
              <h3 className="home-today-sub">{t("home.today.activeTitle")}</h3>
              <ul>
                {active.map(card => (
                  <TodayItem key={card.id} card={card} onDone={() => void markDone(card)} />
                ))}
              </ul>
            </>
          )}
        </section>
        {sidebar}
      </div>
    </div>
  );
}
