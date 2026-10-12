// When each job in the lists was first posted. A card shows the date of the job's latest repost, so a job first
// posted four months ago can read "20 hours ago"; LinkedIn's own data for the job keeps both dates. The data is
// asked for one job at a time, only for cards on the page, and kept, so each job is asked about once.
(() => {
  const GAP_MS = 800;
  const PAUSE_MS = 10 * 60 * 1000; // after LinkedIn turns a request away
  const STALE_MS = 5000; // a card not seen on the page for this long is dropped from the queue

  let details = {}; // job id -> {l: when it was last listed, o: when it was first listed}
  let loaded = false;
  let dirty = false;
  const queue = [];
  const wanted = {}; // job id -> when a card last asked for it
  let busy = false;
  let pausedUntil = 0;
  let changed = () => {};

  chrome.storage.local.get("details").then((r) => { details = { ...r.details, ...details }; loaded = true; changed(); pump(); });
  setInterval(() => { if (dirty) { dirty = false; chrome.storage.local.set({ details }); } }, 3000);

  const get = (id) => details[id] || null;

  function want(id) {
    if (!id || details[id]) return;
    if (!(id in wanted)) queue.push(id);
    wanted[id] = Date.now();
    pump();
  }

  async function pump() {
    if (busy || !loaded || Date.now() < pausedUntil) return;
    let id;
    while ((id = queue.shift())) {
      if (details[id]) continue;
      if (Date.now() - wanted[id] < STALE_MS) break;
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
          details[id] = { l: d.listedAt, o: Math.min(d.originalListedAt || d.listedAt, d.listedAt) };
          dirty = true;
          changed();
        }
      }
      // Any other answer, such as a job taken down, is left alone until the next page load.
    } catch { /* offline or blocked: the same */ }
    busy = false;
    setTimeout(pump, wait);
  }

  self.RLDetails = { get, want, onChange: (f) => { changed = f; } };
})();
