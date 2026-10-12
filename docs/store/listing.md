# Chrome Web Store listing

The item: `gindiffhjdbhhgjdlcgeoakfcjcclabh`, in the testycool publisher's developer console.

What goes into each field of the developer console for Refined LinkedIn. Upload `dist/refined-linkedin-<version>-store.zip`
from `./package.sh --store`; the summary comes from `description` in `manifest.json`.

## Store listing

**Description:**

```
LinkedIn's job search wastes your time, and I'm convinced it's on purpose.

Go through the first ten pages of results, refresh, and start over: in my experience, about 90% of the jobs are ones you've already opened. Almost every description starts with a long story about the company, and after twenty listings you're done with that. Then you click "see more" and dig through dense bullet points where everything looks fine at a glance, until one line says you're not a fit.

I built Refined LinkedIn to fix that:
- Jobs you've already opened turn grey in the list, with how long ago you saw them. Reposts under a new link still count.
- Each job's age is coloured, from green for a day old to red for two months.
- An AI folds the company story, the perks and the small print into grey lines, so you read what the job is and what they want from you. You never click "see more". Lines about years of experience, degrees and languages always stay visible, and a click on a grey line opens it.
- Words you care about, like "remote" or "Python", show up in blue.
- If you only want remote jobs, the hybrid and on-site ones LinkedIn lists anyway can turn grey too.
- You can leave a note on a job, or on a single sentence.
- Every job you open or scroll past is kept on your computer, with its description, and you can download them all as one file.

To set up the AI, sign in with your ChatGPT account (Plus or Pro), or paste an API key for Gemini or any OpenAI-compatible service. I use GPT-6 Luna on medium effort. The folding isn't perfect, but it does the job well enough.

It's free and open source, and none of your data comes to me. Notes and history stay in your browser. Job descriptions go only to the AI you choose, and only after you tick a box in the settings.

Anyone can contribute, and feedback is welcome: https://github.com/testy-cool/refined-linkedin

Not made or endorsed by LinkedIn, and I'd like to keep it that way.
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
| `unlimitedStorage` | The list of seen jobs, the descriptions of the jobs the user met and the saved answers grow with every job; without it, Chrome's limit on local storage would eventually drop them. |
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
  agree; and the descriptions of jobs the user opened or saw in a list, kept on the computer so the user can
  download them.

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
