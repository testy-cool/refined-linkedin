// The settings page: which provider, key and model fold the descriptions. Saved to chrome.storage.local as
// "provider" and read by the background for every new job.
const $ = (id) => document.getElementById(id);

// Chrome keeps the manifest an unpacked extension was loaded with until it reloads, while this page is read from
// disk. When the two differ, the extension reloads once for that manifest and the background reopens this page, so
// the permissions this page asks for are declared.
(async () => {
  const pick = (m) => JSON.stringify([m.version, m.permissions, m.host_permissions, m.optional_host_permissions]);
  const disk = pick(await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json());
  if (disk === pick(chrome.runtime.getManifest())) return;
  const { reloadedForManifest } = await chrome.storage.local.get("reloadedForManifest");
  if (reloadedForManifest === disk) return;
  await chrome.storage.local.set({ reloadedForManifest: disk, reopenOptions: true });
  chrome.runtime.reload();
})();

for (const [kind, p] of Object.entries(PROVIDERS)) $("kind").append(new Option(p.label, kind));

let saved = null; // what the background is using now, without its key

function show(kind, fill) {
  const p = PROVIDERS[kind];
  $("baseRow").hidden = kind !== "custom";
  $("keyRow").hidden = kind === "chatgpt";
  $("modelRow").hidden = kind === "chatgpt";
  $("chatgptRow").hidden = kind !== "chatgpt";
  if (kind === "chatgpt") showChatGPT();
  const [before, url] = (p.keyHint || "").split(/(https:\/\/\S+)/);
  $("keyHint").replaceChildren(before);
  if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.textContent = url.replace("https://", ""); $("keyHint").append(a); }
  if (fill) { $("base").value = p.base || ""; $("model").value = p.model; }
  $("key").placeholder = saved?.kind === kind && saved.hasKey ? "Saved; type a new one to replace it" : "";
}

$("kind").addEventListener("change", () => show($("kind").value, true));

// Signed in: who, and the models that account may use. Signed out: what signing in does.
async function showChatGPT() {
  const { signedIn, email } = await ChatGPT.status();
  $("signIn").hidden = signedIn;
  $("signOut").hidden = !signedIn;
  $("chatgptModelRow").hidden = !signedIn;
  if (!signedIn) {
    $("chatgptState").textContent = "Folds use your ChatGPT Plus or Pro plan, with no API key. OpenAI asks you to sign in and to allow Refined LinkedIn to use your plan.";
    return;
  }
  $("chatgptState").textContent = `Signed in to ChatGPT as ${email || "your account"}. Folds use your plan's allowance.`;
  try {
    const list = await ChatGPT.models();
    const want = saved?.kind === "chatgpt" ? saved.model : "";
    $("chatgptModel").replaceChildren(...list.map((m) => new Option(m.name, m.slug, false, m.slug === want)));
  } catch (e) {
    $("chatgptState").textContent += ` The model list did not load: ${e.message === "NO_SIGNIN" ? "sign in again" : e.message}`;
  }
}

$("signIn").addEventListener("click", async () => {
  const result = $("result");
  result.className = "";
  // Chrome asks for access to OpenAI's addresses only inside the click.
  const granted = await chrome.permissions.request({ origins: ChatGPT.ORIGINS }).catch((e) => e);
  if (granted !== true) {
    result.className = "bad";
    result.textContent = granted instanceof Error ? `Chrome refused access to OpenAI: ${granted.message}` : "Chrome did not allow calls to OpenAI.";
    return;
  }
  result.textContent = "Signing in, in a new tab…";
  const here = await chrome.tabs.getCurrent();
  try {
    const { email } = await ChatGPT.signIn();
    result.className = "ok";
    result.textContent = `Signed in as ${email || "your account"}. Choose a model, then Save and test.`;
  } catch (e) {
    result.className = "bad";
    result.textContent = e.message;
  }
  if (here) chrome.tabs.update(here.id, { active: true });
  showChatGPT();
});

