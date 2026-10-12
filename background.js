// Asks the model chosen in the settings which passages of a job description to fold, and caches the answer per job,
// text and prompt. The content script sends {type: "fold", id, text, again} and gets {sections} or {error}; "again"
// asks the model anew instead of using the saved answer.
importScripts("prompt.js", "providers.js", "build.js", "chatgpt.js", "folds.js");
try { importScripts("config.local.js"); } catch { /* only Vlad's build seeds a provider */ }

const inflight = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.type === "hello") { checkBuild(msg.build); return; }
  if (msg.type === "options") { chrome.runtime.openOptionsPage(); return; }
  if (msg.type === "settings") { settings().then((s) => send(s && { ...s, key: undefined, hasKey: !!s.key })); return true; }
  if (msg.type === "test") { test(msg.text).then(send, (e) => send({ error: String(e.message || e) })); return true; }
  if (msg.type !== "fold") return;
  fold(msg.id, msg.text, msg.again).then(send, (e) => send({ error: String(e.message || e) }));
  return true;
});

// The saved provider. Vlad's build seeds his Bifrost as an "Other OpenAI-compatible API", saved like any other,
// and a provider saved by an older build as "bifrost" becomes one too. The Codex CLI bridge became Sign in with
// ChatGPT.
async function settings() {
  let { provider } = await chrome.storage.local.get("provider");
  if (provider?.kind === "bifrost") provider = { ...provider, kind: "custom" };
  if (provider?.kind === "codex") provider = { ...provider, kind: "chatgpt", model: "" };
  if (!provider && self.SEED_PROVIDER) provider = self.SEED_PROVIDER;
  if (provider) await chrome.storage.local.set({ provider });
  return provider || null;
}

// Nothing goes out until the person has agreed, in the settings, to send job descriptions. ChatGPT needs a sign-in,
// which also grants access to OpenAI's addresses. An API needs a key, and a custom address is reachable only after
// Chrome grants access to its host, which happens when it is saved in the settings.
async function ready(s) {
  if (!(await chrome.storage.local.get("consent")).consent) throw new Error("NO_CONSENT");
  if (s?.kind === "chatgpt") {
    if (!(await chrome.permissions.contains({ origins: ChatGPT.ORIGINS }))) throw new Error("NO_SIGNIN");
    if (!s.model) throw new Error("choose a ChatGPT model in the Refined LinkedIn settings");
    await ChatGPT.token();
    return;
  }
  if (!s?.key) throw new Error("NO_KEY");
  if (!(await chrome.permissions.contains({ origins: [`${new URL(s.base).origin}/*`] }))) throw new Error("NO_ACCESS");
}

const hash = Folds.hash;

// The prompt in the settings, or the default one. Folds made with the default prompt keep their old cache keys.
async function promptText() {
  const { prompt } = await chrome.storage.local.get("prompt");
  return prompt || self.PROMPT;
}

async function fold(id, text, again = false) {
  const prompt = await promptText();
  const key = `fold:${id}:${hash(text)}${prompt === self.PROMPT ? "" : `:${hash(prompt)}`}`;
  if (!again) {
    const got = await chrome.storage.local.get(key);
    if (got[key]) return got[key];
  }
  if (!inflight.has(key)) {
    const p = settings()
      .then(async (s) => { await ready(s); return ask(s, fill(prompt, text)); })
      .then(async (r) => { await chrome.storage.local.set({ [key]: r }); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

// The prompt with the description in place of {TEXT}. A function keeps "$" in a description from being read as a
// replacement pattern.
const fill = (prompt, text) => prompt.replace("{TEXT}", () => text);

async function ask(s, prompt) {
  if (s.kind === "chatgpt") {
    const answer = await ChatGPT.respond({ model: s.model, effort: s.effort || "medium", prompt, schema: self.SCHEMA });
    return { sections: JSON.parse(answer).sections, at: Date.now(), model: s.model };
  }
  const body = {
    model: s.model,
    reasoning_effort: s.effort || "medium",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "folds", schema: self.SCHEMA, strict: true } },
  };
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${s.base.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.key}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        let said = t.slice(0, 200);
        try { const j = JSON.parse(t); said = (Array.isArray(j) ? j[0] : j).error?.message || said; } catch { /* not JSON */ }
        throw new Error(`${PROVIDERS[s.kind]?.label || "The API"} answered ${r.status}: ${said}`);
      }
      const j = await r.json();
      return { sections: JSON.parse(j.choices[0].message.content).sections, at: Date.now(), model: s.model };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}


// The settings page's "Save and test": one real fold of its test description with the saved prompt.
async function test(text) {
  const s = await settings();
  await ready(s);
  const started = Date.now();
  const r = await ask(s, fill(await promptText(), text || Folds.SAMPLE));
  return { sections: r.sections, passages: r.sections.length, seconds: Math.round((Date.now() - started) / 100) / 10, model: s.model || "The model" };
}

// Chrome keeps running the files an unpacked extension was loaded with, and turning it off and on does not
// reread them. Each LinkedIn page says which build it was loaded with; when build.sh has written a newer one,
// the extension reloads itself and then the LinkedIn tabs, once per build.
async function checkBuild(pageBuild) {
  const disk = (await (await fetch(chrome.runtime.getURL("build.js"), { cache: "no-store" })).text()).match(/BUILD = "(\w+)"/);
  if (!disk || disk[1] === pageBuild) return;
  const { reloadedFor } = await chrome.storage.local.get("reloadedFor");
  if (reloadedFor === disk[1]) return;
  await chrome.storage.local.set({ reloadedFor: disk[1], reloadTabs: true });
  chrome.runtime.reload();
}

async function reloadTabsAfterUpdate() {
  const { reloadTabs, reopenOptions } = await chrome.storage.local.get(["reloadTabs", "reopenOptions"]);
  if (reopenOptions) {
    await chrome.storage.local.remove("reopenOptions");
    chrome.runtime.openOptionsPage();
  }
  if (!reloadTabs) return;
  await chrome.storage.local.remove("reloadTabs");
  for (const t of await chrome.tabs.query({ url: "https://www.linkedin.com/*" })) chrome.tabs.reload(t.id);
}
chrome.runtime.onInstalled.addListener(reloadTabsAfterUpdate);
// A new install opens the settings, where the person agrees to sending descriptions and picks the AI service.
chrome.runtime.onInstalled.addListener(({ reason }) => { if (reason === "install") chrome.runtime.openOptionsPage(); });
reloadTabsAfterUpdate();
