// Which jobs in a list go grey, from the switches and lists under "Grey out" in the toolbar pop-up (issue #53): jobs
// that aren't remote, reposts, jobs with over 100 applicants, promoted jobs, jobs applied to, jobs from a listed
// company and jobs with a listed word in their title. With "Hide them instead" on, those jobs leave the list, and so
// do jobs dismissed with LinkedIn's own ×. content.js asks for each card's reasons as it paints the lists.
(() => {
  const KEYS = ["remoteOnly", "greyReposts", "greyCrowded", "greyPromoted", "greyApplied", "hideGrey", "greyCompanies",
    "greyTitleWords"];
  const CROWDED = 100; // a job with more applicants than this counts as crowded
  let s = {};
  const listeners = [];
  const links = new Set(); // the company links on the page, see companyLink
  const changed = () => {
    for (const b of links) if (b.isConnected) b.draw(); else links.delete(b);
    listeners.forEach((f) => f());
  };

  chrome.storage.local.get(KEYS).then((r) => { s = r; changed(); });
  chrome.storage.onChanged.addListener((ch) => {
    if (!KEYS.some((k) => k in ch)) return;
    for (const k of KEYS) if (k in ch) s[k] = ch[k].newValue;
    changed();
  });

  // Letters only, in lower case and without accents, so "Wolt " and "wolt" are one company.
  const norm = (t) => (t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const hasCompany = (name) => !!name && (s.greyCompanies || []).some((c) => norm(c) === norm(name));

  // The first listed word the title holds as a whole word, any case: "Intern" finds "Product Intern" but not
  // "International". Its punctuation counts, so "C++" never finds "C#".
  const plain = (t) => (t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  function titleWord(title) {
    const t = plain(title);
    return (s.greyTitleWords || []).find((w) => plain(w) && new RegExp(`(?<![\\p{L}\\p{N}])${esc(plain(w))}(?![\\p{L}\\p{N}])`, "u").test(t));
  }

  // Why a card goes grey, as short labels; none means it stays white. card holds what content.js read off it:
  // {title, company, promoted, applied, remote: false when its job is known not to be remote, repost, d: the job's
  // data from details.js}. A label of null greys the card without adding words, where the card already says why.
  function reasons(card) {
    const out = [];
    if (s.remoteOnly && card.remote === false) out.push(null);
    if (s.greyReposts && card.repost) out.push(null);
    const a = card.d?.a;
    if (s.greyCrowded && a?.n > CROWDED) out.push(a.s.toLowerCase());
    if (s.greyPromoted && card.promoted) out.push(null);
    if (s.greyApplied && card.applied) out.push(null);
    if (hasCompany(card.company)) out.push("company you greyed out");
    const w = titleWord(card.title);
    if (w) out.push(`title has "${w}"`);
    return out;
  }

  // The words to show for a card's reasons, or "" when the card already shows them.
  const label = (list) => [...new Set(list.filter(Boolean))].join(" · ");

  // The list is changed by background.js, one change after another, so a click here and a change in the pop-up
  // never write over each other.
  function setCompany(name, on) {
    try {
      chrome.runtime.sendMessage({ type: "list", key: "greyCompanies", [on ? "add" : "remove"]: [name] }).catch(() => {});
    } catch { /* the extension was updated; this page reloads */ }
  }

  // "Grey out jobs from Wolt" under the open job, as a switch that is on while that company is in the list.
  function companyLink(company) {
    if (!company) return null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rl-switch rl-company-link";
    b.setAttribute("role", "switch");
    const track = document.createElement("span");
    track.className = "rl-track";
    b.append(`Grey out jobs from ${company}`, track);
    b.draw = () => { b.setAttribute("aria-checked", String(hasCompany(company))); };
    b.draw();
    links.add(b);
    b.addEventListener("click", (e) => { e.stopPropagation(); setCompany(company, !hasCompany(company)); });
    return b;
  }

  self.RLFilters = {
    reasons, label, companyLink,
    get hide() { return !!s.hideGrey; },
    get counts() { return !!s.greyCrowded; },
    onChange: (f) => listeners.push(f),
  };
})();
