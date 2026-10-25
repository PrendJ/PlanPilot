/**
 * Plain text from the documents people already have: Word (.docx, also what Google Docs downloads), OpenDocument
 * (.odt), RTF (TextEdit, Word), HTML, Markdown and plain text. Pure functions: the ZIP inflater is injected, so the
 * same code runs in Node (zlib) and in tests. Nothing here stores or logs document content.
 */

export type DocumentFormat = "docx" | "odt" | "rtf" | "html" | "text";

export class DocumentTextError extends Error {
  constructor(code: "DOCUMENT_UNSUPPORTED" | "DOCUMENT_UNREADABLE" | "PAGES_EXPORT_NEEDED") {
    super(code);
  }
}

/** Uncompressed bytes we accept from a single ZIP entry: far above any real document text, far below a zip bomb. */
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

type Inflate = (data: Uint8Array, maxBytes: number) => Uint8Array | Promise<Uint8Array>;

const u16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes: Uint8Array, at: number) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

/** Names of the entries of a ZIP archive (central directory), or null when the bytes are not a readable ZIP. */
function zipDirectory(bytes: Uint8Array) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (u32(bytes, at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const entries: Array<{ name: string; method: number; compressed: number; size: number; offset: number }> = [];
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) return null;
    const nameLength = u16(bytes, at + 28);
    entries.push({
      method: u16(bytes, at + 10),
      compressed: u32(bytes, at + 20),
      size: u32(bytes, at + 24),
      offset: u32(bytes, at + 42),
      name: new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)),
    });
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return entries;
}