$("signOut").addEventListener("click", async () => {
  await ChatGPT.signOut();
  $("result").className = "";
  $("result").textContent = "Signed out of ChatGPT.";
  showChatGPT();
});

// The prompt box shows the saved prompt or the default one; the test description starts as the sample.
chrome.storage.local.get("prompt").then(({ prompt }) => { $("promptBox").value = prompt || self.PROMPT; });
$("sample").value = Folds.SAMPLE;
$("defaultPrompt").addEventListener("click", () => { $("promptBox").value = self.PROMPT; });

// The test description with the folded passages greyed out.
function preview(text, sections) {
  const parts = [];
  let at = 0;
  for (const [a, b] of Folds.spans(text, sections)) {
    parts.push(text.slice(at, a));
    const f = document.createElement("span");
    f.className = "folded";
    f.textContent = text.slice(a, b);
    parts.push(f);
    at = b;
  }
  parts.push(text.slice(at));
  $("previewText").replaceChildren(...parts);
  $("preview").hidden = false;
}

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
  const base = kind === "custom" ? $("base").value.trim() : PROVIDERS[kind].base || "";
  const result = $("result");
  result.className = "";
  $("preview").hidden = true;
  const prompt = $("promptBox").value.trim();
  if (!prompt.includes("{TEXT}")) { result.className = "bad"; result.textContent = "The prompt needs {TEXT} where the job description goes."; return; }
  if (kind === "chatgpt" && !(await ChatGPT.status()).signedIn) { result.className = "bad"; result.textContent = "Sign in with ChatGPT first."; return; }
  if (kind === "chatgpt" && !$("chatgptModel").value) { result.className = "bad"; result.textContent = "Choose a model first."; return; }
  if (kind !== "chatgpt") {
    if (!/^https:\/\/[^/]+/.test(base)) { result.className = "bad"; result.textContent = "The API address must start with https://"; return; }
    // A custom address needs permission to reach its host; Chrome asks only inside the click.
    const granted = await chrome.permissions.request({ origins: [`${new URL(base).origin}/*`] }).catch(() => false);
    if (!granted) { result.className = "bad"; result.textContent = `Chrome did not allow calls to ${new URL(base).host}.`; return; }
  }

  const { provider: old } = await chrome.storage.local.get("provider");
  const typed = $("key").value.trim();
  const key = typed || (old && old.kind === kind ? old.key : "");
  const model = kind === "chatgpt" ? $("chatgptModel").value : $("model").value.trim() || PROVIDERS[kind].model || "";
  await chrome.storage.local.set({ provider: { kind, base, key, model, effort: $("effort").value } });
  // The default prompt is not saved, so a newer default reaches everyone who did not change it.
  if (prompt === self.PROMPT.trim()) await chrome.storage.local.remove("prompt");
  else await chrome.storage.local.set({ prompt });
  const sample = $("sample").value.trim() || Folds.SAMPLE;
  $("key").value = "";

  $("save").disabled = true;
  result.textContent = "Testing on the test description…";
  chrome.runtime.sendMessage({ type: "test", text: sample }, (r) => {
    $("save").disabled = false;
    if (!r || r.error) {
      result.className = "bad";
      result.textContent = r?.error === "NO_KEY" ? "Saved, but there is no API key yet."
        : r?.error === "NO_ACCESS" ? "Saved, but Chrome has not allowed calls to that address."
        : r?.error === "NO_SIGNIN" ? "Saved, but you are not signed in with ChatGPT." : `Saved, but the test failed: ${r ? r.error : "no answer"}`;
      return;
    }
    saved = { kind, hasKey: true, model };
    result.className = "ok";
    result.textContent = `Saved. ${r.model} answered in ${r.seconds} s and named ${r.passages} passage${r.passages === 1 ? "" : "s"} to fold.`;
    preview(sample, r.sections);
    show(kind, false);
  });
});
