// Notes on a job (issue #1): one note about the whole job, and notes on passages selected in its description.
// The open job shows them under its header's Apply and Save buttons, passages highlighted where they stand in the
// description; a job in the list with notes gets an icon whose hover shows them. content.js calls RLNotes.tick on every pass and
// RLNotes.count / RLNotes.hover when it draws a card.
(() => {
  // id -> { t, c, job: {text, at} | null, marks: [{id, quote, key, before, after, note, at}] }
  let notes = {};
  let version = 0;

  chrome.storage.local.get("notes").then((r) => { notes = r.notes || {}; version++; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.notes) { notes = ch.notes.newValue || {}; version++; } });

  function save() {
    version++;
    chrome.storage.local.set({ notes });
  }

  function entry(job) {
    notes[job.id] = notes[job.id] || { job: null, marks: [] };
    Object.assign(notes[job.id], { t: job.title || notes[job.id].t, c: job.company || notes[job.id].c });
    return notes[job.id];
  }

  const has = (n) => n && (n.job?.text || n.marks.length);

  // ---- anchoring a passage ------------------------------------------------------------------------------------

  // The description's characters without whitespace, each with the text node and offset it came from. Matching on
  // these finds a passage whether it is in the folded copy or LinkedIn's original, whatever their line breaks.
  function textIndex(root) {
    const chars = [], at = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(".jfold-chip") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (tw.nextNode()) {
      const n = tw.currentNode;
      for (let i = 0; i < n.data.length; i++) if (!/\s/.test(n.data[i])) { chars.push(n.data[i]); at.push([n, i]); }
    }
    return { text: chars.join(""), at };
  }

  function anchorOf(range, root) {
    const { text, at } = textIndex(root);
    let s = -1, e = -1;
    at.forEach(([n, i], k) => {
      if (range.comparePoint(n, i) === 0 && range.comparePoint(n, i + 1) === 0) { if (s < 0) s = k; e = k; }
    });
    if (s < 0) return null;
    return { key: text.slice(s, e + 1), before: text.slice(Math.max(0, s - 32), s), after: text.slice(e + 1, e + 33) };
  }

  // Where a saved passage is now: every place its characters appear, the one whose surroundings match best.
  function find(mark, idx) {
    let best = null, bestScore = -1;
    for (let k = idx.text.indexOf(mark.key); k >= 0; k = idx.text.indexOf(mark.key, k + 1)) {
      let score = 0;
      while (score < mark.before.length && idx.text[k - 1 - score] === mark.before[mark.before.length - 1 - score]) score++;
      let a = 0;
      while (a < mark.after.length && idx.text[k + mark.key.length + a] === mark.after[a]) a++;
      if (score + a > bestScore) { best = k; bestScore = score + a; }
    }
    if (best === null) return null;
    const r = document.createRange();
    const [sn, si] = idx.at[best], [en, ei] = idx.at[best + mark.key.length - 1];
    r.setStart(sn, si);
    r.setEnd(en, ei + 1);
    return r;
  }

  function containers() {
    const box = self.RL.descriptionBox();
    return [document.querySelector(".jfold-clone"), box && box.style.display !== "none" ? box : null].filter(Boolean);
  }

  function inDescription(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el && containers().some((c) => c.contains(el)) && !el.closest(".jfold-chip");
  }

  // ---- highlights ---------------------------------------------------------------------------------------------

  let painted = { sig: "", ranges: [] };

  function paintHighlights(job) {
    if (!window.CSS?.highlights) return;
    const n = job && notes[job.id];
    if (!n?.marks.length) { CSS.highlights.delete("rl-note"); painted = { sig: "", ranges: [] }; return; }
    // Recount only when the job, its notes or the description's text nodes changed.
    const sig = `${job.id}|${version}|${containers().map((c) => c.textContent.length).join(",")}`;
    if (sig === painted.sig && painted.ranges.every((r) => r.startContainer.isConnected)) return;
    const ranges = [];
    for (const c of containers()) {
      const idx = textIndex(c);
      for (const m of n.marks) { const r = find(m, idx); if (r) ranges.push(r); }
    }
    CSS.highlights.set("rl-note", new Highlight(...ranges));
    painted = { sig, ranges };
  }

  // ---- the panel under the job's header ----------------------------------------------------------------------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function linkButton(text, onClick) {
    const b = el("button", "rl-link", text);
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  // A text box with Save and Cancel, used for the job's note, for editing a passage's note and in the pop-up.
  function editor(initial, onSave, onCancel, placeholder) {
    const wrap = el("div", "rl-editor");
    const area = el("textarea");
    area.value = initial || "";
    area.placeholder = placeholder || "";
    area.rows = 3;
    const done = () => onSave(area.value.trim());
    area.addEventListener("keydown", (e) => {
      e.stopPropagation(); // LinkedIn's own keyboard shortcuts stay out of the note
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    });
    const row = el("div", "rl-editor-actions");
    const ok = el("button", "rl-save", "Save");
    ok.type = "button";
    ok.addEventListener("click", (e) => { e.stopPropagation(); done(); });
    row.append(ok, linkButton("Cancel", onCancel), el("span", "rl-keys", "Ctrl+Enter saves"));
    wrap.append(area, row);
    setTimeout(() => area.focus(), 0);
    return wrap;
  }

  // In the note row of the open job's box, see content.js.
  function placePanel(panel, view) {
    const body = self.RL.row(view, "note");
    if (body && panel.parentElement !== body) body.append(panel);
  }

  // A note being written survives the panel being redrawn, as when LinkedIn redraws the job: {id, key, node}, where
  // key is "job" or a passage's id, and node is the editor with its text.
  let writing = null;

  function renderPanel(job, view) {
    let panel = document.querySelector(".rl-notes");
    if (!panel) panel = el("section", "rl-notes rl-ui");
    placePanel(panel, view);
    panel.dataset.for = `${job.id}|${version}`;
    const n = notes[job.id] || { job: null, marks: [] };
    if (writing?.id !== job.id) writing = null;
    const hadFocus = !!writing?.node.contains(document.activeElement);
    panel.replaceChildren();
    const redraw = () => { writing = null; renderPanel(job, view); };
    const commit = (change) => { change(); writing = null; save(); renderPanel(job, view); };
    const write = (key, initial, onSave, placeholder) => {
      writing = { id: job.id, key, node: editor(initial, (t) => commit(() => onSave(t)), redraw, placeholder) };
      renderPanel(job, view);
    };
    const open = (key) => (writing?.key === key ? writing.node : null);

    if (open("job")) panel.append(open("job"));
    else if (n.job?.text) {
      const box = el("div", "rl-job-note");
      box.append(el("div", "rl-job-note-text", n.job.text));
      const actions = el("div", "rl-actions");
      actions.append(
        linkButton("Edit", () => write("job", n.job.text, (t) => { entry(job).job = t ? { text: t, at: Date.now() } : null; }, "What you think of this job")),
        linkButton("Delete", () => commit(() => { entry(job).job = null; })));
      box.append(actions);
      panel.append(box);
    }
    for (const m of n.marks) {
      const item = el("div", "rl-mark");
      item.append(el("div", "rl-quote", m.quote));
      if (open(m.id)) item.append(open(m.id));
      else {
        if (m.note) item.append(el("div", "rl-mark-note", m.note));
        const actions = el("div", "rl-actions");
        actions.append(
          linkButton(m.note ? "Edit" : "Add a note", () => write(m.id, m.note, (t) => { m.note = t; entry(job); }, "Why this passage matters")),
          linkButton("Delete", () => commit(() => { entry(job).marks = n.marks.filter((x) => x !== m); })));
        item.append(actions);
      }
      panel.append(item);
    }
    // With no note on the job yet, a field that looks like a text box opens the editor.
    if (!n.job?.text && !open("job")) {
      const field = el("button", "rl-note-field", "Add a note on this job…");
      field.type = "button";
      field.addEventListener("click", (e) => {
        e.stopPropagation();
        write("job", "", (t) => { if (t) entry(job).job = { text: t, at: Date.now() }; }, "What you think of this job");
      });
      panel.append(field);
    }
    panel.append(el("div", "rl-hint", n.marks.length ? "Select more text in the description to note it." : "Or select text in the description to note a passage."));
    if (writing && (hadFocus || document.activeElement === document.body)) writing.node.querySelector("textarea").focus();
  }

  // ---- the pop-up on a selection ------------------------------------------------------------------------------

  let pop = null;

  function closePop() { pop?.remove(); pop = null; }

  function place(node, rect) {
    document.body.append(node);
    const w = node.offsetWidth, h = node.offsetHeight;
    const left = Math.min(Math.max(8, rect.left), innerWidth - w - 8);
    const top = rect.top - h - 8 >= 8 ? rect.top - h - 8 : rect.bottom + 8;
    Object.assign(node.style, { left: `${left}px`, top: `${Math.min(top, innerHeight - h - 8)}px` });
  }

  function offerNote() {
    if (pop?.classList.contains("rl-pop-open")) return; // writing a note
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !inDescription(sel.anchorNode) || !inDescription(sel.focusNode)) {
      if (pop && !pop.contains(document.activeElement)) closePop();
      return;
    }
    const job = self.RL.openJob();
    const range = sel.getRangeAt(0);
    const root = containers().find((c) => c.contains(range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement));
    const anchor = job && root && anchorOf(range, root);
    if (!anchor || anchor.key.length < 2) return;
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    const rect = range.getBoundingClientRect();
    closePop();
    pop = el("div", "rl-pop rl-ui");
    const add = el("button", "rl-add", "Add note");
    add.type = "button";
    add.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.replaceChildren(editor("", (t) => {
        entry(job).marks.push({ id: `${Date.now()}`, quote, ...anchor, note: t, at: Date.now() });
        save();
        getSelection().removeAllRanges();
        closePop();
      }, closePop, "Why this passage matters"));
      pop.classList.add("rl-pop-open");
      place(pop, rect);
    });
    pop.append(add);
    // A short selection can also become a highlight word, highlighted in every description from now on.
    if (quote.length <= 60 && quote.split(" ").length <= 5) {
      const word = el("button", "rl-add rl-add-word", "Highlight word");
      word.type = "button";
      word.addEventListener("mousedown", (e) => e.preventDefault());
      word.addEventListener("click", (e) => {
        e.stopPropagation();
        self.RLKeywords?.add([quote]);
        getSelection().removeAllRanges();
        closePop();
      });
      pop.append(word);
    }
    place(pop, rect);
  }

  document.addEventListener("mouseup", (e) => { if (!pop?.contains(e.target)) setTimeout(offerNote, 0); });
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") setTimeout(offerNote, 0); });
  document.addEventListener("mousedown", (e) => { if (pop && !pop.contains(e.target)) closePop(); }, true);
  addEventListener("scroll", () => { if (pop && !pop.classList.contains("rl-pop-open")) closePop(); }, true);

  // ---- the list: an icon on cards with notes, the notes on hover ---------------------------------------------

  let tip = null;

  function showTip(icon, id) {
    const n = notes[id];
    if (!has(n)) return;
    tip?.remove();
    tip = el("div", "rl-tip rl-ui");
    if (n.job?.text) tip.append(el("div", "rl-tip-job", n.job.text));
    for (const m of n.marks) {
      const item = el("div", "rl-tip-mark");
      item.append(el("div", "rl-quote", m.quote));
      if (m.note) item.append(el("div", "rl-mark-note", m.note));
      tip.append(item);
    }
    const r = icon.getBoundingClientRect();
    document.body.append(tip);
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    const top = r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  }

  function hover(icon, id) {
    icon.addEventListener("mouseenter", () => showTip(icon, id));
    icon.addEventListener("mouseleave", () => { tip?.remove(); tip = null; });
  }

  function count(id) {
    const n = id && notes[id];
    return has(n) ? (n.job?.text ? 1 : 0) + n.marks.length : 0;
  }

  // ---- every pass -------------------------------------------------------------------------------------------

  function tick(job) {
    // The description's view is built once the open job's text has loaded, so the header is this job's too. A panel
    // for the open job stays while LinkedIn redraws the description; a panel for the previous job goes.
    const view = document.querySelector(".jfold-view");
    const panel = document.querySelector(".rl-notes");
    if (job && view && self.RL.descriptionBox()?.dataset.jfold === job.id) {
      if (panel?.dataset.for !== `${job.id}|${version}`) renderPanel(job, view);
      else placePanel(panel, view);
    } else if (panel && panel.dataset.for.split("|")[0] !== job?.id) panel.remove();
    paintHighlights(job);
  }

  self.RLNotes = { tick, count, hover };
})();
