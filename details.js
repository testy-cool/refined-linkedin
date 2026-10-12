// LinkedIn's own data for each job in the lists. A card shows the date of the job's latest repost, so a job first
// posted four months ago can read "20 hours ago"; the data keeps both dates. It also holds the description, which
// keywords.js reads for the person's words. The data is asked for one job at a time, only for cards on the page.
// The dates and the words found are kept, so a job is asked about once; the description stays in memory only, and
// a job is asked about again when the words change and its description is no longer in memory.
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
      // The headers LinkedIn's own pages send with these requests; csrf-token is the JSESSIONID cookie.
      const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)"?/) || [])[1];
      const r = await fetch(`/voyager/api/jobs/jobPostings/${id}?decorationId=com.linkedin.voyager.deco.jobs.web.shared.WebFullJobPosting-65`,
        { headers: { "csrf-token": csrf, accept: "application/json", "x-restli-protocol-version": "2.0.0" }, credentials: "include" });
      if (r.status === 429 || r.status === 999) {
        pausedUntil = Date.now() + PAUSE_MS;
        wait = PAUSE_MS;
        queue.unshift(id);
      } else if (r.ok) {
        const j = await r.json();
        const d = j.data || j;
        if (d.listedAt) {
          details[id] = { ...details[id], l: d.listedAt, o: Math.min(d.originalListedAt || d.listedAt, d.listedAt) };
          texts[id] = d.description?.text || "";
          delete wanted[id];
          dirty = true;
          changed();
        }
      }
      // Any other answer, such as a job taken down, stays in wanted, so it is not asked again until the next page
      // load.
    } catch { /* offline or blocked: the same */ }
    busy = false;
    setTimeout(pump, wait);
  }

  // Several scripts repaint when an answer arrives.
  const listeners = [];
  changed = () => listeners.forEach((f) => f());

  self.RLDetails = { get, text, want, keep, onChange: (f) => listeners.push(f) };
})();
