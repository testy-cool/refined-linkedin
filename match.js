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

  let hasMaterial = false, auto = false;
  chrome.storage.local.get(["aboutMe", "matchAuto"]).then((r) => { hasMaterial = !!r.aboutMe?.trim(); auto = !!r.matchAuto; });
  // CV or notes written, or the switch turned on, while a job is open: its line is drawn again.
  let last = null; // the arguments of the last ready()
  chrome.storage.onChanged.addListener((ch) => {
    if (!ch.aboutMe && !ch.matchAuto) return;
    if (ch.aboutMe) hasMaterial = !!ch.aboutMe.newValue?.trim();
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

  // The line under the fold's status: a link to compare, the comparison running, or what it found.
  async function ready(job, text, bullets, view) {
    last = [job, text, bullets, view];
    view.querySelector(".rl-match")?.remove();
    if (!bullets.length) return;
    const line = el("div", "jfold-status rl-match rl-ui");
    view.querySelector(".jfold-status")?.after(line);
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
      const res = await ask({ id: job.id, text, bullets, again });
      clearInterval(spinning);
      if (!line.isConnected) return;
      show(res);
    };
    const show = (res) => {
      line.replaceChildren();
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
      const said = Object.entries(LABELS).filter(([k]) => n(k)).map(([k, l]) => el("span", `rl-cv-key ${l.css}-text`, `${n(k)} ${l.word}`));
      line.append("Compared with your CV: ");
      if (said.length) said.forEach((s, i) => line.append(...(i ? [", ", s] : [s])));
      else line.append("nothing to mark");
      line.append(" · ", link("compare again", () => run(true)));
    };
    // A saved answer shows at once. Otherwise the job is compared now, or on a click.
    const saved = await ask({ id: job.id, text, bullets, peek: true });
    if (!line.isConnected) return;
    if (saved && !saved.error) show(saved);
    else if (auto) run(false);
    else {
      const hint = el("span", "rl-hint", " underlines ");
      hint.append(el("span", "rl-cv-match-text", "green"), " where you have it, ", el("span", "rl-cv-gap-text", "yellow"),
        " where it's missing, ", el("span", "rl-cv-unwanted-text", "red"), " where you don't want it");
      line.append(link("Compare with my CV", () => run(false)), hint);
    }
  }

  // ---- the marks ------------------------------------------------------------------------------------------------

  // Text compared the way background.js checks a highlight: case, spaces, curly quotes and a last full stop or comma
  // do not count. fold() changes each character into one, so offsets into the text stay offsets into the page.
  const fold = (c) => { const l = c.toLowerCase(); return l.length === 1 ? l.replace(/[‘’]/g, "'").replace(/[“”]/g, '"') : c; };
  const squash = (t) => [...t.replace(/\s+/g, "")].map(fold).join("").replace(/[.,;:]+$/, "");

  // The visible description's characters without whitespace, each with the text node and offset it came from, as in
  // notes.js. Folded lines are left out, so a phrase never lands in one.
  function textIndex(root) {
    const chars = [], at = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(".jfold-chip, .jfold-hide, .rl-ui") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (tw.nextNode()) {
      const n = tw.currentNode;
      for (let i = 0; i < n.data.length; i++) if (!/\s/.test(n.data[i])) { chars.push(fold(n.data[i])); at.push([n, i]); }
    }
    return { text: chars.join(""), at };
  }

  // Where each bullet point starts in the index, found in their order on the page, so bullet 2 "Python" is never
  // found inside bullet 1 "Mentor engineers using Python". -1 for one not found.
  function bulletStarts(idx, bullets) {
    let pos = 0;
    return bullets.map((b) => {
      const k = idx.text.indexOf(squash(b), pos);
      if (k >= 0) pos = k + squash(b).length;
      return k;
    });
  }

  // A phrase is looked for inside its own bullet point, so the same words elsewhere in the description stay plain.
  function rangeOf(idx, start, bullet, phrase) {
    if (start < 0 || !squash(phrase)) return null;
    const p = idx.text.slice(start, start + squash(bullet).length).indexOf(squash(phrase));
    if (p < 0) return null;
    const a = start + p, z = a + squash(phrase).length - 1;
    const r = document.createRange();
    r.setStart(...idx.at[a]);
    r.setEnd(idx.at[z][0], idx.at[z][1] + 1);
    return r;
  }

  function containers() {
    const box = self.RL.descriptionBox();
    return [document.querySelector(".jfold-clone"), box && box.style.display !== "none" ? box : null].filter(Boolean);
  }

  function paint(job) {
    if (!window.CSS?.highlights) return;
    const list = shown && job && shown.id === job.id ? shown.highlights : [];
    const roots = containers();
    const sig = `${job?.id}|${list.length}|${roots.map((c) => c.textContent.length).join(",")}`;
    if (sig === painted.sig && painted.marks.every((m) => m.range.startContainer.isConnected)) return;
    const marks = [];
    for (const root of list.length ? roots : []) {
      const idx = textIndex(root);
      const starts = bulletStarts(idx, shown.bullets);
      for (const h of list) {
        const r = rangeOf(idx, starts[h.bullet - 1] ?? -1, shown.bullets[h.bullet - 1] || "", h.phrase);
        if (r) marks.push({ range: r, h });
      }
    }
    for (const [k, l] of Object.entries(LABELS)) {
      const ranges = marks.filter((m) => m.h.label === k).map((m) => m.range);
      if (ranges.length) CSS.highlights.set(l.css, new Highlight(...ranges));
      else CSS.highlights.delete(l.css);
    }
    painted = { sig, marks };
  }

  // ---- the reason on hover --------------------------------------------------------------------------------------

  let tip = null, tipFor = null, pending = false;

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
    if (!painted.marks.length || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const m of painted.marks) {
        for (const r of m.range.getClientRects()) {
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { showTip(m, r); return; }
        }
      }
      hide();
    });
  }, { passive: true });
  addEventListener("scroll", hide, true);

  function tick(job) {
    if (shown && shown.id !== job?.id) { shown = null; hide(); }
    paint(job);
  }

  self.RLMatch = { ready, tick };
})();
