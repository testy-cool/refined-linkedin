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
    x.addEventListener("click", async () => {
      const { [key]: now = [] } = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: now.filter((k) => k !== w) });
    });
    li.append(w, x);
    return li;
  }));
  const empty = document.querySelector(`[data-empty="${key}"]`);
  if (empty) empty.hidden = list.length > 0;
}

// Adds entries, skipping ones already there in any case. Highlight words go through keywords.js, which does the same.
async function add(key, entries) {
  if (key === "keywords") return RLKeywords.add(entries);
  const { [key]: list = [] } = await chrome.storage.local.get(key);
  const have = new Set(list.map((w) => w.toLowerCase()));
  const fresh = entries.map((w) => w.replace(/\s+/g, " ").trim()).filter((w) => w && !have.has(w.toLowerCase()) && have.add(w.toLowerCase()));
  if (fresh.length) await chrome.storage.local.set({ [key]: [...list, ...fresh] });
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
