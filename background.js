// Asks the model chosen in the settings which passages of a job description to fold, and caches the answer per job
// and text. The content script sends {type: "fold", id, text} and gets {sections} or {error}.
importScripts("prompt.js", "providers.js", "build.js");
try { importScripts("config.local.js"); } catch { /* only Vlad's build has a Bifrost key baked in */ }

const inflight = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.type === "hello") { checkBuild(msg.build); return; }
  if (msg.type === "options") { chrome.runtime.openOptionsPage(); return; }
  if (msg.type === "settings") { settings().then((s) => send(s && { ...s, key: undefined, hasKey: !!s.key })); return true; }
  if (msg.type === "test") { test().then(send, (e) => send({ error: String(e.message || e) })); return true; }
  if (msg.type !== "fold") return;
  fold(msg.id, msg.text).then(send, (e) => send({ error: String(e.message || e) }));
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The saved provider. On Vlad's build, which has a Bifrost key baked in, Bifrost with that key until he saves another.
async function settings() {
  const { provider } = await chrome.storage.local.get("provider");
  if (provider) {
    if (!provider.key && provider.kind === "bifrost" && self.BIFROST_KEY) return { ...provider, key: self.BIFROST_KEY, keyFromBuild: true };
    return provider;
  }
  if (self.BIFROST_KEY) {
    return { kind: "bifrost", base: PROVIDERS.bifrost.base, model: PROVIDERS.bifrost.model, effort: "medium", key: self.BIFROST_KEY, keyFromBuild: true };
  }
  return null;
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

async function fold(id, text) {
  const key = `fold:${id}:${hash(text)}`;
  const got = await chrome.storage.local.get(key);
  if (got[key]) return got[key];
  if (!inflight.has(key)) {
    const p = settings()
      .then((s) => { if (!s?.key) throw new Error("NO_KEY"); return ask(s, text); })
      .then(async (r) => { await chrome.storage.local.set({ [key]: r }); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

async function ask(s, text) {
  const body = {
    model: s.model,
    reasoning_effort: s.effort || "medium",
    messages: [{ role: "user", content: self.PROMPT.replace("{TEXT}", text) }],
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

// The settings page's "Save and test": one real fold of a short made-up description.
const SAMPLE = `About us
Acme Bakeries Software has helped 2,000 bakeries since 2009 and is proud of its friendly culture.

What you will do
- Run discovery with bakery owners and turn it into a roadmap.
- Write specifications with the engineering team.

What we expect
- 3+ years as a product manager.
- Fluent English.

What we offer
- 25 days of leave, a gym card and team trips.
- We are an equal opportunity employer.`;

async function test() {
  const s = await settings();
  if (!s?.key) throw new Error("NO_KEY");
  const started = Date.now();
  const r = await ask(s, SAMPLE);
  return { passages: r.sections.length, seconds: Math.round((Date.now() - started) / 100) / 10, model: s.model };
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
  const { reloadTabs } = await chrome.storage.local.get("reloadTabs");
  if (!reloadTabs) return;
  await chrome.storage.local.remove("reloadTabs");
  for (const t of await chrome.tabs.query({ url: "https://www.linkedin.com/*" })) chrome.tabs.reload(t.id);
}
chrome.runtime.onInstalled.addListener(reloadTabsAfterUpdate);
reloadTabsAfterUpdate();
