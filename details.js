// LinkedIn's own data for each job in the lists. A card shows the date of the job's latest repost, so a job first
// posted four months ago can read "20 hours ago"; the data keeps both dates. It also holds the description, which
// keywords.js reads for the person's words. The data is asked for one job at a time, only for cards on the page.
// The dates and the words found are kept in "details", so a job is asked about once. Each job's description, title,
// employer, place and kind of work are kept on their own, as "job:<id>", for the settings page's download. The open
// job's text as the page shows it, the text the model folds, is kept apart as "page:<id>". Each key has one writer,
// so two tabs never overwrite each other's data.
(() => {
  const GAP_MS = 800;
  const PAUSE_MS = 10 * 60 * 1000; // after LinkedIn turns a request away
  const STALE_MS = 5000; // a card not seen on the page for this long is dropped from the queue

  let details = {}; // job id -> {l: when it was last listed, o: when it was first listed, m: words found, see keep}
  const texts = {}; // job id -> description, for this page load
  let loaded = false;
  let dirty = false;
  const queue = [];
  const wanted = {}; // job id -> {at: when a card last asked for it, text: whether the description is needed}
  let busy = false;
  let pausedUntil = 0;
  let changed;

  chrome.storage.local.get("details").then((r) => { details = { ...r.details, ...details }; loaded = true; changed(); pump(); });
  setInterval(() => { if (dirty) { dirty = false; chrome.storage.local.set({ details }); } }, 3000);

  // A kept record, written whole from one answer, so a tab writing the same job at the same moment cannot leave it
  // half one answer and half the other. Only "at", when it was first kept, carries over. Written only when something
  // changed.
  let saving = Promise.resolve();
  function save(key, fields) {
    saving = saving.then(async () => {
      const old = (await chrome.storage.local.get(key))[key] || {};
      const rec = Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
      rec.at = old.at || Date.now();
      if (JSON.stringify(rec) !== JSON.stringify(old)) await chrome.storage.local.set({ [key]: rec });
    }).catch(() => { /* storage gone, such as after an update: nothing to keep it in */ });
  }

  // The open job's text, as content.js reads it from the page.
  const keepPage = (id, text) => save(`page:${id}`, { text });

  // The description's text with a line break after each paragraph and list item. LinkedIn's API sometimes leaves
  // the breaks out of the text and marks them only in its attributes. Those count an emoji as one character, where a
  // JavaScript string counts two, so each position is mapped first.
  function plain(desc) {
    const t = desc?.text || "";
    const at16 = [0];
    for (const ch of t) at16.push(at16[at16.length - 1] + ch.length);
    const ends = new Set();
    for (const a of desc?.attributes || []) {
      const e = at16[a.start + a.length];
      if (e !== undefined && /\.(Paragraph|ListItem|LineBreak)$/.test(Object.keys(a.type || {})[0] || "")) ends.add(e);
    }
    let out = "", at = 0;
    for (const e of [...ends].sort((x, y) => x - y)) {
      if (e <= at || e >= t.length) continue;
      out += t.slice(at, e);
      if (!out.endsWith("\n") && t[e] !== "\n") out += "\n";
      at = e;
    }
    return out + t.slice(at);
  }

  const get = (id) => details[id] || null;
  const text = (id) => (id in texts ? texts[id] : null);
  const done = (id) => details[id] && (!wanted[id]?.text || id in texts);

  // needText: the description is wanted too, not only the dates.
  function want(id, needText = false) {
    if (!id || (details[id] && (!needText || id in texts))) return;
    if (!(id in wanted)) queue.push(id);
    wanted[id] = { at: Date.now(), text: needText || !!wanted[id]?.text };
    pump();
  }

  // The words found in a job's description, with the word list they were looked for: {s: list, w: found}.
  function keep(id, m) {
    if (!details[id] || details[id].m?.s === m.s) return;
    details[id].m = m;
    dirty = true;
  }

  async function pump() {
    if (busy || !loaded || Date.now() < pausedUntil) return;
    let id;
    while ((id = queue.shift())) {
      if (done(id)) { delete wanted[id]; continue; }
      if (Date.now() - wanted[id].at < STALE_MS) break;
      delete wanted[id]; // its card left the page; a card showing it again asks again
    }
    if (!id) return;
    busy = true;
    let wait = GAP_MS;
    try {
      // A description kept from an earlier page answers without asking LinkedIn again.
      if (details[id] && !(id in texts)) {
        const kept = (await chrome.storage.local.get(`job:${id}`))[`job:${id}`];
        if (kept?.text) {
          texts[id] = kept.text;
          delete wanted[id];
          wait = 0;
          changed();
        }
      }
      if (!done(id)) wait = await ask(id);
    } catch { /* offline or blocked: it stays in wanted, so it is not asked again until the next page load */ }
    busy = false;
    setTimeout(pump, wait);
  }

  // Asks LinkedIn for one job's data, and says how long to wait before the next request.
  async function ask(id) {
    // The headers LinkedIn's own pages send with these requests; csrf-token is the JSESSIONID cookie.
    const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)"?/) || [])[1];
    const r = await fetch(`/voyager/api/jobs/jobPostings/${id}?decorationId=com.linkedin.voyager.deco.jobs.web.shared.WebFullJobPosting-65`,
      { headers: { "csrf-token": csrf, accept: "application/json", "x-restli-protocol-version": "2.0.0" }, credentials: "include" });
    if (r.status === 429 || r.status === 999) {
      pausedUntil = Date.now() + PAUSE_MS;
      queue.unshift(id);
      return PAUSE_MS;
    }
    // Any other answer, such as a job taken down, stays in wanted, so it is not asked again until the next page load.
    if (!r.ok) return GAP_MS;
    const j = await r.json();
    const d = j.data || j;
    if (!d.listedAt) return GAP_MS;
    details[id] = { ...details[id], l: d.listedAt, o: Math.min(d.originalListedAt || d.listedAt, d.listedAt) };
    texts[id] = plain(d.description);
    delete wanted[id];
    dirty = true;
    changed();
    const company = Object.values(d.companyDetails || {})[0];
    save(`job:${id}`, {
      title: d.title,
      company: company?.companyResolutionResult?.name || company?.companyName,
      place: d.formattedLocation,
      workplace: Object.values(d.workplaceTypesResolutionResults || {}).map((w) => w.localizedName).join(", "),
      type: d.formattedEmploymentStatus,
      text: texts[id],
    });
    return GAP_MS;
  }

  // Several scripts repaint when an answer arrives.
  const listeners = [];
  changed = () => listeners.forEach((f) => f());

  self.RLDetails = { get, text, want, keep, keepPage, onChange: (f) => listeners.push(f) };
})();
