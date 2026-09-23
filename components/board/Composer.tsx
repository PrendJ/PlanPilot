"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Icon } from "../Icon";
import { useT } from "../I18nProvider";
import { api } from "../ui";
import { useUpdateBlocker } from "../PwaProvider";
import type { Proposal } from "./types";

const MAX_SECONDS = 120;
const BARS = 24;

export type ComposerHandle = { focus: () => void; toggleMic: () => void; setText: (value: string) => void };

type Props = {
  slug: string;
  disabled: boolean;
  dictationEnabled: boolean;
  quotaPaused: boolean;
  autoSendDictation: boolean;
  examples?: string[];
  onResult: (result: { proposal: Proposal; receipt?: { updateId: string; applied: number } }) => void;
  onError: (message: string) => void;
};

/** Text + voice input for AI updates. The draft survives reloads (per board, this tab only). */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { slug, disabled, dictationEnabled, quotaPaused, autoSendDictation, examples, onResult, onError },
  ref,
) {
  const t = useT();
  const storageKey = `boardcue:draft:${slug}`;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "transcribing" | "thinking">("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const frame = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const source = useRef<"text" | "voice">("text");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setText(saved);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(storageKey, text);
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* storage unavailable */
    }
  }, [text, storageKey]);
  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(180, node.scrollHeight)}px`;
  }, [text]);

  const cleanup = useCallback(() => {
    clearInterval(timer.current);
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    setLevels(Array(BARS).fill(0));
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const send = useCallback(
    async (value: string, from: "text" | "voice") => {
      const input = value.trim();
      if (!input || disabled || quotaPaused) return;
      setBusy("thinking");
      const response = await api<{ proposal: Proposal; receipt?: { updateId: string; applied: number } }>(
        `/api/workspaces/${slug}/ingest`,
        { method: "POST", json: { text: input, source: from, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
      );
      setBusy("");
      if (!response.ok) {
        onError(response.data.error || t("errors.AI_UNAVAILABLE"));
        return;
      }
      setText("");
      source.current = "text";
      onResult(response.data);
    },
    [disabled, quotaPaused, slug, onResult, onError, t],
  );

  async function transcribe(blob: Blob, mime: string) {
    setBusy("transcribing");
    const form = new FormData();
    form.append("audio", new Blob([blob], { type: mime }), mime.includes("mp4") ? "recording.m4a" : "recording.webm");
    const response = await api<{ text: string }>(`/api/workspaces/${slug}/transcribe`, { method: "POST", body: form });
    setBusy("");
    if (!response.ok || !response.data.text) {
      onError(response.data.error || t("errors.TRANSCRIPTION_FAILED"));
      return;
    }
    const combined = text.trim() ? `${text.trim()}\n${response.data.text}` : response.data.text;
    source.current = "voice";
    if (autoSendDictation) await send(combined, "voice");
    else {
      setText(combined);
      textarea.current?.focus();
    }
  }

  const stop = useCallback((cancel = false) => {
    cancelled.current = cancel;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!dictationEnabled || disabled || busy) return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = media;
      const mime =
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
          type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
        ) || "";
      const rec = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      recorder.current = rec;
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = event => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        setRecording(false);
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        cleanup();
        if (!cancelled.current && blob.size > 0) void transcribe(blob, type);
      };
      // Live level meter so people see the microphone is hearing them.
      const context = new AudioContext();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(data);
        setLevels(Array.from({ length: BARS }, (_, index) => data[Math.floor((index * data.length) / BARS)] / 255));
        frame.current = requestAnimationFrame(draw);
      };
      draw();
      rec.start(1000);
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(
        () =>
          setSeconds(value => {
            if (value + 1 >= MAX_SECONDS) stop(false);
            return value + 1;
          }),
        1000,
      );
    } catch {
      cleanup();
      onError(t("board.composer.micDenied"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationEnabled, disabled, busy, cleanup, stop, onError, t]);

  // An unsent draft or a recording must never be lost to an app update.
  useUpdateBlocker(`composer:${slug}`, Boolean(text.trim()) || recording || Boolean(busy));

  const toggleMic = useCallback(() => {
    if (recording) stop(false);
    else void start();
  }, [recording, start, stop]);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => textarea.current?.focus(),
      toggleMic,
      setText: (value: string) => {
        setText(value);
        textarea.current?.focus();
      },
    }),
    [toggleMic],
  );

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className={`composer ${recording ? "recording" : ""}`}>
      {recording ? (
        <div className="recording-strip" role="status" aria-live="polite">
          <span className="timer">{time}</span>
          <span className="level-bars" aria-hidden="true">
            {levels.map((level, index) => (
              <i key={index} style={{ height: `${Math.max(3, level * 22)}px` }} />
            ))}
          </span>
          <span className="subtle">{t("board.composer.maxDuration", { max: "2:00" })}</span>
          <button type="button" className="btn sm" onClick={() => stop(true)}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn sm primary" onClick={() => stop(false)}>
            <Icon name="check" size={15} />
            {t("board.composer.done")}
          </button>
        </div>
      ) : (
        <div className="composer-row">
          <label htmlFor={`composer-${slug}`} className="sr-only">
            {t("board.composer.label")}
          </label>
          <textarea
            id={`composer-${slug}`}
            ref={textarea}
            value={text}
            rows={1}
            disabled={disabled || Boolean(busy)}
            onChange={event => {
              setText(event.target.value);
              if (!event.target.value) source.current = "text";
            }}
            placeholder={quotaPaused ? t("board.composer.quotaPlaceholder") : t("board.composer.placeholder")}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey || !event.shiftKey) && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(text, source.current);
              }
            }}
          />
          <div className="composer-actions">
            {dictationEnabled && (
              <button
                type="button"
                className="mic-btn"
                onClick={toggleMic}
                disabled={disabled || Boolean(busy)}
                aria-label={t("board.composer.dictate")}
                title={`${t("board.composer.dictate")} (M)`}
              >
                <Icon name="mic" size={20} />
              </button>
            )}
            <button
              type="button"
              className="send-btn"
              onClick={() => void send(text, source.current)}
              disabled={disabled || Boolean(busy) || !text.trim() || quotaPaused}
              aria-label={t("board.composer.send")}
            >
              <Icon name="send" size={20} />
            </button>
          </div>
        </div>
      )}
      {busy && (
        <div className="working" role="status" aria-live="polite">
          <span className="spinner" />
          {busy === "transcribing" ? t("board.composer.transcribing") : t("board.composer.thinking")}
        </div>
      )}
      {!recording && !busy && (
        <div className="composer-meta">
          <span>
            <Icon name="sparkles" size={13} /> {t("board.composer.hint")}
          </span>
          <span className="spacer" />
          <span className="hide-mobile">
            <span className="kbd">Enter</span> {t("board.composer.toSend")} · <span className="kbd">Shift</span>+
            <span className="kbd">Enter</span> {t("board.composer.newLine")}
          </span>
        </div>
      )}
      {examples && examples.length > 0 && !text && !recording && !busy && (
        <div className="composer-examples">
          {examples.map(example => (
            <button
              key={example}
              type="button"
              className="chip"
              onClick={() => {
                setText(example);
                textarea.current?.focus();
              }}
            >
              <Icon name="sparkles" size={13} />
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
