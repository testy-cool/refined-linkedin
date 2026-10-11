// On LinkedIn job pages: fold the open job's description down to responsibilities and expectations, remember
// every job opened, and grey out jobs already seen in the lists. Where each hook comes from is written up in
// research/linkedin-descriptions/LINKEDIN-DOM.md.
(() => {
  const SEEN_AFTER_MS = 1000;

  // A line inside a fold that states a hard requirement stays visible. Luna folded "Minimum 3 years of
  // experience" on one of two identical ING postings, so this check runs after it.
  const LANGS = "English|German|French|Romanian|Spanish|Italian|Dutch|Polish|Portuguese";
  const KEEP = new RegExp([
    `fluen(t|cy) (in )?(${LANGS})`, `(${LANGS})[^.\\n]{0,30}\\b(fluen|proficien|[ABC][12]\\b|native)`, "native speaker",
    "\\d+\\+? years?( of| in|['’]|\\s)+(relevant |professional |hands-on )?experience",
    "years of (relevant |professional )?experience", "must[- ]have", "\\bdegree\\b", "bachelor", "master['’]?s\\b",
    "security clearance", "driving licen[cs]e",
  ].join("|"), "i");

  let seen = { ids: {}, keys: {} };
  let current = null; // {id, prior, timer}

  const norm = (s) => (s || "").toLowerCase().replace(/\(verified job\)|with verification/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const keyOf = (title, company) => (title && company ? `${norm(title)}|${norm(company)}` : null);
  const lookup = (id, key) => (id && seen.ids[id]) || (key && seen.keys[key] && seen.ids[seen.keys[key]]) || null;

  chrome.runtime.sendMessage({ type: "hello", build: self.BUILD });
  chrome.storage.local.get("seen").then((r) => { if (r.seen) seen = r.seen; tick(); });
  chrome.storage.onChanged.addListener((ch) => { if (ch.seen) { seen = ch.seen.newValue || seen; paintLists(); } });

  // ---- the open job ------------------------------------------------------------------------------------------

  function openJob() {
    let id = new URL(location.href).searchParams.get("currentJobId");
    const path = location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
    if (path) id = path[1];
    const about = document.querySelector('[componentkey^="JobDetails_AboutTheJob_"]');
    if (about) id = about.getAttribute("componentkey").split("_").pop();
    if (!id) return null;
    let title = text(document.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-search__job-details h1, .top-card-layout__title"));
    let company = text(document.querySelector(".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link"));
    if (!title || !company) {
      const parts = document.title.replace(/^\(\d+\)\s*/, "").split(" | ");
      if (parts.length >= 3) { title = parts.slice(0, -2).join(" | "); company = parts[parts.length - 2]; }
    }
    return { id, title, company };
  }

  function text(el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }

  // A job counts as seen once it has been open a moment and the person clicked or typed while it was open, or
  // opened it with that click. LinkedIn opens the first result of every search by itself; that alone is not
  // seeing it.
  let lastInput = 0;
  for (const type of ["pointerdown", "keydown"]) {
    addEventListener(type, () => { lastInput = Date.now(); setTimeout(maybeRecord, SEEN_AFTER_MS); }, true);
  }

  function onOpen(job) {
    current = { id: job.id, prior: lookup(job.id, keyOf(job.title, job.company)), sameId: !!seen.ids[job.id],
      openedAt: Date.now(), byPage: /^\/jobs\/view\//.test(location.pathname) };
    setTimeout(maybeRecord, SEEN_AFTER_MS);
  }

  function maybeRecord() {
    if (!current || current.recorded || Date.now() - current.openedAt < SEEN_AFTER_MS) return;
    if (!current.byPage && lastInput < current.openedAt - 2000) return;
    const now = openJob();
    if (!now || now.id !== current.id) return;
    current.recorded = true;
    const rec = seen.ids[now.id] || { first: Date.now() };
    seen.ids[now.id] = { ...rec, t: now.title || rec.t, c: now.company || rec.c, last: Date.now() };
    const key = keyOf(now.title, now.company);
    if (key) seen.keys[key] = seen.keys[key] || now.id;
    chrome.storage.local.set({ seen });
    paintLists();
  }

  // ---- folding -----------------------------------------------------------------------------------------------

  function descriptionBox() {
    return document.querySelector('[componentkey^="JobDetails_AboutTheJob_"] [data-testid="expandable-text-box"]')
      || document.querySelector("#job-details")
      || document.querySelector(".show-more-less-html__markup:not(.jfold-clone)");
  }

  // The description is folded in a copy of LinkedIn's own markup, line by line, so what stays visible keeps its
  // bullets, bold and spacing. A line is the text nodes and <br> between two line breaks.
  const BLOCK = /^(P|DIV|UL|OL|LI|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE|TABLE|TR|DL|DT|DD)$/;

  function readLines(root, pre) {
    if (pre) { // under white-space: pre*, a "\n" inside a text node breaks the line too, so give each its own node
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (tw.nextNode()) nodes.push(tw.currentNode);
      for (let n of nodes) {
        let i;
        while (n.data.length > 1 && (i = n.data.indexOf("\n")) !== -1) n = n.splitText(i || 1);
      }
    }
    const lines = [];
    let cur = { nodes: [], text: "" };
    const end = (hard) => {
      if (!hard && !cur.text.trim()) return; // a block edge with nothing before it adds no empty line
      lines.push(cur);
      cur = { nodes: [], text: "" };
    };
    const walk = (n) => {
      if (n.nodeType === 3) {
        cur.nodes.push(n);
        if (pre && n.data === "\n") end(true); else cur.text += n.data;
        return;
      }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|BUTTON)$/.test(n.tagName)) return;
      if (/^H[12]$/.test(n.tagName) && /^about the job$/i.test(n.textContent.trim())) return;
      if (n.tagName === "BR") { cur.nodes.push(n); end(true); return; }
      const block = BLOCK.test(n.tagName);
      if (block) end(false);
      for (const c of [...n.childNodes]) walk(c);
      if (block) end(false);
    };
    for (const c of [...root.childNodes]) walk(c);
    end(false);
    // The text Luna reads: one line per line, and one empty line wherever the description has any.
    let text = "", gap = "";
    for (const l of lines) {
      const t = l.text.replace(/\s+/g, " ").trim();
      if (!t) { l.s = l.e = -1; if (text) gap = "\n\n"; continue; }
      text += gap;
      l.s = text.length;
      text += t;
      l.e = text.length;
      gap = "\n";
    }
    return { lines, text };
  }

  const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

  // The first words of a folded run, so its chip says what it hides. A short heading such as "Benefits" is
  // joined to the start of the line after it: "Benefits: Private medical insurance…".
  function excerpt(lines, words = 8) {
    const [first, next] = lines.filter((l) => l.s >= 0).map((l) => l.text.replace(/\s+/g, " ").trim());
    let w = first.split(" ");
    if (next && w.length <= 4 && !/[.!]$/.test(first)) w = [...w.slice(0, -1), w[w.length - 1].replace(/([^:?])$/, "$1:"), ...next.split(" ")];
    return w.length > words ? `${w.slice(0, words).join(" ").replace(/[,:;]$/, "")}…` : w.join(" ");
  }

  // Hides the folded lines in the copy and puts a chip where each folded run starts. Returns the share folded.
  function foldLines(root, lines, folds) {
    const runs = [];
    let open = false, gaps = [];
    for (const l of lines) {
      if (l.s < 0) { if (open) gaps.push(l); continue; }
      let covered = 0;
      for (const [a, b] of folds) covered += Math.max(0, Math.min(b, l.e) - Math.max(a, l.s));
      if (covered * 2 < l.e - l.s) { open = false; gaps = []; continue; }
      if (!open) runs.push({ lines: [], chars: 0, words: 0, nodes: [] });
      const run = runs[runs.length - 1];
      if (open) run.lines.push(...gaps);
      run.lines.push(l);
      run.chars += l.e - l.s;
      run.words += l.text.trim().split(/\s+/).length;
      open = true;
      gaps = [];
    }
    const atoms = new Map(); // node -> run index, or -1 when it stays visible
    for (const l of lines) for (const n of l.nodes) atoms.set(n, -1);
    runs.forEach((r, i) => r.lines.forEach((l) => l.nodes.forEach((n) => atoms.set(n, i))));

    // Hide the largest element whose lines are all folded, so a folded list item loses its bullet too.
    const visit = (el) => {
      let n = 0, h = 0, run = -1;
      const kids = [];
      for (const c of [...el.childNodes]) {
        const r = c.nodeType === 1 && c.tagName !== "BR" ? visit(c)
          : atoms.has(c) ? { n: 1, h: atoms.get(c) >= 0 ? 1 : 0, run: atoms.get(c) } : { n: 0, h: 0, run: -1 };
        kids.push([c, r]);
        n += r.n;
        h += r.h;
        if (r.h) run = r.run;
      }
      if (n && h === n && el !== root) return { n, h, run };
      for (const [c, r] of kids) {
        if (!r.n || r.h !== r.n) continue;
        let node = c;
        if (c.nodeType === 3) { node = document.createElement("span"); c.before(node); node.append(c); }
        node.classList.add("jfold-hide");
        runs[r.run].nodes.push(node);
      }
      return { n, h, run };
    };
    visit(root);

    for (const r of runs) {
      if (!r.nodes.length) continue;
      const first = r.nodes[0];
      const chip = document.createElement(/^(UL|OL)$/.test(first.parentElement.tagName) ? "li" : "span");
      chip.className = "jfold-chip";
      chip.setAttribute("role", "button");
      chip.tabIndex = 0;
      r.start = excerpt(r.lines);
      const label = (opened) => { chip.textContent = opened ? `hide ${r.words} words` : `folded, ${r.words} words "${r.start}"`; };
      label(false);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const opened = chip.classList.toggle("jfold-opened");
        for (const x of r.nodes) { x.classList.toggle("jfold-hide", !opened); x.classList.toggle("jfold-shown", opened); }
        label(opened);
      });
      first.before(chip);
      // A list item holding nothing visible but the chip loses its bullet until the chip opens.
      const li = chip.parentElement.tagName === "LI" ? chip.parentElement : null;
      if (li && ![...li.childNodes].some((c) => c !== chip && visibleText(c))) {
        li.classList.add("jfold-nobullet");
        chip.addEventListener("click", () => li.classList.toggle("jfold-nobullet", !chip.classList.contains("jfold-opened")));
      }
    }
    const total = lines.reduce((s, l) => s + Math.max(0, l.e - l.s), 0);
    return total ? Math.round((100 * runs.reduce((s, r) => s + r.chars, 0)) / total) : 0;
  }

  // LinkedIn cuts the description off after a few lines behind a "… more" button, which also sits on top of
  // the last line of the folded view. It is pressed once per job, and hidden while the folded view shows.
  function moreButtons(box) {
    const area = box.closest('[componentkey^="JobDetails_AboutTheJob_"], .show-more-less-html') || box.parentElement;
    return area ? [...area.querySelectorAll('[data-testid="expandable-text-button"], .show-more-less-html__button--more')] : [];
  }

  function visibleText(n) {
    if (n.nodeType === 3) return !!n.data.trim();
    return n.nodeType === 1 && !n.classList.contains("jfold-hide") && [...n.childNodes].some(visibleText);
  }

  function foldDescription(box, job) {
    const view = box.previousElementSibling?.classList.contains("jfold-view") ? box.previousElementSibling : null;
    if (box.dataset.jfold === job.id && view) {
      // LinkedIn puts its "… more" button back when it measures the hidden original; keep it hidden.
      if (box.style.display === "none") for (const btn of moreButtons(box)) btn.style.setProperty("display", "none");
      return;
    }
    if (view) view.remove();
    box.style.display = "";
    for (const b of moreButtons(box)) {
      if (b.dataset.jfoldOpened === job.id || !/more/i.test(b.textContent)) continue;
      b.dataset.jfoldOpened = job.id;
      b.click();
    }
    const copy = box.cloneNode(true);
    const { lines, text: desc } = readLines(copy, /^pre/.test(getComputedStyle(box).whiteSpace));
    if (desc.length < 200) return; // not loaded yet
    if (box.dataset.jfold && box.dataset.jfold !== job.id && desc === box.dataset.jfoldText) return; // still the last job's text
    box.dataset.jfold = job.id;
    box.dataset.jfoldText = desc;

    const v = document.createElement("div");
    v.className = "jfold-view";
    const status = document.createElement("div");
    status.className = "jfold-status";
    let frame = 0;
    const spin = () => { status.textContent = `${SPINNER[frame++ % SPINNER.length]} Folding…`; };
    spin();
    const spinning = setInterval(() => (v.isConnected ? spin() : clearInterval(spinning)), 80);
    v.append(seenNote(job), status);
    box.before(v);

    chrome.runtime.sendMessage({ type: "fold", id: job.id, text: desc }, (res) => {
      clearInterval(spinning);
      if (!v.isConnected || box.dataset.jfold !== job.id) return;
      if (!res || res.error) { status.textContent = `Could not fold: ${res ? res.error : chrome.runtime.lastError?.message}`; return; }
      const share = foldLines(copy, lines, spans(desc, res.sections));
      copy.classList.add("jfold-clone");
      copy.removeAttribute("data-testid");
      for (const e of [copy, ...copy.querySelectorAll("[id]")]) e.removeAttribute("id");
      const more = moreButtons(box);
      status.textContent = `Folded ${share}% · `;
      const toggle = document.createElement("button");
      toggle.textContent = "show original";
      toggle.onclick = () => {
        const orig = box.style.display === "none";
        box.style.display = orig ? "" : "none";
        copy.style.display = orig ? "none" : "";
        for (const b of more) b.style.setProperty("display", orig ? "" : "none");
        toggle.textContent = orig ? "show folded" : "show original";
      };
      status.append(toggle);
      v.append(copy);
      box.style.display = "none";
      for (const b of more) b.style.setProperty("display", "none");
    });
  }

  function seenNote(job) {
    const el = document.createElement("div");
    el.className = "jfold-seen-note";
    const prior = current && current.id === job.id ? current.prior : null;
    if (prior) {
      const when = new Date(prior.last || prior.first).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      el.textContent = current.sameId ? `Seen before, ${when}` : `Seen before as another posting, ${when}`;
    }
    return el;
  }

  // Luna's regexes, each used only when it matches exactly once, then the requirement check, then folds that
  // touch or sit next to each other merged into one.
  function spans(desc, sections) {
    const raw = [];
    for (const s of sections || []) {
      let re;
      try { re = new RegExp(s.regex, "g"); } catch { continue; }
      const ms = [...desc.matchAll(re)];
      if (ms.length !== 1 || !ms[0][0]) continue;
      let start = ms[0].index;
      const end = start + ms[0][0].length;
      // A short opening such as "Team" can first occur above the passage Luna meant; start at its last occurrence.
      const head = (s.starts_with || "").trim();
      const again = head ? ms[0][0].lastIndexOf(head) : -1;
      if (again > 0) start += again;
      raw.push(...guard(desc, start, end));
    }
    raw.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [a, b] of raw) {
      const last = out[out.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else if (last && !desc.slice(last[1], a).trim()) last[1] = b;
      else out.push([a, b]);
    }
    return out;
  }

  function guard(desc, start, end) {
    const lines = desc.slice(start, end).match(/[^\n]*\n?/g).filter((l, i, all) => l || i < all.length - 1);
    const base = lines.map((l) => KEEP.test(l));
    const keep = [...base];
    const heading = (l) => { const s = l.trim(); return s.length > 0 && s.length <= 60 && !/[.!,]$/.test(s); };
    base.forEach((k, n) => {
      if (!k) return;
      let p = n - 1;
      while (p >= 0 && !lines[p].trim()) p--;
      if (p >= 0 && heading(lines[p])) keep[p] = true;
    });
    const out = [];
    let pos = start, run = null;
    lines.forEach((l, n) => {
      if (keep[n]) { if (run !== null) { out.push([run, pos]); run = null; } } else if (run === null) run = pos;
      pos += l.length;
    });
    if (run !== null) out.push([run, pos]);
    return out.map(([a, b]) => {
      const piece = desc.slice(a, b);
      return [a + piece.length - piece.trimStart().length, b - (piece.length - piece.trimEnd().length)];
    }).filter(([a, b]) => b > a);
  }

  // ---- the lists ---------------------------------------------------------------------------------------------

  function leaves(root) {
    return [...root.querySelectorAll("span, p, strong")].filter((e) => !e.children.length && e.textContent.trim())
      .map((e) => e.textContent.trim());
  }

  function mark(el, isSeen) { el.classList.toggle("jfold-seen", !!isSeen); }

  function paintLists() {
    // classic search and collections
    for (const li of document.querySelectorAll("li[data-occludable-job-id]")) {
      const t = text(li.querySelector(".job-card-list__title--link strong")) || li.querySelector(".job-card-list__title--link")?.getAttribute("aria-label");
      const c = text(li.querySelector(".artdeco-entity-lockup__subtitle"));
      mark(li, lookup(li.getAttribute("data-occludable-job-id"), keyOf(t, c)));
    }
    // new search-results page
    for (const card of document.querySelectorAll('[role="button"][componentkey^="job-card-component-ref-"]')) {
      const l = leaves(card);
      mark(card, lookup(card.getAttribute("componentkey").split("-").pop(), keyOf(l[0], text(card.querySelector("p")))));
    }
    // "More jobs" under a job: no id, only title and employer
    for (const a of document.querySelectorAll('[componentkey^="JobDetailsSimilarJobsSlot_"] a[href]')) {
      const l = leaves(a);
      if (l.length >= 2) mark(a, lookup(null, keyOf(l[0], l[1])));
    }
  }

  // ---- posting age -------------------------------------------------------------------------------------------

  // "2 weeks ago" next to a job turns from green (a day old) through yellow (two weeks) and orange (a month) to
  // red (two months or more). LinkedIn writes it as a span holding only that text, on every layout.
  const AGE = /^(?:(?:re)?posted )?(\d+|an?|one) (minute|hour|day|week|month|year)s? ago$/i;
  const DAYS = { minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
  const HUES = [[1, 120], [14, 50], [30, 28], [60, 0]]; // [days old, hue]

  function ageHue(days) {
    if (days <= HUES[0][0]) return HUES[0][1];
    for (let i = 1; i < HUES.length; i++) {
      const [d0, h0] = HUES[i - 1], [d1, h1] = HUES[i];
      if (days <= d1) return h0 + ((h1 - h0) * (days - d0)) / (d1 - d0);
    }
    return HUES[HUES.length - 1][1];
  }

  function paintAges() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode.data;
      if (t.length > 40 || !t.includes("ago")) continue;
      const m = t.trim().match(AGE);
      const el = tw.currentNode.parentElement;
      if (!m || !el || el.dataset.jfoldAge === t || el.closest(".jfold-view, [data-jfold]")) continue;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
      const hue = Math.round(ageHue(n * DAYS[m[2].toLowerCase()]));
      el.style.setProperty("color", `hsl(${hue} 90% 32%)`, "important");
      el.style.setProperty("font-weight", "600");
      el.dataset.jfoldAge = t;
    }
  }

  // ---- loop --------------------------------------------------------------------------------------------------

  function tick() {
    if (!location.pathname.startsWith("/jobs")) return;
    const job = openJob();
    if (job && job.id !== current?.id) onOpen(job);
    const box = descriptionBox();
    if (box && job) foldDescription(box, job);
    paintLists();
    paintAges();
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1500);
})();
