// Asks Luna, through the Bifrost API, which passages of a job description to fold, and caches the answer per job
// and text. The content script sends {type: "fold", id, text} and gets {sections} or {error}.
importScripts("prompt.js", "config.local.js", "build.js");

const API = "https://bifrost.voidxd.cloud/v1/chat/completions";
const inflight = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.type === "hello") { checkBuild(msg.build); return; }
  if (msg.type !== "fold") return;
  fold(msg.id, msg.text).then(send, (e) => send({ error: String(e.message || e) }));
  return true;
});

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
    const p = askLuna(text)
      .then(async (r) => { await chrome.storage.local.set({ [key]: r }); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

async function askLuna(text) {
  const body = {
    model: self.MODEL,
    reasoning_effort: "medium",
    messages: [{ role: "user", content: self.PROMPT.replace("{TEXT}", text) }],
    response_format: { type: "json_schema", json_schema: { name: "folds", schema: self.SCHEMA, strict: true } },
  };
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${self.BIFROST_KEY}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Bifrost ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return { sections: JSON.parse(j.choices[0].message.content).sections, at: Date.now() };
    } catch (e) {
      last = e;
    }
  }
  throw last;
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
