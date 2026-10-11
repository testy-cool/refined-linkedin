// The settings page: which provider, key and model fold the descriptions. Saved to chrome.storage.local as
// "provider" and read by the background for every new job.
const $ = (id) => document.getElementById(id);

for (const [kind, p] of Object.entries(PROVIDERS)) $("kind").append(new Option(p.label, kind));

let saved = null; // what the background is using now, without its key

function show(kind, fill) {
  const p = PROVIDERS[kind];
  $("baseRow").hidden = kind !== "custom";
  const [before, url] = p.keyHint.split(/(https:\/\/\S+)/);
  $("keyHint").replaceChildren(before);
  if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.textContent = url.replace("https://", ""); $("keyHint").append(a); }
  if (fill) { $("base").value = p.base; $("model").value = p.model; }
  $("key").placeholder = saved?.kind === kind && saved.keyFromBuild ? "Using the key built into this copy"
    : saved?.kind === kind && saved.hasKey ? "Saved; type a new one to replace it" : "";
}

$("kind").addEventListener("change", () => show($("kind").value, true));

chrome.runtime.sendMessage({ type: "settings" }, (s) => {
  saved = s;
  const kind = s?.kind || "gemini";
  $("kind").value = kind;
  show(kind, !s);
  if (s) { $("base").value = s.base; $("model").value = s.model; $("effort").value = s.effort || "medium"; }
  else $("effort").value = "medium";
});

$("save").addEventListener("click", async () => {
  const kind = $("kind").value;
  const base = kind === "custom" ? $("base").value.trim() : PROVIDERS[kind].base;
  const result = $("result");
  result.className = "";
  if (!/^https:\/\/[^/]+/.test(base)) { result.className = "bad"; result.textContent = "The API address must start with https://"; return; }
  // A custom address needs permission to reach its host; Chrome asks only inside the click.
  const origin = `${new URL(base).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  if (!granted) { result.className = "bad"; result.textContent = `Chrome did not allow calls to ${new URL(base).host}.`; return; }

  const { provider: old } = await chrome.storage.local.get("provider");
  const typed = $("key").value.trim();
  const key = typed || (old && old.kind === kind ? old.key : "");
  const model = $("model").value.trim() || PROVIDERS[kind].model;
  await chrome.storage.local.set({ provider: { kind, base, key, model, effort: $("effort").value } });
  $("key").value = "";

  $("save").disabled = true;
  result.textContent = "Testing on a short sample description…";
  chrome.runtime.sendMessage({ type: "test" }, (r) => {
    $("save").disabled = false;
    if (!r || r.error) {
      result.className = "bad";
      result.textContent = r?.error === "NO_KEY" ? "Saved, but there is no API key yet." : `Saved, but the test failed: ${r ? r.error : "no answer"}`;
      return;
    }
    saved = { kind, hasKey: true };
    result.className = "ok";
    result.textContent = `Saved. ${r.model} answered in ${r.seconds} s and folded ${r.passages} passage${r.passages === 1 ? "" : "s"} of the sample.`;
    show(kind, false);
  });
});
