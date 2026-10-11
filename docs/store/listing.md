# Chrome Web Store listing

The item: `gindiffhjdbhhgjdlcgeoakfcjcclabh`, in the testycool publisher's developer console.

What goes into each field of the developer console for Refined LinkedIn. Upload `dist/refined-linkedin-<version>-store.zip`
from `./package.sh --store`; the summary comes from `description` in `manifest.json`.

## Store listing

**Description:**

```
Much of a LinkedIn job post is about the company, the perks and the small print. Refined LinkedIn folds them away, so you see what the job is and what they want from you.

Open a job. A few seconds later, those parts shrink into grey lines. Each line says how many words it hides; click to open it. Lines about years of experience, degrees and languages stay visible.

Refined LinkedIn also keeps track of your search:
- Jobs you've opened turn grey in the list, with how long ago you saw them. Reposts under a new link still count as seen.
- Each job's age is coloured from green (a day old) to red (two months).
- Write a note on a job or on one passage; hover the note icon in the list to read it.
- Words you add, like "remote" or "Python", show up in blue in every description.

The folding uses an AI you pick: sign in with your ChatGPT Plus or Pro plan, paste a Google Gemini key, or connect any OpenAI-compatible service. You can change its instructions.

The extension sends nothing to the AI until you tick a box in the settings. Then only the job descriptions you open go to the AI, once per job. Notes, words and history stay on your computer. There is no Refined LinkedIn server.

Free, open source: https://github.com/testy-cool/refined-linkedin
Not made or endorsed by LinkedIn.
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

## Test instructions

Optional; the field takes 500 characters. Its "Save changes" button stayed disabled when filled from a script, so
paste it by hand if wanted.

```
Open any LinkedIn job. Without an AI service: seen jobs turn grey with the time seen, posting ages are coloured, "Add note" appears when you select text, and the toolbar icon adds highlight words. To test folding: in the settings (they open after install) tick the agreement box, choose Google Gemini, paste a free key from aistudio.google.com/apikey, and click Save and test. A job then folds parts into grey lines; click one to open it. While the box is unticked, nothing is sent.
```

## Distribution

Free. Public. All regions.
