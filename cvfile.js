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

// The document's paragraphs, one per line, with a dash before list items, and each table row on one line with
// " | " between its cells.
async function readDocx(file) {
  let xml;
  try {
    xml = await unzipEntry(new Uint8Array(await file.arrayBuffer()), "word/document.xml");
  } catch {
    throw new Error(`${file.name} doesn't open as a Word file.`);
  }
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const kids = (el, name) => [...el.children].filter((c) => c.namespaceURI === W && (!name || c.localName === name));
  const para = (p) => {
    let line = "";
    const walk = (node) => {
      for (const el of kids(node)) {
        if (el.localName === "t") line += el.textContent;
        else if (el.localName === "tab") line += "\t";
        else if (el.localName === "br" || el.localName === "cr") line += "\n";
        else if (el.localName === "txbxContent") line += "\n" + blocks(el).join("\n") + "\n";
        else walk(el);
      }
    };
    walk(p);
    const pPr = kids(p, "pPr")[0];
    return pPr?.getElementsByTagNameNS(W, "numPr").length && line.trim() ? "- " + line : line;
  };
  // Paragraphs and tables in order. Anything else that holds them, such as a content control, is looked into.
  const blocks = (el) => kids(el).flatMap((c) => {
    if (c.localName === "p") return [para(c)];
    if (c.localName === "tbl") {
      return kids(c, "tr").map((tr) => kids(tr, "tc").map((tc) => blocks(tc).filter((l) => l.trim()).join(" ")).join(" | "));
    }
    if (c.localName === "sectPr") return [];
    return blocks(c);
  });
  const body = new DOMParser().parseFromString(xml, "application/xml").getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error(`${file.name} doesn't open as a Word file.`);
  return blocks(body).join("\n");
}

// One file out of a zip: find it in the central directory at the end, then inflate it with Chrome's own
// DecompressionStream. Zip64 and encrypted zips are not handled; Word writes neither for a CV.
async function unzipEntry(bytes, path) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    if (utf8.decode(bytes.subarray(at + 46, at + 46 + nameLen)) === path) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return utf8.decode(data);
      if (method !== 8) throw new Error("unknown zip method");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(stream).text();
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${path} in the zip`);
}
