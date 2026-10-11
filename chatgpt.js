// Sign in with ChatGPT: folds on the person's own ChatGPT Plus or Pro plan, following OpenAI's flow for open-source
// and personal local apps (developers.openai.com/siwc/token-sharing-open-source). The first sign-in registers this
// installation with OpenAI as an app; folds then go to the Responses API with the person's access token.
// The settings page runs the sign-in, because Chrome stops an idle background worker while someone types a
// password; the background refreshes tokens and folds. Saved in chrome.storage.local as "chatgpt".
self.ChatGPT = (() => {
  const AUTH = "https://auth.openai.com";
  const API = "https://api.openai.com/v1";
  // OpenAI requires a loopback address. An extension cannot listen on a port, so the sign-in tab is watched and
  // the code is read from the address it is sent to; nothing needs to answer there.
  const CALLBACK = "http://127.0.0.1:1455/auth/callback";
  const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
  const PLAN_SCOPE = "chatgpt.tokens.use.direct";
  const ORIGINS = [`${AUTH}/*`, "https://api.openai.com/*", "http://127.0.0.1/*"];
  const APP_NAME = "Refined LinkedIn";

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function saved() {
    return (await chrome.storage.local.get("chatgpt")).chatgpt || {};
  }

  // ---- sign-in, run by the settings page ------------------------------------------------------------------------

  // Opens OpenAI's page in a tab and resolves with the address OpenAI sends the tab back to.
  function openAndWait(url) {
    return new Promise((resolve, reject) => {
      let tabId = null;
      const done = (fn) => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        fn();
      };
      const onUpdated = (id, change, tab) => {
        const at = change.url || tab.url || "";
        if (id !== tabId || !at.startsWith(CALLBACK)) return;
        done(() => resolve(new URL(at)));
        chrome.tabs.remove(id).catch(() => {});
      };
      const onRemoved = (id) => {
        if (id === tabId) done(() => reject(new Error("The sign-in tab was closed before signing in finished. If OpenAI showed an error there, sign out here and sign in again.")));
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.create({ url, active: true }).then((t) => { tabId = t.id; }, (e) => done(() => reject(e)));
    });
  }

  // Checks the ID token as OpenAI's guide asks: signed by a key OpenAI publishes, issued by OpenAI to this app's
  // registration, not expired, and carrying this attempt's nonce.
  async function verifyIdToken(idToken, clientId, nonce) {
    const [h, p, sig] = String(idToken || "").split(".");
    if (!sig) throw new Error("OpenAI's answer had no ID token.");
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    const { keys } = await (await fetch(`${AUTH}/.well-known/jwks.json`)).json();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== "RS256") throw new Error("OpenAI's ID token is signed with a key it does not publish.");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`));
    const aud = [].concat(claims.aud);
    if (!ok || claims.iss !== AUTH || !aud.includes(clientId) || claims.exp * 1000 < Date.now() || claims.nonce !== nonce) {
      throw new Error("OpenAI's ID token did not check out; sign in again.");
    }
    return claims;
  }

  async function tokenRequest(fields) {
    const r = await fetch(`${AUTH}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, resource: API }),
    });
    const t = await r.text();
    let j = {};
    try { j = JSON.parse(t); } catch { /* not JSON */ }
    if (!r.ok) {
      const err = new Error(`OpenAI's sign-in answered ${r.status}: ${j.error_description || j.error || t.slice(0, 200)}`);
      err.code = j.error;
      throw err;
    }
    return j;
  }

  function record(t, base) {
    const scopes = String(t.scope || "").split(/\s+/).filter(Boolean);
    return { ...base, access: t.access_token, refresh: t.refresh_token || base.refresh, expires: Date.now() + t.expires_in * 1000, scopes };
  }

  // The whole sign-in. Each attempt has its own PKCE verifier, state and nonce; the host id is made once per
  // installation. A first sign-in registers the app ("dynamic_agent_client") and OpenAI answers with its client id.
  async function signIn() {
    const was = await saved();
    const host = was.host || `urn:uuid:${crypto.randomUUID()}`;
    if (!was.host) await chrome.storage.local.set({ chatgpt: { host } });
    const verifier = random(32), state = random(16), nonce = random(16);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const q = new URLSearchParams({ client_id: was.clientId || "dynamic_agent_client" });
    if (!was.clientId) q.set("agent_name_hint", APP_NAME);
    if (was.clientId && was.email) q.set("login_hint", was.email);
    if (was.clientId && was.idToken) q.set("id_token_hint", was.idToken);
    for (const [k, v] of Object.entries({ ext_agent_host_id: host, response_type: "code", redirect_uri: CALLBACK, scope: SCOPES,
      resource: API, state, nonce, code_challenge_method: "S256", code_challenge: challenge })) q.set(k, v);

    const back = await openAndWait(`${AUTH}/api/accounts/authorize?${q}`);
    if (back.searchParams.get("state") !== state) throw new Error("OpenAI's answer belonged to another sign-in; try again.");
    const error = back.searchParams.get("error");
    if (error) throw new Error(error === "access_denied" ? "Signing in was cancelled, or using your ChatGPT plan was not allowed." : `OpenAI answered: ${error}`);
    const issued = back.searchParams.get("client_id");
    const clientId = was.clientId || issued;
    if (!clientId || clientId === "dynamic_agent_client") throw new Error("OpenAI did not finish registering Refined LinkedIn; try again.");
    if (was.clientId && issued && issued !== was.clientId) throw new Error("OpenAI answered for a different registration; sign out and sign in again.");

    const t = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, code: back.searchParams.get("code"),
      code_verifier: verifier, redirect_uri: CALLBACK });
    const claims = await verifyIdToken(t.id_token, clientId, nonce);
    if (was.sub && was.clientId === clientId && claims.sub !== was.sub) throw new Error("That is a different ChatGPT account; sign out first to switch.");
    const r = record(t, { host, clientId, sub: claims.sub, email: claims.email || "", idToken: t.id_token });
    await chrome.storage.local.set({ chatgpt: r });
    if (!r.scopes.includes(PLAN_SCOPE)) throw new Error("Signed in, but using your ChatGPT plan was not allowed. Sign in again and allow it.");
    return { email: r.email };
  }

  // Forgets the account and its registration; the installation's host id stays, as OpenAI asks.
  async function signOut() {
    const { host } = await saved();
    await chrome.storage.local.set({ chatgpt: { host } });
  }

  // After OpenAI refuses the tokens for good: they go, the registration stays for the next sign-in.
  async function dropTokens() {
    const { host, clientId, sub, email, idToken } = await saved();
    await chrome.storage.local.set({ chatgpt: { host, clientId, sub, email, idToken } });
  }

  async function status() {
    const s = await saved();
    return { signedIn: !!(s.refresh && s.scopes?.includes(PLAN_SCOPE)), email: s.email || "" };
  }

  // ---- tokens and requests, run by the background and the settings page -----------------------------------------

  // A usable access token, refreshed a few minutes before it runs out. A refresh OpenAI refuses for good ends the
  // sign-in; a network failure leaves it alone.
  async function token() {
    const s = await saved();
    if (!s.refresh || !s.scopes?.includes(PLAN_SCOPE)) throw new Error("NO_SIGNIN");
    if (s.expires - Date.now() > 3 * 60e3) return s.access;
    try {
      const r = record(await tokenRequest({ grant_type: "refresh_token", client_id: s.clientId, refresh_token: s.refresh }), s);
      await chrome.storage.local.set({ chatgpt: r });
      return r.access;
    } catch (e) {
      if (/invalid_grant|invalid_refresh_token|token_expired|refresh_token_(expired|invalidated|reused)/.test(e.code || "")) {
        await dropTokens();
        throw new Error("NO_SIGNIN");
      }
      throw e;
    }
  }

  // The models this account may use, in OpenAI's order: [{slug, name}].
  async function models() {
    const r = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) throw new Error(`OpenAI answered ${r.status} for the model list`);
    const j = await r.json();
    return (j.models || j.data || []).filter((m) => (m.visibility ?? "list") === "list")
      .map((m) => ({ slug: m.slug || m.id, name: m.display_name || m.slug || m.id }));
  }

  // OpenAI's documented plan errors, in words a person can act on.
  function explain(status, body) {
    let j = {};
    try { j = JSON.parse(body); } catch { /* not JSON */ }
    const code = j.error?.code || "";
    if (code === "subscription_sharing_usage_limit_exceeded") return "Your ChatGPT plan's allowance for Refined LinkedIn is used up for now; see chatgpt.com/settings/usage";
    if (code === "subscription_sharing_user_not_eligible") return "This ChatGPT account cannot use its plan in other apps; a Plus or Pro plan is needed";
    if (code === "subscription_sharing_invalid_user" || status === 401) return "NO_SIGNIN";
    return `ChatGPT answered ${status}: ${j.error?.message || j.detail || body.slice(0, 200)}`;
  }

  // One streamed Responses API request with a JSON schema for the answer; returns the answer's text. The base is
  // OpenAI's API; tests pass another Responses API with its key.
  async function respond({ model, effort, prompt, schema }, base = API, bearer = null) {
    const r = await fetch(`${base}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer || await token()}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: prompt }],
        store: false,
        stream: true,
        reasoning: { effort },
        text: { format: { type: "json_schema", name: "answer", schema, strict: true } },
      }),
    });
    if (!r.ok) {
      const said = explain(r.status, await r.text());
      if (said === "NO_SIGNIN" && !bearer) await dropTokens();
      throw new Error(said);
    }
    let text = "", failure = null;
    for (const line of (await r.text()).split("\n")) {
      if (!line.startsWith("data:")) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "response.output_text.delta") text += ev.delta;
      else if (ev.type === "response.failed" || ev.type === "error") failure = ev.response?.error?.message || ev.error?.message || ev.message || "the request failed";
      else if (ev.type === "response.incomplete") failure = `the answer was cut short (${ev.response?.incomplete_details?.reason || "no reason given"})`;
    }
    if (failure) throw new Error(`ChatGPT: ${failure}`);
    return text;
  }

  return { ORIGINS, signIn, signOut, status, token, models, respond };
})();