async function zipEntry(bytes: Uint8Array, entries: NonNullable<ReturnType<typeof zipDirectory>>, name: string, inflate: Inflate) {
  const entry = entries.find(item => item.name === name);
  if (!entry) return null;
  if (entry.size > MAX_ENTRY_BYTES) throw new DocumentTextError("DOCUMENT_UNREADABLE");
  const local = entry.offset;
  if (u32(bytes, local) !== 0x04034b50) throw new DocumentTextError("DOCUMENT_UNREADABLE");
  const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
  const data = bytes.subarray(start, start + entry.compressed);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new DocumentTextError("DOCUMENT_UNREADABLE");
  return new TextDecoder().decode(await inflate(data, MAX_ENTRY_BYTES));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Blank lines collapsed, trailing spaces removed: what a person would retype. */
function tidy(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** word/document.xml: the text runs of each paragraph, one paragraph per line. Deleted (tracked) text is skipped. */
export function docxXmlToText(xml: string) {
  let text = "";
  for (const match of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>|<\/w:p>/g)) {
    if (match[1] !== undefined) text += decodeEntities(match[1]);
    else if (match[2] === "tab") text += "\t";
    else text += "\n";
  }
  return tidy(text);
}

/** content.xml of an OpenDocument text: paragraphs and headings of the body, with ODF spaces, tabs and breaks. */
export function odtXmlToText(xml: string) {
  const body = /<office:body>([\s\S]*)<\/office:body>/.exec(xml)?.[1] ?? xml;
  return tidy(
    decodeEntities(
      body
        .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_match, count: string) => " ".repeat(Math.min(Number(count), 200)))
        .replace(/<text:s\s*\/>/g, " ")
        .replace(/<text:tab\s*\/>/g, "\t")
        .replace(/<text:line-break\s*\/>/g, "\n")
        .replace(/<\/text:(p|h)>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

/** HTML (also what browsers and Google Docs save): visible text, with block elements on their own lines. */
export function htmlToText(html: string) {
  return tidy(
    decodeEntities(
      html
        .replace(/<(script|style|head|template)\b[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|section|article)>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "- ")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

const RTF_SKIPPED = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "headerl", "headerr", "headerf", "footer",
  "footerl", "footerr", "footerf", "themedata", "colorschememapping", "latentstyles", "datastore", "xmlnstbl",
  "listtable", "listoverridetable", "rsidtbl", "generator", "filetbl", "revtbl", "fldinst", "bkmkstart", "bkmkend",
]);

/** RTF (Apple TextEdit, WordPad, Word): text of the document body, without fonts, styles, pictures or fields. */
export function rtfToText(rtf: string) {
  const ansi = new TextDecoder("windows-1252");
  const stack: Array<{ skip: boolean; uc: number }> = [];
  let state = { skip: false, uc: 1 };
  let text = "";
  let pendingSkip = 0;
  let index = 0;
  const emit = (value: string) => {
    if (state.skip) return;
    if (pendingSkip > 0) {
      pendingSkip--;
      return;
    }
    text += value;
  };
  while (index < rtf.length) {
    const char = rtf[index];
    if (char === "{") {
      stack.push(state);
      state = { ...state };
      index++;
    } else if (char === "}") {
      state = stack.pop() ?? state;
      index++;
    } else if (char === "\\") {
      const next = rtf[index + 1];
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        index += 2;
      } else if (next === "'") {
        const hex = rtf.slice(index + 2, index + 4);
        if (pendingSkip > 0) pendingSkip--;
        else if (!state.skip) text += ansi.decode(new Uint8Array([parseInt(hex, 16) || 32]));
        index += 4;
      } else if (next === "*") {
        state.skip = true;
        index += 2;
      } else if (next === "~") {
        emit(" ");
        index += 2;
      } else if (next === "_") {
        emit("-");
        index += 2;
      } else if (next === "\n" || next === "\r") {
        emit("\n");
        index += 2;
      } else if (/[a-z]/i.test(next ?? "")) {
        const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(index, index + 40))!;
        const [whole, word, param] = match;
        index += whole.length;
        if (RTF_SKIPPED.has(word)) state.skip = true;
        else if (word === "par" || word === "line" || word === "sect" || word === "row") emit("\n");
        else if (word === "tab" || word === "cell") emit("\t");
        else if (word === "uc") state.uc = Number(param ?? 1);
        else if (word === "u" && param !== undefined) {
          const code = Number(param);
          emit(String.fromCharCode(code < 0 ? code + 65536 : code));
          if (!state.skip) pendingSkip = state.uc;
        } else if (word === "emdash") emit("—");
        else if (word === "endash") emit("–");
        else if (word === "bullet") emit("•");
        else if (word === "lquote" || word === "rquote") emit("’");
        else if (word === "ldblquote" || word === "rdblquote") emit("\"");
      } else index += 2;
    } else {
      if (char !== "\r" && char !== "\n") emit(char);
      index++;
    }
  }
  return tidy(text);
}

/** "zip" covers .docx, .odt and .pages alike: the entries inside tell them apart. */
export function detectFormat(name: string, bytes: Uint8Array): DocumentFormat | "zip" | "pages" | null {
  const extension = name.toLowerCase().split(".").pop() || "";
  if (extension === "pages") return "pages";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "zip";
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
  if (head.startsWith("{\\rtf")) return "rtf";
  if (["html", "htm"].includes(extension) || head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  if (["txt", "md", "markdown", "text"].includes(extension) || !name.includes(".")) return "text";
  return null;
}

/** Extracts the text of an uploaded document. Throws DocumentTextError with a code the UI can explain. */
export async function documentToText(name: string, bytes: Uint8Array, inflate: Inflate): Promise<{ text: string; format: DocumentFormat }> {
  const format = detectFormat(name, bytes);
  if (format === "pages") throw new DocumentTextError("PAGES_EXPORT_NEEDED");
  if (!format) throw new DocumentTextError("DOCUMENT_UNSUPPORTED");
  if (format === "text") return { text: tidy(new TextDecoder().decode(bytes).replace(/^﻿/, "")), format };
  if (format === "rtf") return { text: rtfToText(new TextDecoder("windows-1252").decode(bytes)), format };
  if (format === "html") return { text: htmlToText(new TextDecoder().decode(bytes)), format };
  const entries = zipDirectory(bytes);
  if (!entries) throw new DocumentTextError("DOCUMENT_UNREADABLE");
  // Pages (iWork) files are ZIP packages of binary IWA streams: there is no text to read without Apple's tools.
  if (entries.some(entry => entry.name.startsWith("Index/") && entry.name.endsWith(".iwa"))) throw new DocumentTextError("PAGES_EXPORT_NEEDED");
  const docx = await zipEntry(bytes, entries, "word/document.xml", inflate);
  if (docx !== null) return { text: docxXmlToText(docx), format: "docx" };
  const odt = await zipEntry(bytes, entries, "content.xml", inflate);
  if (odt !== null) return { text: odtXmlToText(odt), format: "odt" };
  throw new DocumentTextError("DOCUMENT_UNSUPPORTED");
}

/**
 * The plain-text export address of a Google Docs link, or null when the link is not a Google document.
 * Only docs.google.com document IDs are accepted: the server never fetches an address typed by the user.
 */
export function googleDocsExportUrl(link: string) {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const id = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,128})(?:\/|$)/.exec(url.pathname)?.[1];
  return id ? `https://docs.google.com/document/d/${id}/export?format=txt` : null;
}
