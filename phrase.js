// Finding a highlight's phrase in its bullet point (issues #57 and #61), shared by the background, which keeps only
// phrases it can find, and match.js, which underlines them. Case, curly quotes and the amount of space do not count,
// and a phrase's last full stop or comma is dropped. A phrase matches whole words only, so "AI" is not found inside
// "Maintain", and "Go" is not found in "g o".
self.Phrase = (() => {
  const fold = (c) => { const l = c.toLowerCase(); return [...l].length === 1 ? l.replace(/[‘’]/g, "'").replace(/[“”]/g, '"') : c; };
  // Letters, digits and the accents that combine with them belong to a word.
  const word = (c) => /[\p{L}\p{N}\p{M}]/u.test(c);
  // A text as its characters without spaces, each folded, marked with whether space came before it, and with its
  // position and length in the text, in UTF-16 units as the page's ranges count them.
  function chars(text) {
    const out = [];
    let gap = true;
    for (let i = 0; i < text.length;) {
      const ch = String.fromCodePoint(text.codePointAt(i));
      if (/\s/.test(ch)) gap = true;
      else { out.push({ c: fold(ch), gap, at: i, size: ch.length }); gap = false; }
      i += ch.length;
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
      // A letter or digit right against either end means the phrase is part of a longer name, as "C++" in
      // "C++Builder" or "AI" in "Maintain".
      const before = seq[i - 1], after = seq[i + p.length];
      if (before && !seq[i].gap && word(before.c)) continue;
      if (after && !after.gap && word(after.c)) continue;
      return { start: i, length: p.length };
    }
    return null;
  }
  return { chars, find };
})();
