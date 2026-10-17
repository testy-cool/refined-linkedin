// The bar above a job list (issue #65): how many Grey out filters are on, which opens the pop-up where they are set;
// the switch that hides the jobs they catch, with how many are hidden and a way to show them; and "Dismiss the 7 grey
// jobs", which clicks LinkedIn's own × on every grey card in the list (issue #55): jobs seen, and jobs the filters
// catch. LinkedIn then stops recommending them. The open job, saved jobs and jobs already dismissed are left alone.
// content.js hands over the list's cards each time it paints them.
(() => {
  const GAP_MS = 600; // between two clicks, so they reach LinkedIn one at a time, as a person's would
  // What a card says once dismissed: "We won't show you this job again" on the classic list, "We won't recommend
  // this job anymore" on the new search page.
  const DISMISSED = /We won.t (show you this job again|recommend this job anymore)/;

  let cards = []; // [{el, id, item, open}], item being what holds the card in the list
  let bar = null;
  let run = null; // {done, total, stop, end}

  // LinkedIn's own lines on a card, leaving out the ones this extension adds.
  const says = (el, re) => [...el.querySelectorAll("p, li, span")]
    .some((e) => !e.children.length && !e.closest(".jfold-slot, .rl-ui") && re.test(e.textContent.trim()));
  const cross = (el) => el.querySelector('button[aria-label^="Dismiss "][aria-label$=" job"]');
  const grey = (el) => el.classList.contains("jfold-seen") || el.classList.contains("jfold-off");
  // A classic card scrolled far off has no × until LinkedIn draws it; it still counts, and is drawn when its turn comes.
  const due = (c) => !c.open && c.el.isConnected && grey(c.el) && !says(c.el, DISMISSED) && !says(c.el, /^Saved$/);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function tick(list) {
    cards = list;
    draw();
  }

  // The bar and its parts are built once, and only their words and switches change after that: a part built anew
  // under the pointer would swallow a click, on Stop above all. The dismiss part is built once per state: idle,
  // running and done.
  let parts = null; // {filters, hide, hidden, dismiss, words}

  // A rounded button with an icon and words; its words are its last child.
  function chip(icon, onClick, plain) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = plain ? "rl-bar-chip rl-bar-plain" : "rl-bar-chip";
    b.append(self.RL?.icon(icon, 16) || "", document.createElement("span"));
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function build() {
    const b = document.createElement("div");
    b.className = "rl-list-bar rl-ui";
    const filters = chip("filter", () => chrome.runtime.sendMessage({ type: "popup" }));
    filters.title = "Choose what greys out, in the Refined LinkedIn pop-up";
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "rl-switch";
    hide.setAttribute("role", "switch");
    const track = document.createElement("span");
    track.className = "rl-track";
    hide.append("Hide filtered jobs", track);
    hide.addEventListener("click", (e) => { e.stopPropagation(); self.RLFilters?.setHiding(!self.RLFilters.hiding); });
    const hidden = chip("company", () => self.RLFilters?.setShowing(!self.RLFilters.showing), true);
    const dismiss = document.createElement("span");
    dismiss.className = "rl-bar-dismiss";
    b.append(filters, hide, hidden, dismiss);
    bar = b;
    parts = { filters, hide, hidden, dismiss, words: null };
  }

  function buildDismiss(kind) {
    const d = parts.dismiss;
    d.dataset.kind = kind;
    parts.words = document.createElement("span");
    if (kind === "idle") {
      const b = chip("dismiss", dismissAll, true);
      b.title = "Clicks LinkedIn's × on each grey job, so LinkedIn stops recommending them";
      parts.words = b.lastChild;
      d.replaceChildren(b);
    } else if (kind === "running") {
      parts.words.className = "rl-bar-note";
      const stop = chip("dismiss", () => { run.stop = true; }, true);
      stop.lastChild.textContent = "Stop";
      d.replaceChildren(parts.words, stop);
    } else if (kind === "done") {
      parts.words.className = "rl-bar-note";
      d.replaceChildren(parts.words);
    } else d.replaceChildren();
  }

  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  function draw() {
    // "Dismissed 7 jobs" stays five seconds.
    if (run?.end && Date.now() - run.end >= 5000) run = null;
    const first = cards.find((c) => c.el.isConnected && c.item.parentElement);
    if (!first) { bar?.remove(); bar = null; parts = null; return; }
    if (!bar) build();
    const list = first.item.parentElement;
    if (bar.nextElementSibling !== list) list.before(bar);
    const f = self.RLFilters;
    const count = f?.count || 0;
    setText(parts.filters.lastChild, count ? `${count} filter${count === 1 ? "" : "s"} on` : "No filters on");
    parts.hide.setAttribute("aria-checked", String(!!f?.hiding));
    const k = f?.hiding ? cards.filter((c) => c.el.isConnected && c.el.classList.contains("rl-hideable")).length : 0;
    parts.hidden.hidden = !k;
    setText(parts.hidden.lastChild, f?.showing ? `${k} shown · hide them` : `${k} hidden · show them`);
    const n = cards.filter(due).length;
    const kind = run ? (run.end ? "done" : "running") : n ? "idle" : "none";
    if (parts.dismiss.dataset.kind !== kind) buildDismiss(kind);
    if (kind === "none") return;
    setText(parts.words, kind === "idle" ? `Dismiss the ${n} grey job${n === 1 ? "" : "s"}`
      : kind === "running" ? `Dismissing ${run.done} of ${run.total}` : `Dismissed ${run.done} job${run.done === 1 ? "" : "s"}`);
  }

  async function dismissAll() {
    const ids = cards.filter(due).map((c) => c.id);
    run = { done: 0, total: ids.length, stop: false, end: 0 };
    draw();
    // Going to another search ends the run. Opening a job changes only currentJobId in the address.
    const search = () => { const u = new URL(location.href); u.searchParams.delete("currentJobId"); return u.pathname + u.search; };
    const from = search();
    // The card as content.js last painted it: LinkedIn may have drawn it anew, and it may have been opened, saved or
    // turned white since the click.
    const now = (id) => {
      if (search() !== from) run.stop = true;
      const c = cards.find((k) => k.id === id);
      // The job just picked counts as open from the moment the address names it, before its details replace the
      // previous job's.
      const picked = new URL(location.href).searchParams.get("currentJobId");
      return !run.stop && c && due(c) && id !== picked && self.RL?.openJob()?.id !== id ? c : null;
    };
    for (const id of ids) {
      if (run.stop) break;
      let c = now(id);
      for (let t = 0; c && !cross(c.el) && t < 10 && !run.stop; t++) {
        if (!t) c.el.scrollIntoView({ block: "nearest" });
        await sleep(200);
        c = now(id);
      }
      if (run.stop) break;
      const x = c && cross(c.el);
      if (!x) { run.total--; draw(); continue; }
      x.click();
      run.done++;
      draw();
      await sleep(GAP_MS);
    }
    run.end = Date.now();
    draw();
    setTimeout(draw, 5100);
  }

  self.RLDismiss = { tick, DISMISSED };
})();
