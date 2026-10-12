// The settings page's "Download my jobs": everything the extension keeps about the jobs a person met, one entry per
// job, newest first. Built from all of chrome.storage.local: "job:<id>" (description, title, employer, place),
// "seen" (when it was opened), "details" (when LinkedIn posted it, and the words found), "notes", and the model's
// latest answer under "fold:<id>:…", turned into the passages it folded.
self.JobsFile = (() => {
  const iso = (t) => (t ? new Date(t).toISOString() : null);

  function build(all) {
    const seen = all.seen?.ids || {}, details = all.details || {}, notes = all.notes || {}, posted = all.posted || {};
    const kept = {}, folds = {};
    for (const [k, v] of Object.entries(all)) {
      let m;
      if ((m = k.match(/^job:(\d+)$/))) kept[m[1]] = v;
      else if ((m = k.match(/^fold:(\d+):/)) && (v?.at || 0) >= (folds[m[1]]?.at || 0)) folds[m[1]] = v;
    }
    const noted = Object.keys(notes).filter((id) => notes[id]?.job?.text || notes[id]?.marks?.length);
    const ids = new Set([...Object.keys(seen), ...Object.keys(kept), ...noted]);
    const jobs = [...ids].map((id) => {
      const s = seen[id] || {}, k = kept[id] || {}, d = details[id] || {}, n = notes[id] || {};
      const text = k.text || null;
      const folded = text && folds[id] ? Folds.spans(text, folds[id].sections).map(([a, b]) => text.slice(a, b)) : [];
      return {
        id,
        link: `https://www.linkedin.com/jobs/view/${id}/`,
        title: k.title || s.t || n.t || null,
        company: k.company || s.c || n.c || null,
        place: k.place || null,
        workplace: k.workplace || null,
        type: k.type || null,
        first_shown: iso(k.at),
        opened: iso(s.first),
        last_opened: iso(s.last),
        posted: iso(d.l || posted[id]),
        first_posted: iso(d.o),
        words: d.m?.w || [],
        note: n.job?.text || null,
        passage_notes: (n.marks || []).map((m) => ({ passage: m.quote, note: m.note })),
        description: text,
        folded,
      };
    });
    const t = (x) => (x ? Date.parse(x) : 0);
    const when = (j) => Math.max(t(j.last_opened || j.opened), t(j.first_shown));
    jobs.sort((a, b) => when(b) - when(a));
    return { exported: new Date().toISOString(), jobs };
  }

  return { build };
})();
