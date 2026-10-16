// Reads the text of a CV file for About you (issue #59), in this page, so the file itself never leaves the browser.
// PDF goes through Mozilla's pdf.js, shipped in vendor/pdfjs. DOCX is a zip holding the document as XML, which
// Chrome can unpack by itself. Plain text and Markdown are read as they are.
// readCV(file) resolves to { text, pages } or throws an Error whose message is meant for the user.
async function readCV(file) {
  const name = file.name.toLowerCase();
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is over 20 MB. A CV is usually far smaller.`);
  let out;
  if (name.endsWith(".pdf") || file.type === "application/pdf") out = await readPdf(file);
  else if (name.endsWith(".docx")) out = { text: await readDocx(file) };
  else if (/\.(txt|md|markdown|text)$/.test(name) || file.type.startsWith("text/")) out = { text: await file.text() };
  else if (name.endsWith(".doc")) throw new Error("Old Word files (.doc) can't be read here. Save it as .docx or PDF in Word first.");
  else throw new Error(`Can't read ${file.name}. Use a PDF, a Word file (.docx) or a text file.`);
  out.text = tidy(out.text);
  if (!out.text) {
    throw new Error(out.pages
      ? `${file.name} has no text in it, so it is probably a scanned image. Paste the text instead.`
      : `${file.name} has no text in it.`);
  }
  return out;
}

// Spaces at line ends and runs of blank lines are layout, not content.
function tidy(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function readPdf(file) {
  const pdfjs = await import(chrome.runtime.getURL("vendor/pdfjs/pdf.min.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");
  // The character maps let pdf.js read text in PDFs that use the standard Chinese, Japanese and Korean encodings.
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: chrome.runtime.getURL("vendor/pdfjs/cmaps/"),
    cMapPacked: true,
  });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (e) {
      if (e?.name === "PasswordException") throw new Error(`${file.name} is locked with a password. Save a copy without one.`);
      throw new Error(`${file.name} doesn't open as a PDF.`);
    }
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      pages.push(items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : "")).join(""));
    }
    return { text: pages.join("\n\n"), pages: doc.numPages };
  } finally {
    task.destroy();
  }
}

// The text of the headers, the body and the footers, in that order. Paragraphs come one per line, list items with
// a dash, and each table row on one line with " | " between its cells. Text boxes are read where they sit.
async function readDocx(file) {
  try {
    const zip = openZip(new Uint8Array(await file.arrayBuffer()));
    const parts = (kind) => [...zip.keys()].filter((n) => new RegExp(`^word/${kind}\\d*\\.xml$`).test(n)).sort();
    const texts = [];
    for (const name of [...parts("header"), "word/document.xml", ...parts("footer")]) {
      if (!zip.has(name)) throw new Error(`no ${name}`);
      const text = docxText(xmlText(await readEntry(zip.get(name))));
      if (text.trim() && !texts.includes(text)) texts.push(text); // sections often repeat one header
    }
    return texts.join("\n\n");
  } catch (e) {
    if (e.forUser) throw new Error(`${file.name} ${e.message}`);
    throw new Error(`${file.name} doesn't open as a Word file.`);
  }
}

// Word's usual namespace and the one its Strict Open XML format uses.
const DOCX_NS = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

