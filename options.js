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

// Nothing is sent to an AI service until this box is ticked; unticking it stops folding again.
chrome.storage.local.get("consent").then(({ consent }) => { $("consent").checked = !!consent; });
$("consent").addEventListener("change", () => chrome.storage.local.set({ consent: $("consent").checked }));

// About you (issue #57): the CV and notes a job is compared with, and whether each job is compared as it opens.
// Saved as you type.
chrome.storage.local.get(["aboutMe", "matchAuto"]).then(({ aboutMe, matchAuto }) => {
  $("aboutMe").value = aboutMe || "";
  $("matchAuto").checked = !!matchAuto;
});
let aboutTimer = 0;
$("aboutMe").addEventListener("input", () => {
  clearTimeout(aboutTimer);
  aboutTimer = setTimeout(async () => {
    await chrome.storage.local.set({ aboutMe: $("aboutMe").value });
    $("aboutSaved").textContent = "Saved.";
  }, 500);
});
$("matchAuto").addEventListener("change", () => chrome.storage.local.set({ matchAuto: $("matchAuto").checked }));

// Load my CV from a file (issue #59): the file's text replaces the box and is saved, with an Undo that puts the
// earlier text back. Only the latest file chosen may fill the box, and the Undo stays until another file loads.
let cvRun = 0;
let cvUndo = null;
function cvState(message) {
  $("cvState").replaceChildren(message);
  if (cvUndo === null) return;
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "link";
  undo.textContent = "Undo";
  undo.addEventListener("click", async () => {
    const run = ++cvRun; // a file still being read no longer fills the box
    const text = cvUndo;
    cvUndo = null;
    clearTimeout(aboutTimer);
    $("aboutMe").value = text;
    await chrome.storage.local.set({ aboutMe: text });
    if (run === cvRun) cvState("Put the earlier text back.");
  });
  $("cvState").append(" ", undo);
}
async function loadCV(file) {
  const run = ++cvRun;
  cvState(`Reading ${file.name}…`);
  let cv;
  try {
    cv = await readCV(file);
  } catch (e) {
    if (run === cvRun) cvState(e.message);
    return;
  }
  if (run !== cvRun) return;
  clearTimeout(aboutTimer); // a save still waiting from typing would write over the file's text
  const before = $("aboutMe").value;
  if (before !== cv.text) cvUndo = before.trim() ? before : null; // the same text again keeps the Undo it had
  $("aboutMe").value = cv.text;
  $("aboutMe").scrollTop = 0;
  await chrome.storage.local.set({ aboutMe: cv.text });
  if (run !== cvRun) return;
  const pages = cv.pages ? `${cv.pages} ${cv.pages === 1 ? "page" : "pages"} of ` : "";
  cvState(`Loaded ${pages}text from ${file.name}. Check it, then add what the CV leaves out.`);
}
$("cvLoad").addEventListener("click", () => $("cvFile").click());
$("cvFile").addEventListener("change", () => {
  const file = $("cvFile").files[0];
  $("cvFile").value = "";
  if (file) loadCV(file);
});
$("aboutMe").addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
$("aboutMe").addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  e.preventDefault();
  loadCV(file);
});

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
  if (!$("consent").checked) { result.className = "bad"; result.textContent = "Tick the box at the top to allow sending job descriptions."; return; }
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

// "Download my jobs": everything kept about the jobs, as one JSON file.
const jobsFile = async () => JobsFile.build(await chrome.storage.local.get(null));
jobsFile().then(({ jobs }) => {
  const described = jobs.filter((j) => j.description).length;
  $("jobsCount").textContent = `${jobs.length} job${jobs.length === 1 ? "" : "s"} so far, ${described} with ${described === 1 ? "its" : "their"} description.`;
});
$("download").addEventListener("click", async () => {
  const file = await jobsFile();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  a.download = `refined-linkedin-jobs-${file.exported.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});
