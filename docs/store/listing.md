# Chrome Web Store listing

What goes into each field of the developer console for Refined LinkedIn. Upload `dist/refined-linkedin-<version>-store.zip`
from `./package.sh --store`; the summary comes from `description` in `manifest.json`.

## Store listing

**Description:**

```
LinkedIn job posts bury the job under the company pitch, the perks and the legal text. Refined LinkedIn folds those parts away, so you see what you would do and what is expected of you.

What you get:
• Only the job. Each hidden part becomes one grey line that says how many words it hides. Click it to read the part. Lines about years of experience, degrees or language levels stay visible.
• Your words, highlighted. Keep a list such as "remote", "German" or "SQL", and they show in blue in every description.
• Notes that stay with the job. Note a whole job, or select a sentence and note that. Hover the note icon in the job list to read them without opening the job.
• Seen jobs stay seen. Jobs you opened turn grey in every list, with the time you saw them, even when the job is reposted under a new link.
• Fresh or stale at a glance. Each job's age is coloured from green (a day old) to red (two months).

You choose the AI that folds: your ChatGPT Plus or Pro plan (just sign in, no key), a Google Gemini key, or another OpenAI-compatible service. You can read and change the instructions it follows.

Private by design: nothing is sent until you agree in the settings. Then only the text of each job description you open goes to the AI you chose, once. Your notes, words and history stay in Chrome on your computer. There is no Refined LinkedIn server.

Free and open source: https://github.com/testy-cool/refined-linkedin

Refined LinkedIn is an independent project, not made or endorsed by LinkedIn or Microsoft.
```

**Category:** Workflow & Planning. **Language:** English.

**Images,** in `docs/store/`: the icon is `icons/icon128.png`; screenshots 1 to 4 (1280×800); small promo tile
`promo-small-440x280.png`.

**Homepage and support:** https://github.com/testy-cool/refined-linkedin and
https://github.com/testy-cool/refined-linkedin/issues

## Privacy practices

**Single purpose:**

```
Make LinkedIn job listings quicker to read: fold each job description down to its responsibilities and expectations, and mark the jobs the user has already seen.
```

**Permission justifications:**

| Permission | Why |
|---|---|
| `storage` | Saves the user's settings, notes, highlight words, the jobs they saw, and the AI's answers, on their computer. |
| `unlimitedStorage` | The list of seen jobs and the saved answers grow with every job opened; without it, Chrome's limit on local storage would eventually drop them. |
| Host `https://www.linkedin.com/*` | The extension works on LinkedIn job pages: it folds the open job's description, greys out seen jobs, colours posting ages and shows notes. |
| Host `https://generativelanguage.googleapis.com/*` | Sends the open job's description to Google Gemini, when the user chose Gemini and agreed to sending descriptions. |
| Optional host `https://*/*` | Asked for one address at a time, only when the user saves the address of their own OpenAI-compatible AI service, or signs in with ChatGPT (auth.openai.com, api.openai.com). The extension never asks for all sites. |
| Optional host `http://127.0.0.1/*` | OpenAI's "Sign in with ChatGPT" sends the user back to http://127.0.0.1:1455/auth/callback. The extension reads the sign-in code from that tab's address; it runs no server. |

**Remote code:** No, I am not using remote code.

**Data usage,** what to tick:

- **Personally identifiable information:** the email address of the user's ChatGPT account, kept on the computer to
  show who is signed in.
- **Authentication information:** the user's API key or ChatGPT sign-in tokens, kept on the computer and sent only to
  the AI service they belong to.
- **Web history:** the LinkedIn jobs the user opened (id, title, employer, time), kept on the computer to grey them
  out.
- **Website content:** the text of job descriptions the user opens, sent to the AI service the user chose, after they
  agree.

Tick all three certifications: no selling or transfer for unrelated purposes, no use unrelated to the single purpose,
no use for creditworthiness or lending.

**Privacy policy:** https://github.com/testy-cool/refined-linkedin/blob/main/PRIVACY.md

## Distribution

Free. Public. All regions.