function docxText(xml) {
  const isW = (el, name) => DOCX_NS.has(el.namespaceURI) && el.localName === name;
  // Word writes a modern drawing and an older copy of the same text box side by side. Read only the first branch
  // that holds Word text, so the text comes once, and a branch only another program understands is passed over.
  const hasText = (el) => [...el.getElementsByTagName("*")].some((d) => isW(d, "t"));
  const choice = (alt) => {
    const branches = [...alt.children].filter((c) => c.namespaceURI === MC_NS && (c.localName === "Choice" || c.localName === "Fallback"));
    return branches.find(hasText) || null;
  };
  const isAlt = (el) => el.namespaceURI === MC_NS && el.localName === "AlternateContent";
  const hidden = (run) => isW(run, "r") && [...run.children].some((rPr) => isW(rPr, "rPr")
    && [...rPr.children].some((x) => isW(x, "vanish") && !["0", "false", "off"].includes(x.getAttributeNS(x.namespaceURI, "val"))));
  const para = (p) => {
    let line = "";
    const walk = (node) => {
      for (const el of node.children) {
        if (isW(el, "t")) line += el.textContent;
        else if (isW(el, "tab")) line += "\t";
        else if (isW(el, "br") || isW(el, "cr")) line += "\n";
        else if (isW(el, "txbxContent")) line += "\n" + blocks(el).join("\n") + "\n";
        else if (isAlt(el)) { const c = choice(el); if (c) walk(c); }
        else if (isW(el, "moveFrom") || isW(el, "del") || hidden(el)) continue; // the old place of moved text, and text Word hides
        else walk(el);
      }
    };
    walk(p);
    const pPr = [...p.children].find((el) => isW(el, "pPr"));
    const listed = pPr && [...pPr.getElementsByTagName("*")].some((el) => isW(el, "numPr"));
    return listed && line.trim() ? "- " + line : line;
  };
  // Paragraphs and tables in order. Anything else that may hold them, such as a content control, is looked into.
  const blocks = (el) => [...el.children].flatMap((c) => {
    if (isW(c, "p")) return [para(c)];
    if (isW(c, "tbl")) {
      return [...c.children].filter((tr) => isW(tr, "tr")).map((tr) => [...tr.children].filter((tc) => isW(tc, "tc"))
        .map((tc) => blocks(tc).filter((l) => l.trim()).join(" ")).join(" | "));
    }
    if (isW(c, "sectPr") || isW(c, "moveFrom") || isW(c, "del")) return [];
    if (isAlt(c)) { const ch = choice(c); return ch ? blocks(ch) : []; }
    return blocks(c);
  });
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
  if (root.localName === "parsererror" || root.getElementsByTagName("parsererror").length) throw new Error("bad XML");
  return blocks(root).join("\n");
}

// XML in a .docx is UTF-8 almost always, and UTF-16 when it starts with that byte order mark.
function xmlText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder().decode(bytes);
}

// The files in a zip, by name, from its central directory at the end, with the larger ZIP64 fields some writers
// use even for small files. Encrypted zips are not handled; Word never encrypts a .docx this way.
function openZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u64 = (at) => v.getUint32(at, true) + v.getUint32(at + 4, true) * 2 ** 32;
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    // The end record's own comment length must reach the file's end, or this is a look-alike inside a comment.
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip");
  let count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  if ((count === 0xffff || at === 0xffffffff) && end >= 20 && v.getUint32(end - 20, true) === 0x07064b50) {
    const end64 = u64(end - 12);
    if (v.getUint32(end64, true) !== 0x06064b50) throw new Error("bad ZIP64 end");
    count = u64(end64 + 32);
    at = u64(end64 + 48);
  }
  const utf8 = new TextDecoder(), files = new Map();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = v.getUint16(at + 10, true);
    let size = v.getUint32(at + 20, true), local = v.getUint32(at + 42, true);
    const raw = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true);
    // ZIP64: the fields set to 0xffffffff are in extra field 1, in the order uncompressed, compressed, offset.
    for (let e = at + 46 + nameLen; e + 4 <= at + 46 + nameLen + extraLen;) {
      const id = v.getUint16(e, true), len = v.getUint16(e + 2, true);
      if (id === 1) {
        let f = e + 4;
        if (raw === 0xffffffff) f += 8;
        if (size === 0xffffffff) { size = u64(f); f += 8; }
        if (local === 0xffffffff) local = u64(f);
      }
      e += 4 + len;
    }
    files.set(utf8.decode(bytes.subarray(at + 46, at + 46 + nameLen)), { bytes, v, method, size, local });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// One file's bytes, inflated with Chrome's own DecompressionStream. A CV's text is far under 30 MB, so a part that
// grows past that is refused before it can fill the memory.
async function readEntry({ bytes, v, method, size, local }) {
  if (v.getUint32(local, true) !== 0x04034b50) throw new Error("bad local header");
  const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + size);
  if (method === 0) return data;
  if (method !== 8) throw new Error("unknown zip method");
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 30 * 1024 * 1024) {
      reader.cancel();
      throw Object.assign(new Error("holds far more text than a CV. Save it as PDF and load that instead."), { forUser: true });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
