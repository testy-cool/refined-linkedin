// Words each person wants to spot at once (issue #9): highlighted wherever they appear in the open job's
// description, folded copy or original, and named on any fold chip that hides them. The words are set in the
// toolbar pop-up or from a selection's "Highlight word", and saved in chrome.storage.local as "keywords".
// content.js calls RLKeywords.tick on every pass.
(() => {
  let words = [];
  let version = 0;
  let painted = { sig: "", ranges: [] };

  chrome.storage.local.get("keywords").then((r) => { words = r.keywords || []; version++; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.keywords) { words = ch.keywords.newValue || []; version++; } });

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

  function tick(job) {
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
