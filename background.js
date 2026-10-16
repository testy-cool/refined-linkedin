// Asks the model chosen in the settings which passages of a job description to fold, and caches the answer per job,
// text and prompt. The content script sends {type: "fold", id, text, again} and gets {sections} or {error}; "again"
// asks the model anew instead of using the saved answer. It also compares a job with the person's CV, see match().
importScripts("prompt.js", "match-prompt.js", "providers.js", "build.js", "chatgpt.js", "folds.js");
try { importScripts("config.local.js"); } catch { /* only Vlad's build seeds a provider */ }

const inflight = new Map();

// The pop-up's "Grey out" lists change here only, one change after another, so the pop-up and a LinkedIn tab that
// change a list at the same moment never write over each other. A change that fails does not stop the next one.
const LISTS = new Set(["greyCompanies", "greyTitleWords"]);
let listWrites = Promise.resolve();
// Companies are the same whatever their case, accents and punctuation, as in filters.js; title words whatever their
// case.
const same = (key) => (key === "greyCompanies"
  ? (t) => (t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  : (t) => (t || "").toLowerCase().replace(/\s+/g, " ").trim());
async function changeList({ key, add = [], remove = [] }) {
  if (!LISTS.has(key)) throw new Error(`not a list: ${key}`);
  const k = same(key);
  const gone = new Set(remove.map(k));
  const list = ((await chrome.storage.local.get(key))[key] || []).filter((w) => !gone.has(k(w)));
  const have = new Set(list.map(k));
  for (const w of add.map((x) => x.replace(/\s+/g, " ").trim())) if (w && !have.has(k(w))) { have.add(k(w)); list.push(w); }
  await chrome.storage.local.set({ [key]: list });
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.type === "hello") { checkBuild(msg.build); return; }
  if (msg.type === "list") {
    const run = listWrites.then(() => changeList(msg));
    listWrites = run.catch(() => {});
    run.then(() => send({ ok: true }), (e) => send({ error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "options") { chrome.runtime.openOptionsPage(); return; }
  if (msg.type === "settings") { settings().then((s) => send(s && { ...s, key: undefined, hasKey: !!s.key })); return true; }
  if (msg.type === "test") { test(msg.text).then(send, (e) => send({ error: String(e.message || e) })); return true; }
  if (msg.type === "match") {
    match(msg).then(send, (e) => send({ error: String(e.message || e) }));
    return true;
  }
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
      .then(async (s) => { await ready(s); return { sections: (await ask(s, fill(prompt, text))).sections, at: Date.now(), model: s.model }; })
      .then(async (r) => { await chrome.storage.local.set({ [key]: r }); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

// The prompt with the description in place of {TEXT}. A function keeps "$" in a description from being read as a
// replacement pattern.
const fill = (prompt, text) => prompt.replace("{TEXT}", () => text);

// One answer from the chosen model in the given JSON format, parsed.
async function ask(s, prompt, schema = self.SCHEMA, name = "folds") {
  if (s.kind === "chatgpt") return JSON.parse(await ChatGPT.respond({ model: s.model, effort: s.effort || "medium", prompt, schema }));
  const body = {
    model: s.model,
    reasoning_effort: s.effort || "medium",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
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
      return JSON.parse(j.choices[0].message.content);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// A job compared with the person's CV and notes (issue #57): {id, text, bullets, again, peek} gets {highlights,
// dropped} or {error}, where peek only looks for a saved answer. Each highlight is {bullet, phrase, material_quote,
// reasoning, label}. The answer is saved per job, description, bullet points and material.
async function match({ id, text, bullets, again = false, peek = false }) {
  const { aboutMe } = await chrome.storage.local.get("aboutMe");
  if (!aboutMe?.trim()) throw new Error("NO_MATERIAL");
  const key = `match:${id}:${hash([self.MATCH_PROMPT, text, ...bullets, aboutMe].join("\n"))}`;
  if (!again) {
    const got = await chrome.storage.local.get(key);
    if (got[key] || peek) return got[key] || null;
  }
  if (!inflight.has(key)) {
    const prompt = self.MATCH_PROMPT.replace("{TEXT}", () => text)
      .replace("{BULLETS}", () => bullets.map((b, i) => `${i + 1}. ${b}`).join("\n"))
      .replace("{MATERIAL}", () => aboutMe.trim());
    const p = settings()
      .then(async (s) => { await ready(s); return { ...checked(await ask(s, prompt, self.MATCH_SCHEMA, "highlights"), bullets, aboutMe), at: Date.now(), model: s.model }; })
      .then(async (r) => { await chrome.storage.local.set({ [key]: r }); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

// Only what can be found stays: a phrase must be in its bullet point, and a MATCH or UNWANTED must quote the
// material. Case, spaces, curly quotes and a quote's last full stop do not count.
function checked(answer, bullets, material) {
  const squash = (t) => (t || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, "").replace(/[.,;:]+$/, "");
  const all = squash(material);
  const highlights = (answer.highlights || []).filter((h) => {
    const b = bullets[h.bullet - 1];
    const phrase = squash(h.phrase);
    return b && phrase && squash(b).includes(phrase) && ["MATCH", "GAP", "UNWANTED"].includes(h.label)
      && (h.label === "GAP" || (squash(h.material_quote) && all.includes(squash(h.material_quote))));
  });
  return { highlights, dropped: (answer.highlights || []).length - highlights.length };
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
