// The toolbar pop-up: the words to highlight in job descriptions, and the way to the settings.
const $ = (id) => document.getElementById(id);

async function draw() {
  const { keywords = [] } = await chrome.storage.local.get("keywords");
  $("words").replaceChildren(...keywords.map((w) => {
    const li = document.createElement("li");
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.title = `Stop highlighting ${w}`;
    x.setAttribute("aria-label", x.title);
    x.addEventListener("click", async () => {
      const { keywords: now = [] } = await chrome.storage.local.get("keywords");
      await chrome.storage.local.set({ keywords: now.filter((k) => k !== w) });
    });
    li.append(w, x);
    return li;
  }));
  $("empty").hidden = keywords.length > 0;
}

$("add").addEventListener("submit", async (e) => {
  e.preventDefault();
  await RLKeywords.add($("word").value.split(","));
  $("word").value = "";
});
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((ch) => { if (ch.keywords) draw(); });
draw();
$("word").focus();
