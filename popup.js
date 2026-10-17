// The toolbar pop-up: whether an AI service is ready, the switch to compare every job opened, the words to highlight
// in job descriptions, what to grey out in job lists (see filters.js), and the way to the settings. Each list and
// switch is saved in chrome.storage.local under its data-key.
const $ = (id) => document.getElementById(id);
const LISTS = ["keywords", "greyCompanies", "greyTitleWords"];

async function draw(key) {
  const { [key]: list = [] } = await chrome.storage.local.get(key);
  document.querySelector(`ul[data-key="${key}"]`).replaceChildren(...list.map((w) => {
    const li = document.createElement("li");
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.title = `Remove ${w}`;
    x.setAttribute("aria-label", x.title);
    x.addEventListener("click", () => change(async () => {
      if (key !== "keywords") return askBackground(key, { remove: [w] });
      const { [key]: now = [] } = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: now.filter((k) => k !== w) });
    }));
    li.append(w, x);
    return li;
  }));
  const empty = document.querySelector(`[data-empty="${key}"]`);
  if (empty) empty.hidden = list.length > 0;
}

// Changes to a list run one after another, so a quick add and remove never write over each other. One that fails
// does not stop the next.
let writing = Promise.resolve();
function change(f) {
  const run = writing.then(f);
  writing = run.catch(() => {});
  return run;
}

// The "Grey out" lists are changed by background.js, which a LinkedIn tab's "Grey out jobs from" link uses too.
async function askBackground(key, change) {
  const r = await chrome.runtime.sendMessage({ type: "list", key, ...change });
  if (r?.error) throw new Error(r.error);
}

// Adds entries, skipping ones already there. Highlight words go through keywords.js, which does the same.
function add(key, entries) {
  return change(() => (key === "keywords" ? RLKeywords.add(entries) : askBackground(key, { add: entries })));
}

for (const form of document.querySelectorAll("form.add")) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    // A company name can hold a comma ("Acme, Inc."), so only words are split at commas.
    await add(form.dataset.key, form.dataset.key === "greyCompanies" ? [input.value] : input.value.split(","));
    input.value = "";
  });
}
for (const box of document.querySelectorAll("input[type=checkbox][data-key]")) {
  chrome.storage.local.get(box.dataset.key).then((r) => { box.checked = !!r[box.dataset.key]; });
  box.addEventListener("change", () => chrome.storage.local.set({ [box.dataset.key]: box.checked }));
  // The settings page and a job list's bar change some of these too.
  chrome.storage.onChanged.addListener((ch) => { if (ch[box.dataset.key]) box.checked = !!ch[box.dataset.key].newValue; });
}
// The settings, at the section asked for (see options.js).
const openSettings = (section) => chrome.runtime.sendMessage({ type: "options", section });
$("settings").addEventListener("click", () => openSettings());
$("aboutLink").addEventListener("click", () => openSettings("about"));

// The gear: a wheel with eight flat teeth, the same as on a LinkedIn page.
$("cog").setAttribute("d", (() => {
  const pt = (r, a) => `${(8 + r * Math.cos(a)).toFixed(2)} ${(8 + r * Math.sin(a)).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d += `${i ? "L" : "M"}${pt(5, a - 0.3)} L${pt(6.6, a - 0.2)} L${pt(6.6, a + 0.2)} L${pt(5, a + 0.3)} `;
  }
  return d + "Z";
})());

// Whether folds and comparisons work now, or what they need first. The background runs the same check a fold does
// and answers with the saved provider, without its key.
const NEEDS = {
  NO_CONSENT: "not allowed to send job descriptions yet",
  NO_KEY: "no API key yet",
  NO_ACCESS: "Chrome has not allowed calls to its address yet",
  NO_SIGNIN: "signed out",
};
async function status() {
  const [{ aboutMe }, r] = await Promise.all([chrome.storage.local.get("aboutMe"),
    chrome.runtime.sendMessage({ type: "ready" }).catch((e) => ({ error: String(e.message || e) }))]);
  $("noCV").hidden = !!aboutMe?.trim();
  const s = r?.provider;
  const name = s && PROVIDERS[s.kind] ? PROVIDERS[s.kind].label.replace(/,.*/, "") : "";
  let state = "needs", words;
  if (!s) { state = r?.error ? "needs" : "none"; words = r?.error ? `No answer from the extension: ${r.error}` : "No AI service chosen"; }
  else if (!r.error) { state = "ready"; words = `${name} · ${s.model}`; }
  else if (/^choose a ChatGPT model/.test(r.error)) words = `${name}: no model chosen`;
  else words = `${name}: ${NEEDS[r.error] || r.error}`;
  $("status").dataset.state = state;
  const text = [words];
  if (state !== "ready") {
    const fix = document.createElement("button");
    fix.type = "button";
    fix.className = "link";
    fix.textContent = "Set up";
    fix.addEventListener("click", () => openSettings("ai"));
    text.push(" · ", fix);
  }
  $("statusText").replaceChildren(...text);
}
status();
chrome.storage.onChanged.addListener((ch) => { if (ch.consent || ch.provider || ch.chatgpt || ch.aboutMe) status(); });
chrome.permissions.onAdded.addListener(status);
chrome.permissions.onRemoved.addListener(status);
chrome.storage.onChanged.addListener((ch) => { for (const key of LISTS) if (ch[key]) draw(key); });
LISTS.forEach(draw);
$("word").focus();
