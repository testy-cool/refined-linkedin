// Words each person wants to spot at once (issue #9): highlighted wherever they appear in the open job's
// description, folded copy or original, and named on any fold chip that hides them. Each card in a job list says
// which of them its description mentions (issue #31), from the job data details.js asks LinkedIn for. The words
// are set in the toolbar pop-up or from a selection's "Highlight word", and saved in chrome.storage.local as
// "keywords". content.js calls RLKeywords.tick on every pass.
(() => {
  let words = [];
  let version = 0;
  let painted = { sig: "", ranges: [] };

  chrome.storage.local.get("keywords").then((r) => { words = r.keywords || []; version++; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.keywords) { words = ch.keywords.newValue || []; version++; } });
  self.RLDetails?.onChange(paintCards);

  // Whole words, any case; spaces inside a phrase match any run of whitespace.
  function pattern() {
    const alts = words.map((w) => w.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
    return alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  }

  function containers() {
    const box = self.RL.descriptionBox();
    return [document.querySelector(".jfold-clone"), box && box.style.display !== "none" ? box : null].filter(Boolean);
  }

  // Each card names the words its description mentions, in the order of the word list. A description not in memory
  // is asked for again only when the words changed since the card's last count.
  function paintCards() {
    const list = words.map((w) => w.trim()).filter(Boolean);
    const sig = list.map((w) => w.toLowerCase()).join("\n");
    const re = pattern();
    for (const card of document.querySelectorAll('li[data-occludable-job-id], [role="button"][componentkey^="job-card-component-ref-"]')) {
      const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("componentkey").split("-").pop();
      let found = [];
      if (re && self.RLDetails) {
        const d = self.RLDetails.get(id);
        const t = self.RLDetails.text(id);
        if (d?.m?.s === sig) found = d.m.w;
        else if (t !== null) {
          const hits = new Set([...t.matchAll(re)].map((m) => m[0].toLowerCase().replace(/\s+/g, " ")));
          found = list.filter((w) => hits.has(w.toLowerCase().replace(/\s+/g, " ")));
          self.RLDetails.keep(id, { s: sig, w: found });
        } else self.RLDetails.want(id, true);
      }
      const where = card.matches("li") ? card.querySelector(".artdeco-entity-lockup__content") : textColumn(card);
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

  // The new search page's card is a row: logo, text, buttons. The text column is the smallest element holding the
  // card's first and last lines of text, leaving out the buttons' hidden labels.
  function textColumn(card) {
    const lines = [...card.querySelectorAll("span, p, strong")]
      .filter((e) => !e.children.length && e.textContent.trim() && !e.closest("button, .rl-ui"));
    if (lines.length < 2) return card;
    let col = lines[0];
    while (col && !col.contains(lines[lines.length - 1])) col = col.parentElement;
    return col && card.contains(col) ? col : card;
  }

  function tick(job) {
    paintCards();
    if (!window.CSS?.highlights) return;
    const roots = containers();
    const chips = document.querySelectorAll(".jfold-chip");
    // Recount only when the job, the words or the description's text changed.
    const sig = `${job?.id}|${version}|${roots.map((c) => c.textContent.length).join(",")}|${chips.length}`;
    if (sig === painted.sig && painted.ranges.every((r) => r.startContainer.isConnected)) return;
    const re = pattern();
    const ranges = [];
    if (re) {
      for (const root of roots) {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.parentElement?.closest(".jfold-chip, .rl-ui") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        while (tw.nextNode()) {
          const n = tw.currentNode;
          for (const m of n.data.matchAll(re)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
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
      const found = re ? [...new Set([...(chip.dataset.folded || "").matchAll(re)].map((m) => m[0].toLowerCase()))] : [];
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

  self.RLKeywords = { tick, add };
})();
