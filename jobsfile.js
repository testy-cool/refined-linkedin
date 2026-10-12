// The settings page's "Download my jobs": everything the extension keeps about the jobs a person met, one entry per
// job, newest first. Built from all of chrome.storage.local: "job:<id>" (LinkedIn's description, title, employer,
// place), "page:<id>" (the open job's text as the page showed it), "seen" (when it was opened), "details" and
// "posted" (when LinkedIn posted it, and the words found), "notes", and the model's latest answer under
// "fold:<id>:…", turned into the passages it folded.
self.JobsFile = (() => {
  const iso = (t) => (t ? new Date(t).toISOString() : null);

  function build(all) {
    const seen = all.seen?.ids || {}, details = all.details || {}, notes = all.notes || {}, posted = all.posted || {};
    const kept = {}, pages = {}, folds = {};
    for (const [k, v] of Object.entries(all)) {
      let m;
      if ((m = k.match(/^(job|page):(\d+)$/))) (m[1] === "job" ? kept : pages)[m[2]] = v;
      else if ((m = k.match(/^fold:(\d+):/)) && v?.sections && (v.at || 0) >= (folds[m[1]]?.at || 0)) folds[m[1]] = v;
    }
    const noted = Object.keys(notes).filter((id) => notes[id]?.job?.text || notes[id]?.marks?.length);
    const ids = new Set([...Object.keys(seen), ...Object.keys(kept), ...Object.keys(pages), ...noted]);
    const jobs = [...ids].map((id) => {
      const s = seen[id] || {}, k = kept[id] || {}, p = pages[id] || {}, d = details[id] || {}, n = notes[id] || {};
      const text = p.text || k.text || null;
      const shown = [k.at, p.at].filter(Boolean);
      return {
        id,
        link: `https://www.linkedin.com/jobs/view/${id}/`,
        title: k.title || s.t || n.t || null,
        company: k.company || s.c || n.c || null,
        place: k.place || null,
        workplace: k.workplace || null,
        type: k.type || null,
        first_shown: iso(shown.length ? Math.min(...shown) : null),
        opened: iso(s.first),
        last_opened: iso(s.last),
        posted: iso(d.l || posted[id]),
        first_posted: iso(d.o),
        words: d.m?.w || [],
        note: n.job?.text || null,
        passage_notes: (n.marks || []).map((m) => ({ passage: m.quote, note: m.note })),
        description: text,
        folded: text && folds[id] ? Folds.spans(text, folds[id].sections).map(([a, b]) => text.slice(a, b)) : [],
      };
    });
    const t = (x) => (x ? Date.parse(x) : 0);
    const when = (j) => Math.max(t(j.last_opened || j.opened), t(j.first_shown));
    jobs.sort((a, b) => when(b) - when(a));
    return { exported: new Date().toISOString(), jobs };
  }

  return { build };
})();
