// Words each person wants to spot at once (issue #9), and their usual forms (issue #33): highlighted wherever they
// appear in the open job's description, folded copy or original, and named on any fold chip that hides them. Each
// card in a job list says which of them its description mentions (issue #31), from the job data details.js asks
// LinkedIn for. The words are set in the toolbar pop-up or from a selection's "Highlight word", and saved in
// chrome.storage.local as "keywords". content.js calls RLKeywords.tick on every pass.
(() => {
  let words = [];
  let version = 0;
  let painted = { sig: "", ranges: [] };

  chrome.storage.local.get("keywords").then((r) => { words = r.keywords || []; version++; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.keywords) { words = ch.keywords.newValue || []; version++; } });
  self.RLDetails?.onChange(paintCards);

  // Changing how words match changes this, so job cards count their words again.
  const FORMS = "forms-1";

  // A letter with an accent counts as the letter without it, so "romana" finds "română". Each character stays one
  // character, so a match in the folded text has the same offsets in the original.
  const fold = (s) => s.replace(/[^\x00-\x7f]/g, (c) => {
    const b = c.normalize("NFD").replace(/\p{M}/gu, "");
    return b.length === 1 ? b : c;
  });
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // A word also finds its usual endings: "evals" finds "eval", "engineer" finds "engineering", "manage" finds
  // "management" and "evaluate" finds "evaluation". A word of three letters or fewer takes only a plural, so "AI"
  // never finds "aid" or "air". Typos are left out, since "remote" would then find "remove".
  function endings(w) {
    if (/^\p{Lu}{2,}s$/u.test(w)) w = w.slice(0, -1);
    else if (w.length >= 5 && /[^siu]s$/i.test(w)) w = w.slice(0, -1);
    w = w.toLowerCase();
    if (w.length <= 3) return `${esc(w)}(?:s|['’]s)?`;
    if (w.endsWith("e")) {
      const ion = w.length >= 6 ? "|ion|ions|ation|ations" : "";
      return `${esc(w.slice(0, -1))}(?:e(?:s|d|r|rs|ly|ment|ments)?|ing${ion})`;
    }
    if (/[^aeiou]y$/.test(w)) return `${esc(w.slice(0, -1))}(?:y|ies|ied|ying)`;
    const twice = /[^aeiou][aeiou][bdgklmnprt]$/.test(w) ? `|${w.at(-1)}(?:ed|ing|er|ers)` : "";
    return `${esc(w)}(?:s|es|['’]s|ed|ing|er|ers|ly|ic|ment|ments${twice})?`;
  }

  // The parts of a phrase may be joined by spaces, a hyphen or nothing: "full stack" finds "full-stack" and
  // "fullstack". Only the last part takes endings.
  function forms(word) {
    const parts = fold(word).split(/[\s\-‐‑–]+/).filter(Boolean);
    return parts.map((p, i) => (i < parts.length - 1 ? esc(p) : endings(p))).join("[\\s\\-‐‑–]*");
  }

  // One expression for all the words, longest first, with a group per word to tell which one a match is. Run it on
  // folded text.
  let built = { version: -1 };
  function matcher() {
    if (built.version === version) return built.m;
    const list = words.map((w) => w.trim()).filter(Boolean);
    const order = list.map((_, i) => i).sort((a, b) => list[b].length - list[a].length);
    const m = list.length ? {
      re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${order.map((i) => `(${forms(list[i])})`).join("|")})(?![\\p{L}\\p{N}])`, "giu"),
      word: (x) => list[order[x.slice(1).findIndex((g) => g !== undefined)]],
      list,
    } : null;
    built = { version, m };
    return m;
  }

  // The words a text mentions, in the order of the word list.
  function find(text) {
    const m = matcher();
    if (!m) return [];
    const hit = new Set([...fold(text).matchAll(m.re)].map(m.word));
    return m.list.filter((w) => hit.has(w));
  }

  function containers() {
    const box = self.RL.descriptionBox();
    return [document.querySelector(".jfold-clone"), box && box.style.display !== "none" ? box : null].filter(Boolean);
  }

  // Each card names the words its description mentions, in the order of the word list. A description not in memory
  // is asked for again only when the words changed since the card's last count.
  function paintCards() {
    const m = matcher();
    const sig = [FORMS, ...(m?.list || []).map((w) => w.toLowerCase())].join("\n");
    for (const card of document.querySelectorAll('li[data-occludable-job-id], [role="button"][componentkey^="job-card-component-ref-"]')) {
      const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("componentkey").split("-").pop();
      let found = [];
      if (m && self.RLDetails) {
        const d = self.RLDetails.get(id);
        const t = self.RLDetails.text(id);
        if (d?.m?.s === sig) found = d.m.w;
        else if (t !== null) {
          found = find(t);
          self.RLDetails.keep(id, { s: sig, w: found });
        } else self.RLDetails.want(id, true);
      }
      const where = card.matches("li") ? card.querySelector(".artdeco-entity-lockup__content") : self.RL.textColumn(card);
      let line = card.querySelector(".rl-card-words");
      const key = found.join("\n");
      if (line && line.dataset.key === key && line.parentElement === where) continue;
      line?.remove();
      if (!found.length || !where) continue;
      line = document.createElement("div");
      line.className = "rl-card-words rl-ui";
      line.dataset.key = key;
      line.append("mentions ");
      found.forEach((w, i) => {
        const span = document.createElement("span");
        span.className = "rl-card-word";
        span.textContent = w;
        line.append(...(i ? [" ", span] : [span]));
      });
      where.append(line);
    }
  }

  function tick(job) {
    paintCards();
    if (!window.CSS?.highlights) return;
    const roots = containers();
    const chips = document.querySelectorAll(".jfold-chip");
    // Recount only when the job, the words or the description's text changed.
    const sig = `${job?.id}|${version}|${roots.map((c) => c.textContent.length).join(",")}|${chips.length}`;
    if (sig === painted.sig && painted.ranges.every((r) => r.startContainer.isConnected)) return;
    const m = matcher();
    const ranges = [];
    if (m) {
      for (const root of roots) {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.parentElement?.closest(".jfold-chip, .rl-ui") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        while (tw.nextNode()) {
          const n = tw.currentNode;
          for (const x of fold(n.data).matchAll(m.re)) {
            const r = document.createRange();
            r.setStart(n, x.index);
            r.setEnd(n, x.index + x[0].length);
            ranges.push(r);
          }
        }
      }
    }
    if (ranges.length) CSS.highlights.set("rl-keyword", new Highlight(...ranges));
    else CSS.highlights.delete("rl-keyword");
    painted = { sig, ranges };
    // A chip names the words its folded text holds, through CSS, so its own label can change freely.
    for (const chip of chips) {
      const found = find(chip.dataset.folded || "");
      if (found.length) chip.dataset.words = `mentions ${found.join(", ")}`;
      else delete chip.dataset.words;
    }
  }

  // Adds words, skipping ones already there in any case.
  async function add(list) {
    const { keywords = [] } = await chrome.storage.local.get("keywords");
    const have = new Set(keywords.map((w) => w.toLowerCase()));
    const fresh = list.map((w) => w.replace(/\s+/g, " ").trim()).filter((w) => w && !have.has(w.toLowerCase()) && have.add(w.toLowerCase()));
    if (fresh.length) await chrome.storage.local.set({ keywords: [...keywords, ...fresh] });
  }

  self.RLKeywords = { tick, add, find };
})();
