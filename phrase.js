// Finding a highlight's phrase in its bullet point (issues #57 and #61), shared by the background, which keeps only
// phrases it can find, and match.js, which underlines them. Case, curly quotes and the amount of space do not count,
// and a phrase's last full stop or comma is dropped. A phrase matches whole words only, so "AI" is not found inside
// "Maintain", and "Go" is not found in "g o".
self.Phrase = (() => {
  const fold = (c) => { const l = c.toLowerCase(); return l.length === 1 ? l.replace(/[‘’]/g, "'").replace(/[“”]/g, '"') : c; };
  const word = (c) => /[\p{L}\p{N}]/u.test(c);
  // A text as its characters without spaces, each folded and marked with whether space came before it. Several
  // pieces of text, such as a bullet point's text nodes, read as one when passed one after another.
  function chars(...texts) {
    const out = [];
    let gap = true;
    for (const text of texts) {
      for (const ch of text) {
        if (/\s/.test(ch)) gap = true;
        else { out.push({ c: fold(ch), gap }); gap = false; }
      }
    }
    return out;
  }
  // Where a phrase starts in chars(), and how many characters it covers, or null.
  function find(seq, phrase) {
    const p = chars(phrase);
    while (p.length && /[.,;:]/.test(p[p.length - 1].c)) p.pop();
    if (!p.length) return null;
    next: for (let i = 0; i + p.length <= seq.length; i++) {
      for (let k = 0; k < p.length; k++) {
        if (seq[i + k].c !== p[k].c) continue next;
        // Between two letters or digits, a space must be where the phrase has one.
        if (k && word(p[k - 1].c) && word(p[k].c) && seq[i + k].gap !== p[k].gap) continue next;
      }
      const first = seq[i], last = seq[i + p.length - 1], before = seq[i - 1], after = seq[i + p.length];
      if (before && !first.gap && word(before.c) && word(first.c)) continue;
      if (after && !after.gap && word(after.c) && word(last.c)) continue;
      return { start: i, length: p.length };
    }
    return null;
  }
  return { chars, find };
})();
