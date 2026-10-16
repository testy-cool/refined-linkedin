// On LinkedIn job pages: fold the open job's description down to responsibilities and expectations, remember
// every job opened, and grey out jobs already seen in the lists. Where each hook comes from is written up in
// research/linkedin-descriptions/LINKEDIN-DOM.md.
(() => {
  const SEEN_AFTER_MS = 1000;

  let seen = { ids: {}, keys: {} };
  // When each job was posted, worked out from "3 weeks ago" while LinkedIn still shows it: on some lists a card
  // marked "Viewed" loses its age.
  let posted = {};
  let postedDirty = false;
  let current = null; // {id, prior, timer}
  let again = null; // the job whose description is being folded again, asking the model anew
  self.RL = { openJob, descriptionBox, textColumn }; // for notes.js and keywords.js

  const norm = (s) => (s || "").toLowerCase().replace(/\(verified job\)|with verification/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const keyOf = (title, company) => (title && company ? `${norm(title)}|${norm(company)}` : null);
  const lookup = (id, key) => (id && seen.ids[id]) || (key && seen.keys[key] && seen.ids[seen.keys[key]]) || null;

  chrome.runtime.sendMessage({ type: "hello", build: self.BUILD });
  chrome.storage.local.get("seen").then((r) => {
    if (r.seen) seen = r.seen;
    // Builds before v2 could file a job under the previous job's title, so their repost keys are dropped.
    if (seen.v !== 2) {
      seen = { v: 2, keys: {}, ids: Object.fromEntries(Object.entries(seen.ids).map(([k, r]) => [k, { first: r.first, last: r.last }])) };
      chrome.storage.local.set({ seen });
    }
    tick();
  });
  chrome.storage.local.get("posted").then((r) => { posted = { ...r.posted, ...posted }; });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.seen) { seen = ch.seen.newValue || seen; paintLists(); }
  });
  self.RLDetails?.onChange(() => paintLists());
  // The switches and lists under "Grey out" in the pop-up, see filters.js.
  self.RLFilters?.onChange(() => paintLists());
  setInterval(() => { if (postedDirty) { postedDirty = false; chrome.storage.local.set({ posted }); } }, 3000);

  function notePosted(id, ageText) {
    const days = ageDays(ageText);
    if (!id || days === null || posted[id]) return;
    posted[id] = Date.now() - days * 864e5;
    postedDirty = true;
  }

  // ---- the open job ------------------------------------------------------------------------------------------

  function openJob() {
    let id = new URL(location.href).searchParams.get("currentJobId");
    const path = location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
    if (path) id = path[1];
    const about = document.querySelector('[componentkey^="JobDetails_AboutTheJob_"]');
    if (about) id = about.getAttribute("componentkey").split("_").pop();
    if (!id) return null;
    // Title and employer come from the job's own card in the list. The tab title and the detail pane still show
    // the previous job for a moment after a click, so they are only used on the job's own page.
    const card = document.querySelector(`li[data-occludable-job-id="${id}"], [role="button"][componentkey="job-card-component-ref-${id}"]`);
    let [title, company] = card ? cardNames(card) : [];
    if ((!title || !company) && path && path[1] === id) {
      const parts = document.title.replace(/^\(\d+\)\s*/, "").split(" | ");
      if (parts.length >= 3) { title = parts.slice(0, -2).join(" | "); company = parts[parts.length - 2]; }
    }
    return { id, title, company };
  }

  function cardNames(card) {
    if (card.matches("li")) {
      return [text(card.querySelector(".job-card-list__title--link strong")) || card.querySelector(".job-card-list__title--link")?.getAttribute("aria-label"),
        text(card.querySelector(".artdeco-entity-lockup__subtitle"))];
    }
    // Title, then employer, then place. The new search page writes the title twice, once for screen readers ("Product
    // Owner (Verified job)") and once on screen ("Product Owner"), so a second line with the same title is skipped.
    const l = leaves(card);
    if (l.length > 2 && norm(l[1]) === norm(l[0])) l.splice(1, 1);
    return [l[0], l[1]];
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
    current = { id: job.id, prior: seen.ids[job.id] || null, openedAt: Date.now(), byPage: /^\/jobs\/view\//.test(location.pathname) };
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
      // The button goes before the run's first words. visit() collects nodes inner elements first, so that is found
      // by document order, skipping the blank space LinkedIn leaves before a heading the run does not include.
      const worded = r.nodes.filter((n) => n.textContent.trim());
      const first = (worded.length ? worded : r.nodes).reduce((a, b) => (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a));
      const chip = document.createElement(/^(UL|OL)$/.test(first.parentElement.tagName) ? "li" : "span");
      chip.className = "jfold-chip";
      chip.setAttribute("role", "button");
      chip.setAttribute("aria-expanded", "false");
      chip.tabIndex = 0;
      r.start = excerpt(r.lines);
      chip.dataset.folded = r.lines.map((l) => l.text).join("\n"); // keywords.js names the words it hides
      const label = (opened) => { chip.textContent = opened ? `hide ${r.words} words` : `folded, ${r.words} words "${r.start}"`; };
      label(false);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const opened = chip.classList.toggle("jfold-opened");
        chip.setAttribute("aria-expanded", String(opened));
        for (const x of r.nodes) { x.classList.toggle("jfold-hide", !opened); x.classList.toggle("jfold-shown", opened); }
        label(opened);
      });
      // Enter and Space open and close it like a real button (WAI-ARIA disclosure pattern).
      chip.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) chip.click();
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
    // The text the model reads is kept for the download, so the folds it names can be found in it again.
    self.RLDetails?.keepPage(job.id, desc);

    const v = document.createElement("div");
    v.className = "jfold-view";
    const status = document.createElement("div");
    status.className = "jfold-status";
    let frame = 0;
    const glyph = document.createElement("span");
    glyph.className = "jfold-spinner";
    status.replaceChildren(glyph, again === job.id ? "Folding parts of the description again…" : "Folding parts of the description…");
    const spin = () => { glyph.textContent = SPINNER[frame++ % SPINNER.length]; };
    spin();
    const spinning = setInterval(() => (v.isConnected ? spin() : clearInterval(spinning)), 80);
    status.classList.add("jfold-folding");
    v.append(seenNote(job), status);
    box.before(v);

    // Folding again drops this view and builds a new one, asking the model instead of using its saved answer.
    const refold = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => {
        again = job.id;
        v.remove();
        box.style.display = "";
        for (const m of moreButtons(box)) m.style.removeProperty("display");
        delete box.dataset.jfold;
        foldDescription(box, job);
      };
      return b;
    };
    chrome.runtime.sendMessage({ type: "fold", id: job.id, text: desc, again: again === job.id }, (res) => {
      if (again === job.id) again = null;
      clearInterval(spinning);
      status.classList.remove("jfold-folding");
      if (!v.isConnected || box.dataset.jfold !== job.id) return;
      if (["NO_CONSENT", "NO_KEY", "NO_ACCESS", "NO_SIGNIN"].includes(res?.error)) {
        status.textContent = {
          NO_CONSENT: "Not folded: allow sending job descriptions to an AI service in ",
          NO_KEY: "Not folded: choose a model provider and API key in ",
          NO_ACCESS: "Not folded: allow calls to the model's address by saving it once in ",
          NO_SIGNIN: "Not folded: sign in with ChatGPT in ",
        }[res.error];
        const open = document.createElement("button");
        open.textContent = "Refined LinkedIn settings";
        open.onclick = () => chrome.runtime.sendMessage({ type: "options" });
        status.append(open);
        return;
      }
      if (!res || res.error) {
        status.textContent = `Could not fold: ${res ? res.error : chrome.runtime.lastError?.message} · `;
        status.append(refold("try again"));
        return;
      }
      const share = foldLines(copy, lines, Folds.spans(desc, res.sections));
      const parts = copy.querySelectorAll(".jfold-chip").length;
      copy.classList.add("jfold-clone");
      copy.removeAttribute("data-testid");
      for (const e of [copy, ...copy.querySelectorAll("[id]")]) e.removeAttribute("id");
      const more = moreButtons(box);
      if (!parts) {
        status.textContent = "Nothing to fold in this description · ";
        status.append(refold("fold again"));
        return;
      }
      status.textContent = `Folded ${parts} part${parts === 1 ? "" : "s"}, ${share}% of the description · `;
      // Opens every fold in place, or closes them all again. LinkedIn's original stays hidden, so nothing shows twice.
      const toggle = document.createElement("button");
      toggle.textContent = "show full description";
      let full = false;
      toggle.onclick = () => {
        full = !full;
        for (const c of copy.querySelectorAll(".jfold-chip")) if (c.classList.contains("jfold-opened") !== full) c.click();
        toggle.textContent = full ? "show folded" : "show full description";
      };
      status.append(toggle, " · ", refold("fold again"));
      v.append(copy);
      box.style.display = "none";
      for (const b of more) b.style.setProperty("display", "none");
    });
  }

  function seenNote(job) {
    const el = document.createElement("div");
    el.className = "jfold-seen-note";
    const prior = current && current.id === job.id ? current.prior : null;
    const now = openJob(), key = now && now.id === job.id ? keyOf(now.title, now.company) : null;
    const other = key && seen.keys[key] && seen.keys[key] !== job.id ? seen.ids[seen.keys[key]] : null;
    if (prior) el.textContent = `👁 You viewed this job ${ago(prior.last || prior.first)}`;
    else if (other) el.textContent = `👁 You viewed this job ${ago(other.last || other.first)}, in another listing with the same title and employer`;
    return el;
  }

  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 1) return "just now";
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    if (d === 1) return "yesterday";
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
    return `${Math.floor(d / 30)} months ago`;
  }

  // Luna's regexes, each used only when it matches exactly once, then the requirement check, then folds that
  // touch or sit next to each other merged into one.
  // ---- the lists ---------------------------------------------------------------------------------------------

  function leaves(root) {
    return [...root.querySelectorAll("span, p, strong")].filter((e) => !e.children.length && e.textContent.trim())
      .map((e) => e.textContent.trim());
  }

  // A seen card turns grey, posting age included, followed by when it was viewed: "3 weeks ago 👁 1 min ago". A card
  // LinkedIn labels "Viewed" counts as seen too; its label gives way to the same badge, which says "👁 viewed" when
  // the extension never saw the job opened. Where LinkedIn dropped the age for "Viewed", the remembered one stands in
  // its place.
  function mark(el, rec, id, openId) {
    // LinkedIn's own labels, leaving out the lines this extension adds, such as a highlight word "Applied".
    const labels = [...el.querySelectorAll("p, li, span")].filter((e) => !e.children.length && !e.closest(".jfold-slot, .rl-ui"));
    const labelled = (re) => labels.find((e) => re.test(e.textContent.trim()));
    const viewed = labelled(/^Viewed$/);
    el.classList.toggle("jfold-seen", !!(rec || viewed));
    const ages = [...el.querySelectorAll("[data-jfold-age]")].filter((a) => !a.closest(".jfold-slot"));
    const age = ages[ages.length - 1];
    if (age) notePosted(id, age.dataset.jfoldAge);
    const known = !age && id && posted[id] && (rec || viewed) ? posted[id] : null;
    // A job relisted days after it was first posted says when that was, in that date's colour. LinkedIn's own age
    // beside it goes plain grey, so its colour neither calls the repost fresh nor contradicts its own words.
    if (id) self.RLDetails?.want(id, false, !!self.RLFilters?.counts);
    const d = id ? self.RLDetails?.get(id) : null;
    const first = d && d.l - d.o >= REPOST_MS ? d.o : null;
    // A job the pop-up's "Grey out" switches and lists catch greys out like a seen one, without the 👁, and says why
    // where the card does not already. A job that isn't remote counts once LinkedIn's data for it has arrived.
    const [title, company] = cardNames(el);
    const why = self.RLFilters?.reasons({ title, company, d, repost: !!first,
      remote: d?.wt ? d.wt.includes(REMOTE) || saysRemote(el) : undefined,
      promoted: !!labelled(/^Promoted$/), applied: !!labelled(/^Applied( .* ago)?$/) }) || [];
    el.classList.toggle("jfold-off", why.length > 0);
    // With "Hide them instead" ticked, those jobs leave the list, as do jobs dismissed with LinkedIn's ×. The open
    // job stays, and so does a seen job, grey.
    const dismissed = !!labelled(self.RLDismiss.DISMISSED);
    const gone = !!self.RLFilters?.hide && (why.length > 0 || dismissed) && (!id || id !== openId) && !rec && !viewed;
    for (const e of listItem(el)) e.classList.toggle("rl-gone", gone);
    if (age) age.toggleAttribute("data-jfold-repost", !!first);
    const parts = [];
    if (known) parts.push(["jfold-age", postedLabel(known)]);
    if (first) parts.push(["jfold-first", `first posted ${postedLabel(first)}`]);
    if (rec || viewed) parts.push(["jfold-eye", rec ? `👁 ${shortAgo(rec.last || rec.first)}` : "👁 viewed"]);
    const noteCount = self.RLNotes?.count(id) || 0;
    if (noteCount) parts.push(["rl-card-notes", String(noteCount)]);
    const said = self.RLFilters?.label(why);
    if (said) parts.push(["rl-why", said]);
    // A promoted card on the classic list shows "Promoted" where the age would be; the slot goes in front of it. A
    // classic card scrolled far off is an empty <li> until LinkedIn draws it, so it gets no slot until then.
    const promoted = !age && !viewed ? [...el.querySelectorAll("p, li, span")].find((e) => !e.children.length && e.textContent.trim() === "Promoted") : null;
    const lockup = el.querySelector(".artdeco-entity-lockup__content");
    const drawn = !el.matches("li") || !!lockup;
    const place = age ? "after" : viewed ? "viewed" : promoted ? "promoted" : "line";
    const sig = JSON.stringify([place, parts]);
    // A slot on a line of its own goes in the card's text column, which a half-drawn card does not show yet. It moves
    // there once the card is drawn.
    const col = place !== "line" ? null : el.matches("li") ? lockup : textColumn(el);
    let slot = el.querySelector(".jfold-slot");
    if (slot?.dataset.sig === sig && (place !== "line" || slot.parentElement === col)) return;
    slot?.remove();
    const viewedClass = viewed ? viewed.className.replace(/\bjfold-hide\b/, "").trim() : "";
    const sep = viewed?.nextElementSibling?.textContent.trim() === "·" ? viewed.nextElementSibling : null;
    viewed?.classList.add("jfold-hide");
    // The dot after "Viewed" stays only when the slot stands where "Viewed" was.
    sep?.classList.toggle("jfold-hide", !parts.length || !!age);
    if (!parts.length || !drawn || (place === "line" && !col)) return;
    const like = viewed || promoted;
    slot = document.createElement(age ? "span" : like ? like.tagName : "span");
    if (!age && like) slot.className = viewed ? viewedClass : promoted.className;
    slot.classList.add("jfold-slot", age ? "jfold-slot-after" : viewed ? "jfold-slot-instead" : promoted ? "jfold-slot-before" : "jfold-slot-line");
    slot.dataset.sig = sig;
    for (const [cls, text] of parts) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      if (cls === "jfold-first") span.style.setProperty("--jfold-age-color", ageColor((Date.now() - first) / 864e5));
      if (cls === "rl-card-notes") {
        span.prepend(noteIcon());
        self.RLNotes.hover(span, id);
      }
      slot.append(span);
    }
    if (age) age.after(slot);
    else if (viewed) viewed.after(slot);
    else if (promoted) promoted.before(slot);
    else {
      // On its own line, the slot goes above the words the card mentions, where a card's age line would be.
      const words = col.querySelector(":scope > .rl-card-words");
      if (words) words.before(slot);
      else col.append(slot);
    }
  }

  // What leaves the list with a hidden card. On the new search page that is the wrappers around the card, up to the
  // list, and the line LinkedIn draws under it.
  function listItem(el) {
    if (el.matches("li") || !el.matches('[componentkey^="job-card-component-ref-"]')) return [el];
    let e = el;
    while (e.parentElement && e.parentElement.children.length === 1) e = e.parentElement;
    return e.nextElementSibling?.matches("hr") ? [e, e.nextElementSibling] : [e];
  }

  // The new search page's card is a row: logo, text, buttons. A line added to the card itself, such as the slot on a
  // card that shows "Applied" where its age would be, becomes another column and squeezes the text to a few letters
  // a line. The text column is the smallest element holding the card's first and last lines of text, leaving out the
  // buttons' hidden labels and the lines this extension added. A card drawn no further than its title has none yet.
  function textColumn(card) {
    const lines = [...card.querySelectorAll("span, p, strong")]
      .filter((e) => !e.children.length && e.textContent.trim() && !e.closest("button, .rl-ui, .jfold-slot"));
    if (lines.length < 2) return null;
    let col = lines[0];
    while (col && !col.contains(lines[lines.length - 1])) col = col.parentElement;
    return col && col !== card && card.contains(col) ? col : null;
  }

  // A speech bubble with lines, drawn in the text colour.
  function noteIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true", fill: "none",
      stroke: "currentColor", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round", class: "rl-icon" })) svg.setAttribute(k, v);
    for (const d of ["M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z", "M5 6h6M5 8h4"]) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function postedLabel(t) {
    const d = (Date.now() - t) / 864e5;
    if (d < 1) { const h = Math.max(1, Math.floor(d * 24)); return `${h} hour${h === 1 ? "" : "s"} ago`; }
    const [unit, size] = d < 7 ? ["day", 1] : d < 30 ? ["week", 7] : d < 365 ? ["month", 30] : ["year", 365];
    const n = Math.floor(d / size);
    return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }

  function shortAgo(t) {
    const m = Math.floor((Date.now() - t) / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 1) return "now";
    if (m < 60) return `${m} min ago`;
    if (h < 24) return `${h} h ago`;
    if (d < 14) return `${d} d ago`;
    if (d < 60) return `${Math.floor(d / 7)} wk ago`;
    return `${Math.floor(d / 30)} mo ago`;
  }

  function paintLists() {
    const openId = openJob()?.id;
    const cards = []; // for "Dismiss the grey jobs" above the list, see dismiss.js
    // classic search and collections
    for (const li of document.querySelectorAll("li[data-occludable-job-id]")) {
      const id = li.getAttribute("data-occludable-job-id");
      mark(li, lookup(id, keyOf(...cardNames(li))), id, openId);
      cards.push({ el: li, id, item: li, open: id === openId });
    }
    // new search-results page
    for (const card of document.querySelectorAll('[role="button"][componentkey^="job-card-component-ref-"]')) {
      const id = card.getAttribute("componentkey").split("-").pop();
      mark(card, lookup(id, keyOf(...cardNames(card))), id, openId);
      cards.push({ el: card, id, item: listItem(card)[0], open: id === openId });
    }
    self.RLDismiss?.tick(cards);
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

  // The hue at 32% lightness, darkened until it reads at 4.5:1 or more on white (WCAG 1.4.3), so a fresh green age
  // is as easy to read as an old red one.
  const ageColor = (days) => {
    const h = Math.round(ageHue(days));
    let l = 32;
    while (l > 20 && onWhite(h, l) < 4.6) l--;
    return `hsl(${h} 90% ${l}%)`;
  };

  // The contrast of hsl(h 90% l%) against white.
  function onWhite(h, l) {
    const L = l / 100, a = 0.9 * Math.min(L, 1 - L);
    const f = (n) => { const k = (n + h / 30) % 12; return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 1.05 / (0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4)) + 0.05);
  }
  const REPOST_MS = 2 * 864e5; // relisted this long after the first posting counts as a repost
  const REMOTE = 2; // LinkedIn's workplace type for a remote job
  const WORKPLACE = /\((Remote|Hybrid|On-site)\)/; // as on a card's location line, "London (Hybrid)"

  // Whether LinkedIn's card calls the job remote, as in "London (Remote)". The data of some such jobs names no
  // workplace type at all, so the card's own word counts too. The last line naming a workplace type is the label, so a
  // title such as "Support (Remote)" gives way to "London (On-site)" under it. A line is the innermost element that
  // names one, so an icon inside it, even one with a text title, does not hide it.
  function saysRemote(card) {
    const lines = [...card.querySelectorAll("span, p, li, div")].filter((e) => WORKPLACE.test(e.textContent)
      && ![...e.children].some((c) => WORKPLACE.test(c.textContent)) && !e.closest(".rl-ui, .jfold-slot, .rl-card-words"));
    return /\(Remote\)/.test(lines[lines.length - 1]?.textContent || "");
  }

  function ageDays(text) {
    const m = (text || "").trim().match(AGE);
    return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : 1) * DAYS[m[2].toLowerCase()] : null;
  }

  // The open job's own age, from its header: the first age on the page outside the job lists, once the header
  // shows this job.
  function notePostedFromHeader(job) {
    if (!job || posted[job.id]) return;
    const about = document.querySelector('[componentkey^="JobDetails_AboutTheJob_"]');
    const oldHeader = document.querySelector(".job-details-jobs-unified-top-card__job-title a");
    const isThisJob = about ? about.getAttribute("componentkey").endsWith(`_${job.id}`)
      : oldHeader ? oldHeader.href.includes(job.id) : location.pathname.includes(job.id);
    if (!isThisJob) return;
    const age = [...document.querySelectorAll("[data-jfold-age]")].find((a) => !a.closest(
      'li[data-occludable-job-id], [componentkey^="job-card-component-ref-"], [componentkey^="JobDetailsSimilarJobsSlot_"], .jfold-slot'));
    if (age) notePosted(job.id, age.dataset.jfoldAge);
  }

  function paintAges() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode.data;
      if (t.length > 40 || !t.includes("ago")) continue;
      const m = t.trim().match(AGE);
      const el = tw.currentNode.parentElement;
      if (!m || !el || el.dataset.jfoldAge === t || el.closest(".jfold-view, [data-jfold], .jfold-slot")) continue;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
      el.style.setProperty("--jfold-age-color", ageColor(n * DAYS[m[2].toLowerCase()])); // content.css applies it, grey on seen cards
      el.style.setProperty("font-weight", "600");
      el.dataset.jfoldAge = t;
    }
  }

  // ---- loop --------------------------------------------------------------------------------------------------

  function tick() {
    if (!location.pathname.startsWith("/jobs")) return;
    const job = openJob();
    if (job && job.id !== current?.id) onOpen(job);
    // The open job's own data, place and description included, is kept like a listed one's, also when it was
    // opened from a link with no card on the page.
    if (job) self.RLDetails?.want(job.id, true);
    const box = descriptionBox();
    if (box && job) foldDescription(box, job);
    paintAges();
    notePostedFromHeader(job);
    paintLists();
    self.RLNotes?.tick(job);
    self.RLKeywords?.tick(job);
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1500);
})();
