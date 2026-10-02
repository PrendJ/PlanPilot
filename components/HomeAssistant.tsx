"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api } from "./ui";
import { useUpdateBlocker } from "./PwaProvider";
import { ProposalPanel } from "./board/ProposalPanel";
import type { Proposal } from "./board/types";
import { clearSharedCapture, consumeSharedCapture } from "@/lib/share-inbox";

type BoardChoice = { id: string; name: string; slug: string; dictationEnabled?: boolean };
type Segment = { text: string; workspaceId: string | null };
type Pending = { board: BoardChoice; proposal: Proposal };
type TodayCard = { id: string; title: string; dueDate: string | null; priority: string; board: string; slug: string; column: string };
type Capture = { id: string; source: string; text: string; status: string; createdAt: string; retryable?: boolean };

const MAX_INPUT = 12_000;
const MAX_TRANSCRIPT = 60_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Splits a long transcript on paragraph, then sentence, boundaries so each part fits one AI request. */
export function splitTranscript(content: string, size = MAX_INPUT) {
  const parts: string[] = [];
  let rest = content.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ") + 1);
    const at = cut > size * 0.5 ? cut : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
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
}: {
  initialBoards: BoardChoice[];
  paused: boolean;
  quick?: boolean;
  shared?: boolean;
  shareError?: boolean;
  personalBoardOffer?: { organizationId: string; locale: string; name: string } | null;
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
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [parts, setParts] = useState<{ queue: string[]; current: number; total: number } | null>(null);
  const [busy, setBusy] = useState<"" | "routing" | "transcribing" | "proposing" | "applying" | "creating">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const micDisabled = paused || Boolean(busy) || pending.length > 0 || !dictation;

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
      setError(response.data.error || t("errors.TRANSCRIPTION_FAILED"));
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

  async function importTranscript(file: File | null) {
    if (!file) return;
    if (file.size > MAX_TRANSCRIPT * 4) {
      setError(t("home.assistant.transcriptTooLong"));
      return;
    }
    const content = (await file.text()).trim();
    if (!content || content.length > MAX_TRANSCRIPT) {
      setError(t("home.assistant.transcriptTooLong"));
      return;
    }
    setError("");
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
      timer.current = setInterval(
        () =>
          setSeconds(value => {
            if (value >= 119) stop();
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

  async function propose(routed: Segment[], choices: BoardChoice[]) {
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
      const content = groupedParts.join("\n");
      const response = await api<{ proposal: Proposal }>(`/api/workspaces/${board.slug}/ingest`, {
        method: "POST",
        json: { text: content, source, autoApply: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      if (response.ok) created.push({ board, proposal: response.data.proposal });
      else {
        failed.push(content);
        setError(response.data.error || t("errors.AI_UNAVAILABLE"));
      }
    }
    setPending(current => [...current, ...created]);
    setText(failed.join("\n\n"));
    setSegments([]);
    setBusy("");
  }

  async function route() {
    const input = text.trim();
    if (!input || busy || pending.length || paused) return;
    setBusy("routing");
    setError("");
    setNotice("");
    const response = await api<{ segments: Segment[]; boards: BoardChoice[] }>("/api/home/route", {
      method: "POST",
      json: { text: input },
    });
    setBusy("");
    if (!response.ok) {
      setError(response.data.error || t("errors.AI_UNAVAILABLE"));
      return;
    }
    const routedBoards = response.data.boards.map(board => ({
      ...board,
      dictationEnabled: boards.find(item => item.id === board.id)?.dictationEnabled,
    }));
    setBoards(routedBoards);
    if (response.data.segments.some(segment => !segment.workspaceId)) setSegments(response.data.segments);
    else void propose(response.data.segments, routedBoards);
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
    await dropProposal(item);
    await propose([{ text: item.proposal.inputText, workspaceId }], boards);
  }

  async function clarify(item: Pending, answer: string) {
    await dropProposal(item);
    const content = `${item.proposal.inputText}\n(${t("board.proposal.clarifiedAs")}: ${answer})`;
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

  const dueLabel = (card: TodayCard) =>
    card.dueDate && new Date(card.dueDate).getTime() < todayStart.getTime() ? t("home.today.overdue") : t("home.today.dueToday");

  return (
    <section className="home-assistant" aria-label={t("home.assistant.title")}>
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
              ? t("board.composer.maxDuration", { max: "2:00" })
              : dictation
                ? t("home.assistant.body")
                : t("home.assistant.noDictation")}
          </span>
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
          maxLength={MAX_INPUT}
          disabled={Boolean(busy) || pending.length > 0}
          placeholder={t("home.assistant.placeholder")}
          onChange={event => {
            setText(event.target.value);
            setSource("text");
            setSegments([]);
            setSelectedCaptureIds([]);
          }}
        />
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
          <label className="home-audio-import">
            <Icon name="file" size={16} /> {t("home.assistant.importTranscript")}
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              disabled={Boolean(busy) || recording || paused || pending.length > 0}
              onChange={event => {
                void importTranscript(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
          </label>
        </div>
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
        {segments.length > 0 && (
          <div className="home-routing">
            <h3>{t("home.assistant.routeTitle")}</h3>
            {segments.map((segment, index) => (
              <div className="home-route-row" key={`${segment.text}-${index}`}>
                <p>“{segment.text}”</p>
                <select
                  aria-label={t("home.assistant.destination")}
                  value={segment.workspaceId || ""}
                  onChange={event =>
                    setSegments(current =>
                      current.map((item, i) => (i === index ? { ...item, workspaceId: event.target.value || null } : item)),
                    )
                  }
                >
                  <option value="">{t("home.assistant.chooseBoard")}</option>
                  {boards.map(board => (
                    <option value={board.id} key={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="row">
              <button type="button" className="btn" onClick={() => setSegments([])}>
                {t("common.cancel")}
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="btn primary"
                disabled={Boolean(busy) || segments.some(segment => !segment.workspaceId)}
                onClick={() => void propose(segments, boards)}
              >
                {t("home.assistant.preview")}
              </button>
            </div>
          </div>
        )}
        {pending.map(item => (
          <div className="home-pending" key={item.proposal.id}>
            <div className="row">
              <Icon name="file" size={15} />
              <strong>{item.board.name}</strong>
              <span className="spacer" />
              {boards.length > 1 && (
                <select
                  aria-label={t("home.assistant.changeBoard")}
                  value=""
                  disabled={Boolean(busy)}
                  onChange={event => void moveTo(item, event.target.value)}
                >
                  <option value="">{t("home.assistant.changeBoard")}</option>
                  {boards
                    .filter(board => board.id !== item.board.id)
                    .map(board => (
                      <option value={board.id} key={board.id}>
                        {board.name}
                      </option>
                    ))}
                </select>
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
          {captures.length ? (
            captures.map(capture => (
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
            ))
          ) : (
            <p className="subtle">{t("home.assistant.inboxEmpty")}</p>
          )}
        </div>
      </div>
      <div className="panel home-today">
        <span className="eyebrow">{t("home.today.eyebrow")}</span>
        <h2>{t("home.today.title")}</h2>
        <p className="subtle">{new Date().toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}</p>
        {todayError ? (
          <p className="subtle">{t("home.today.error")}</p>
        ) : visibleToday.length ? (
          <ul>
            {visibleToday.map(card => (
              <li key={card.id}>
                <Link href={`/app/${card.slug}?card=${card.id}`}>
                  <strong>{card.title}</strong>
                  <span>
                    {card.board} · {card.column}
                  </span>
                  <small className={dueLabel(card) === t("home.today.overdue") ? "overdue" : ""}>{dueLabel(card)}</small>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="home-today-empty">
            <Icon name="checkCircle" size={23} />
            <p>{t("home.today.empty")}</p>
          </div>
        )}
        {!todayError && active.length > 0 && (
          <>
            <h3 className="home-today-sub">{t("home.today.activeTitle")}</h3>
            <ul>
              {active.map(card => (
                <li key={card.id}>
                  <Link href={`/app/${card.slug}?card=${card.id}`}>
                    <strong>{card.title}</strong>
                    <span>
                      {card.board} · {card.column}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
