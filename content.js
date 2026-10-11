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
      || document.querySelector(".show-more-less-html__markup");
  }

  function readText(box) {
    return box.innerText.replace(/\n*(…\s*more|Show more|Show less)\s*$/i, "").trim().replace(/\n{3,}/g, "\n\n");
  }

  function foldDescription(box, job) {
    const view = box.previousElementSibling?.classList.contains("jfold-view") ? box.previousElementSibling : null;
    if (box.dataset.jfold === job.id && view) return;
    if (view) view.remove();
    box.style.display = "";
    const desc = readText(box);
    if (desc.length < 200) return; // not loaded yet
    if (box.dataset.jfold && box.dataset.jfold !== job.id && desc === box.dataset.jfoldText) return; // still the last job's text
    box.dataset.jfold = job.id;
    box.dataset.jfoldText = desc;

    const v = document.createElement("div");
    v.className = "jfold-view";
    const status = document.createElement("div");
    status.className = "jfold-status";
    status.textContent = "Folding…";
    v.append(seenNote(job), status);
    box.before(v);

    chrome.runtime.sendMessage({ type: "fold", id: job.id, text: desc }, (res) => {
      if (!v.isConnected || box.dataset.jfold !== job.id) return;
      if (!res || res.error) { status.textContent = `Could not fold: ${res ? res.error : chrome.runtime.lastError?.message}`; return; }
      const folds = spans(desc, res.sections);
      const body = document.createElement("div");
      body.className = "jfold-text";
      let pos = 0;
      const shown = (t) => t.replace(/\n{2,}/g, "\n");
      for (const [a, b] of folds) {
        body.append(shown(desc.slice(pos, a)));
        const d = document.createElement("details");
        const s = document.createElement("summary");
        s.textContent = `folded, ${desc.slice(a, b).split(/\s+/).length} words`;
        const inner = document.createElement("div");
        inner.textContent = shown(desc.slice(a, b)).trim();
        d.append(s, inner);
        body.append(d);
        pos = b;
      }
      body.append(shown(desc.slice(pos)));
      const share = Math.round((100 * folds.reduce((n, [a, b]) => n + b - a, 0)) / desc.length);
      status.textContent = `Folded ${share}% · `;
      const toggle = document.createElement("button");
      toggle.textContent = "show original";
      toggle.onclick = () => {
        const orig = box.style.display === "none";
        box.style.display = orig ? "" : "none";
        body.style.display = orig ? "none" : "";
        toggle.textContent = orig ? "show folded" : "show original";
      };
      status.append(toggle);
      v.append(body);
      box.style.display = "none";
      box.parentElement?.querySelector('[data-testid="expandable-text-button"]')?.style.setProperty("display", "none");
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

  // ---- loop --------------------------------------------------------------------------------------------------

  function tick() {
    if (!location.pathname.startsWith("/jobs")) return;
    const job = openJob();
    if (job && job.id !== current?.id) onOpen(job);
    const box = descriptionBox();
    if (box && job) foldDescription(box, job);
    paintLists();
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1500);
})();
