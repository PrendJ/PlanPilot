import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  docxXmlToText,
  documentToText,
  googleDocsExportUrl,
  htmlToText,
  MAX_ENTRY_BYTES,
  odtXmlToText,
  rtfToText,
} from "@/lib/document-text";

const inflate = (data: Uint8Array, maxBytes: number) => inflateRawSync(data, { maxOutputLength: maxBytes });

/** A minimal ZIP writer (deflate, no ZIP64): enough to build synthetic .docx/.odt/.pages packages. */
function zip(files: Record<string, string>, declaredSize?: number) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(declaredSize ?? raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const docxXml =
  '<w:document><w:body><w:p><w:r><w:t>Chiamare la banca</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> domani &amp; poi</w:t></w:r></w:p>' +
  "<w:p><w:r><w:t>Preventivo Rossi</w:t></w:r><w:r><w:br/><w:t>entro venerdì</w:t></w:r><w:del><w:r><w:delText>testo cancellato</w:delText></w:r></w:del></w:p></w:body></w:document>";

describe("document text import (synthetic files)", () => {
  it("reads Word paragraphs, tabs and breaks, skipping deleted tracked text", () => {
    expect(docxXmlToText(docxXml)).toBe("Chiamare la banca\t domani & poi\nPreventivo Rossi\nentro venerdì");
  });
  it("reads a .docx package, as downloaded from Word or Google Docs", async () => {
    const file = zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": docxXml });
    await expect(documentToText("note.docx", file, inflate)).resolves.toEqual({ text: expect.stringContaining("Preventivo Rossi"), format: "docx" });
  });
  it("reads OpenDocument text with ODF spaces, tabs and headings", async () => {
    const xml =
      '<office:document-content><office:automatic-styles><style:style style:name="P1"/></office:automatic-styles><office:body><office:text>' +
      '<text:h>Lista</text:h><text:p>Comprare<text:s text:c="2"/>latte<text:tab/>oggi</text:p><text:p>Tagliare il prato<text:line-break/>sabato</text:p>' +
      "</office:text></office:body></office:document-content>";
    expect(odtXmlToText(xml)).toBe("Lista\nComprare  latte\toggi\nTagliare il prato\nsabato");
    await expect(documentToText("lista.odt", zip({ mimetype: "application/vnd.oasis.opendocument.text", "content.xml": xml }), inflate))
      .resolves.toMatchObject({ format: "odt" });
  });
  it("reads RTF from TextEdit and Word without fonts, colours or field codes", () => {
    const rtf =
      String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2761{\fonttbl\f0\fswiss Helvetica;}{\colortbl;\red255\green255\blue255;}` +
      String.raw`{\*\expandedcolortbl;;}\pard\f0\fs24 Chiamare la banca \'e8 urgente\par Caff\u233?\tab fatto\par ` +
      String.raw`{\field{\*\fldinst{HYPERLINK "https://example.invalid"}}{\fldrslt link}}}`;
    expect(rtfToText(rtf)).toBe("Chiamare la banca è urgente\nCaffé\tfatto\nlink");
  });
  it("reads HTML as visible lines and plain text as is", async () => {
    expect(htmlToText("<html><head><title>x</title><style>p{}</style></head><body><h1>Oggi</h1><ul><li>Banca</li><li>Prato</li></ul><p>A&nbsp;dopo<br>ciao</p></body></html>"))
      .toBe("Oggi\n- Banca\n- Prato\nA dopo\nciao");
    await expect(documentToText("note.md", new TextEncoder().encode("﻿# Note\n\n\n\nBanca  \n"), inflate)).resolves.toEqual({ text: "# Note\n\nBanca", format: "text" });
  });
  it("explains Pages files instead of failing silently, and rejects unknown formats", async () => {
    await expect(documentToText("lettera.pages", zip({ "Index/Document.iwa": "binary" }), inflate)).rejects.toThrow("PAGES_EXPORT_NEEDED");
    await expect(documentToText("lettera.zip", zip({ "Index/Document.iwa": "binary" }), inflate)).rejects.toThrow("PAGES_EXPORT_NEEDED");
    await expect(documentToText("foto.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), inflate)).rejects.toThrow("DOCUMENT_UNSUPPORTED");
    await expect(documentToText("rotto.docx", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), inflate)).rejects.toThrow("DOCUMENT_UNREADABLE");
  });
  it("refuses entries that would inflate beyond the limit (zip bomb)", async () => {
    await expect(documentToText("bomba.docx", zip({ "word/document.xml": docxXml }, MAX_ENTRY_BYTES + 1), inflate)).rejects.toThrow("DOCUMENT_UNREADABLE");
    const bomb = zip({ "word/document.xml": "a".repeat(64) });
    await expect(documentToText("bomba.docx", bomb, (data, max) => inflate(data, Math.min(max, 8)))).rejects.toThrow();
  });
  it("turns only real Google Docs links into their plain-text export address", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(googleDocsExportUrl(`https://docs.google.com/document/d/${id}/edit?usp=sharing`)).toBe(`https://docs.google.com/document/d/${id}/export?format=txt`);
    expect(googleDocsExportUrl(`https://docs.google.com/document/u/0/d/${id}/`)).toBe(`https://docs.google.com/document/d/${id}/export?format=txt`);
    for (const link of [
      `http://docs.google.com/document/d/${id}/edit`,
      `https://docs.google.com.evil.example/document/d/${id}/edit`,
      `https://docs.google.com/spreadsheets/d/${id}/edit`,
      "https://docs.google.com/document/d/short/edit",
      "not a link",
    ])
      expect(googleDocsExportUrl(link)).toBeNull();
  });
});
