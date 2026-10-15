// The toolbar pop-up: the words to highlight in job descriptions, what to grey out in job lists (see filters.js), and
// the way to the settings. Each list and switch is saved in chrome.storage.local under its data-key.
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
}
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((ch) => { for (const key of LISTS) if (ch[key]) draw(key); });
LISTS.forEach(draw);
$("word").focus();
