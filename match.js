// The open job compared with the person's CV and notes (issue #57). The model reads the whole description, and only
// the bullet points left visible after folding get marked: green where the CV shows the person has it, yellow where
// the job asks for it and the CV doesn't show it, red where the person's notes say they don't want it. Hovering a
// mark shows the model's reason and the line of the CV or notes it rests on. The CV and notes are written under
// "About you" in the settings, saved as "aboutMe"; "matchAuto" compares each job as it opens, otherwise a link under
// the fold's status line does. content.js calls RLMatch.ready once a description is folded, and RLMatch.tick on
// every pass.
(() => {
  const LABELS = {
    MATCH: { css: "rl-cv-match", word: "match", tip: "Your CV shows this" },
    GAP: { css: "rl-cv-gap", word: "missing", tip: "Your CV doesn't show this" },
    UNWANTED: { css: "rl-cv-unwanted", word: "you don't want", tip: "You said you don't want this" },
  };
  const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

  let hasMaterial = false, auto = false, listOpen = false;
  chrome.storage.local.get(["aboutMe", "matchAuto", "matchListOpen"]).then((r) => {
    hasMaterial = !!r.aboutMe?.trim();
    auto = !!r.matchAuto;
    listOpen = !!r.matchListOpen;
  });
  // CV or notes written, or the switch turned on, while a job is open: its line is drawn again.
  let last = null; // the arguments of the last ready()
  chrome.storage.onChanged.addListener((ch) => {
    if (!ch.aboutMe && !ch.matchAuto) return;
    // Underlines made from the old CV go at once.
    if (ch.aboutMe) { hasMaterial = !!ch.aboutMe.newValue?.trim(); shown = null; hide(); }
    if (ch.matchAuto) auto = !!ch.matchAuto.newValue;
    if (last?.[3].isConnected) ready(...last);
  });

  let shown = null; // {id, highlights} for the open job
  let painted = { sig: "", marks: [] }; // marks: [{range, h}]

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function link(text, onClick) {
    const b = el("button", null, text);
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  const ask = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage({ type: "match", ...msg }, (r) => resolve(r || { error: chrome.runtime.lastError?.message || "no answer" })); }
    catch (e) { resolve({ error: String(e.message || e) }); }
  });

  // A label's colour as a small filled chip: "6 match", or "green" in the line that explains the colours.
  const chip = (label, text) => el("span", `rl-chip ${LABELS[label].css}-chip`, text);

  // The compare row of the open job's box (see content.js): a link to compare, the comparison running, or what it
  // found, with a list of every underlined phrase under it that opens and closes.
  async function ready(job, text, bullets, view) {
    const texts = bullets.map((b) => b.text);
    last = [job, text, bullets, view];
    if (!bullets.length) { self.RL.dropRow(view, "match"); return; }
    const body = self.RL.row(view, "match");
    if (!body) return;
    const line = el("div", "rl-match");
    body.replaceChildren(line);
    const settings = () => link("Refined LinkedIn settings", () => chrome.runtime.sendMessage({ type: "options" }));
    if (!hasMaterial) {
      line.append("Compare this job with your CV: add it under About you in ", settings());
      return;
    }
    const run = async (again) => {
      const glyph = el("span", "jfold-spinner");
      let frame = 0;
      const spin = () => { glyph.textContent = SPINNER[frame++ % SPINNER.length]; };
      spin();
      const spinning = setInterval(() => (line.isConnected ? spin() : clearInterval(spinning)), 80);
      line.replaceChildren(glyph, "Comparing with your CV…");
      body.querySelector(".rl-cv-list")?.remove();
      const res = await ask({ id: job.id, text, bullets: texts, again });
      clearInterval(spinning);
      if (!line.isConnected) return;
      show(res);
    };
    const show = (res) => {
      line.replaceChildren();
      body.querySelector(".rl-cv-list")?.remove();
      if (["NO_CONSENT", "NO_KEY", "NO_ACCESS", "NO_SIGNIN", "NO_MATERIAL"].includes(res?.error)) {
        line.append({
          NO_CONSENT: "Not compared: allow sending job descriptions to an AI service in ",
          NO_KEY: "Not compared: choose a model provider and API key in ",
          NO_ACCESS: "Not compared: allow calls to the model's address by saving it once in ",
          NO_SIGNIN: "Not compared: sign in with ChatGPT in ",
          NO_MATERIAL: "Compare this job with your CV: add it under About you in ",
        }[res.error], settings());
        return;
      }
      if (res?.error) {
        line.append(`Could not compare with your CV: ${res.error} · `, link("try again", () => run(true)));
        return;
      }
      shown = { id: job.id, highlights: res.highlights, bullets };
      painted.sig = "";
      const n = (label) => res.highlights.filter((h) => h.label === label).length;
      const said = Object.entries(LABELS).filter(([k]) => n(k)).map(([k, l]) => chip(k, `${n(k)} ${l.word}`));
      line.append("Compared with your CV ");
      if (said.length) line.append(...said);
      else line.append("· nothing to mark");
      line.append(" · ", link("compare again", () => run(true)));
      if (!res.highlights.length) return;
      const list = checklist(res.highlights);
      const toggle = link("", () => {
        listOpen = !listOpen;
        chrome.storage.local.set({ matchListOpen: listOpen });
        draw();
      });
      const draw = () => {
        list.hidden = !listOpen;
        toggle.textContent = listOpen ? "hide the list" : "show the list";
        toggle.setAttribute("aria-expanded", String(listOpen));
      };
      draw();
      line.append(" · ", toggle);
      line.after(list);
    };
    // A saved answer shows at once. Otherwise the job is compared now, or on a click.
    const saved = await ask({ id: job.id, text, bullets: texts, peek: true });
    if (!line.isConnected) return;
    if (saved && !saved.error) show(saved);
    else if (auto) run(false);
    else {
      const hint = el("span", "rl-hint", " underlines ");
      hint.append(chip("MATCH", "green"), " where you have it, ", chip("GAP", "yellow"), " where it's missing, ",
        chip("UNWANTED", "red"), " where you don't want it");
      line.append(link("Compare with my CV", () => run(false)), hint);
    }
  }

  // Every underlined phrase in bullet point order, with its reason. Clicking one scrolls to its underline and lights
  // it up for a moment.
  function checklist(highlights) {
    const list = el("ul", "rl-cv-list");
    for (const h of [...highlights].sort((a, b) => a.bullet - b.bullet)) {
      const item = el("li");
      const b = el("button", "rl-cv-item");
      b.type = "button";
      b.append(chip(h.label, LABELS[h.label].word), " ", el("span", "rl-cv-phrase", h.phrase), el("span", "rl-cv-why", h.reasoning));
      b.addEventListener("click", (e) => { e.stopPropagation(); focus(h); });
      item.append(b);
      list.append(item);
    }
    return list;
  }

  // A phrase still on the page, with a place on screen; false once LinkedIn has redrawn the text away.
  const drawn = (range) => range.startContainer.isConnected && range.getClientRects().length > 0;

  // The phrase itself is brought to the middle of whatever scrolls around it, LinkedIn's job pane, and then into the
  // window too if the pane itself is partly out of it. Its paragraph can be far taller than the screen when the
  // bullet points are lines split by <br>, so the phrase's own position counts, not its paragraph's.
  function scrollToRange(range) {
    let box = range.startContainer.parentElement;
    while (box && box !== document.body && box !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    const middle = (r) => r.top + r.height / 2;
    if (box && box !== document.body && box !== document.documentElement) {
      box.scrollBy({ top: middle(range.getBoundingClientRect()) - middle(box.getBoundingClientRect()), behavior: "instant" });
    }
    const r = range.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) window.scrollBy({ top: middle(r) - innerHeight / 2, behavior: "instant" });
  }

  let focusTimer = 0;
  function focus(h) {
    const m = painted.marks.find((x) => x.h === h);
    if (!m || !window.CSS?.highlights || !drawn(m.range)) return;
    scrollToRange(m.range);
    CSS.highlights.set("rl-cv-focus", new Highlight(m.range));
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => CSS.highlights.delete("rl-cv-focus"), 1800);
  }

  // ---- the marks ------------------------------------------------------------------------------------------------

  // A phrase is looked for only in its own bullet point's text on the page, so the same words elsewhere stay plain,
  // and found the way background.js checked it (phrase.js): in the bullet point's text nodes joined into one, then
  // mapped back to the node each end falls in.
  function rangeOf(bullet, phrase) {
    const seq = Phrase.chars(bullet.nodes.map((n) => n.data).join(""));
    const f = Phrase.find(seq, phrase);
    if (!f) return null;
    const node = (i) => { // the text node holding character i of the joined text, and i's offset in it
      for (const n of bullet.nodes) { if (i < n.data.length) return [n, i]; i -= n.data.length; }
    };
    const first = seq[f.start], last = seq[f.start + f.length - 1];
    const [endNode, endAt] = node(last.at + last.size - 1);
    const r = document.createRange();
    r.setStart(...node(first.at));
    r.setEnd(endNode, endAt + 1);
    return r;
  }

  function paint(job) {
    if (!window.CSS?.highlights) return;
    const on = shown && job && shown.id === job.id && shown.bullets.some((b) => b.nodes[0]?.isConnected) ? shown : null;
    const sig = on ? `${on.id}|${on.highlights.length}` : "";
    if (sig === painted.sig) return;
    const marks = [];
    for (const h of on?.highlights || []) {
      const b = on.bullets[h.bullet - 1];
      const r = b && rangeOf(b, h.phrase);
      if (r) marks.push({ range: r, h });
    }
    for (const [k, l] of Object.entries(LABELS)) {
      const ranges = marks.filter((m) => m.h.label === k).map((m) => m.range);
      if (ranges.length) CSS.highlights.set(l.css, new Highlight(...ranges));
      else CSS.highlights.delete(l.css);
    }
    hide();
    painted = { sig, marks };
  }

  // ---- the reason on hover --------------------------------------------------------------------------------------

  let tip = null, tipFor = null, pending = 0; // pending: the animation frame that will look under the pointer

  function hide() { tip?.remove(); tip = null; tipFor = null; }

  function showTip(m, rect) {
    if (tipFor === m) return;
    hide();
    tipFor = m;
    const l = LABELS[m.h.label];
    tip = el("div", "rl-tip rl-ui");
    tip.append(el("div", `rl-tip-job ${l.css}-text`, l.tip), el("div", "rl-mark-note", m.h.reasoning));
    if (m.h.material_quote) {
      const q = el("div", "rl-cv-quote");
      q.append(el("span", "rl-hint", "From your CV or notes: "), el("span", "rl-quote", m.h.material_quote));
      tip.append(q);
    }
    document.body.append(tip);
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, rect.left), innerWidth - w - 8);
    const top = rect.bottom + 6 + h <= innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - 6 - h);
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  }

  document.addEventListener("mousemove", (e) => {
    if (!painted.marks.length) { if (tip) hide(); return; }
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      for (const m of painted.marks) {
        for (const r of m.range.getClientRects()) {
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { showTip(m, r); return; }
        }
      }
      hide();
    });
  }, { passive: true });
  addEventListener("scroll", hide, true);
  document.documentElement.addEventListener("mouseleave", () => { cancelAnimationFrame(pending); pending = 0; hide(); });

  function tick(job) {
    if (shown && shown.id !== job?.id) { shown = null; hide(); }
    paint(job);
  }

  self.RLMatch = { ready, tick };
})();
