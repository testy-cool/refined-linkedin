// Shared by the LinkedIn page, the settings page and the background: where the model's answer lands in the
// description's text, the hash its saved answers are filed under, and the sample description the settings page
// tests on.
self.Folds = (() => {
  // A line inside a fold that states a hard requirement stays visible. Luna folded "Minimum 3 years of
  // experience" on one of two identical ING postings, so this check runs after it.
  const LANGS = "English|German|French|Romanian|Spanish|Italian|Dutch|Polish|Portuguese";
  const KEEP = new RegExp([
    `fluen(t|cy) (in )?(${LANGS})`, `(${LANGS})[^.\\n]{0,30}\\b(fluen|proficien|[ABC][12]\\b|native)`, "native speaker",
    "\\d+\\+? years?( of| in|['’]|\\s)+(relevant |professional |hands-on )?experience",
    "years of (relevant |professional )?experience", "must[- ]have", "\\bdegree\\b", "bachelor", "master['’]?s\\b",
    "security clearance", "driving licen[cs]e",
  ].join("|"), "i");

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

  // Saved answers are filed as "fold:<job id>:<hash of the text>", with ":<hash of the prompt>" for an edited prompt.
  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }

  // A short made-up description for testing a provider or a prompt in the settings.
  const SAMPLE = `About us
Acme Bakeries Software has helped 2,000 bakeries since 2009 and is proud of its friendly culture.

What you will do
- Run discovery with bakery owners and turn it into a roadmap.
- Write specifications with the engineering team.

What we expect
- 3+ years as a product manager.
- Fluent English.

What we offer
- 25 days of leave, a gym card and team trips.
- We are an equal opportunity employer.`;

  return { spans, hash, SAMPLE };
})();
