# Refined LinkedIn

A Chrome extension for LinkedIn job pages. It folds each job description down to the responsibilities and
what is expected of the candidate, and greys out jobs already seen.

- **Folding.** The open job's description goes to the model chosen on the settings page (the toolbar icon
  opens it): Google Gemini (`gemini-3.8-flash`), ChatGPT with the person's own Plus or Pro plan, or any other
  OpenAI-compatible API, all asked for the same JSON. The default prompt is
  `../research/linkedin-descriptions/scripts/luna_prompt.md`; anyone can edit it on the settings page, where
  `{TEXT}` marks the description and "Restore the default prompt" brings it back. Only an edited prompt is
  saved, so a newer default reaches everyone else. "Save and test" folds the test description (a short sample,
  or any pasted one) and greys out what would fold; saving a custom address asks Chrome for access to that host. Vlad's build seeds his
  Bifrost (Luna 6, `azure/gpt-6-luna`) as such a custom API. The model answers with
  regexes for the passages to fold. The page hides those lines in a copy of LinkedIn's own description, so
  what stays keeps its bullets, bold and spacing, and a grey "folded" chip opens each hidden run in place. A check
  keeps any folded line about years of experience, degrees, must-haves or language levels visible. The
  answer is cached per job, text and prompt, so a job is asked about once (about 10 seconds the first time);
  "fold again" on the job's fold line asks anew, and "try again" appears when folding failed. The shared
  mapping from answer to text, and the sample, are in `folds.js`.

- **Seen.** A job counts as seen once it has been open a second and was clicked or typed in, or opened
  as its own page. LinkedIn opens the first search result by itself; that alone does not count. Jobs are
  remembered by id and by title plus employer, so a repost under a new id is recognised too. Seen jobs are
  greyed out in the classic search, the collections, the new search-results page and the "More jobs"
  cards; an open job seen before says "Seen before, <date>".

- **Posting age.** "2 weeks ago" next to a job is coloured from green (a day old) through yellow (two
  weeks) and orange (a month) to red (two months or more), on job pages, search cards and the top card.

Where each LinkedIn hook comes from: `../research/linkedin-descriptions/LINKEDIN-DOM.md`.

## Build and load

`./build.sh` writes `prompt.js` from the research prompt and, for Vlad's copy, `config.local.js`, which seeds
his Bifrost with the key from the `llm` key store (git-ignored; without it the settings page asks for a
provider). Then load this folder in `chrome://extensions` with "Load unpacked".
Rerun `./build.sh` after any change. It also writes `build.js`, a stamp of every file the extension runs.
Chrome keeps running the files an unpacked extension was loaded with, and `crxctl reload` (a disable and
enable) does not reread them. So each LinkedIn page reports the stamp it was loaded with, and when
`build.js` on disk differs, the extension reloads itself and the open LinkedIn tabs, once per build. This
needs developer mode on in `chrome://extensions`, which loading it unpacked already requires.

## ChatGPT with a Plus or Pro plan

"Sign in with ChatGPT" on the settings page follows OpenAI's flow for open-source and personal local apps
(https://developers.openai.com/siwc/token-sharing-open-source). The first sign-in registers this installation with
OpenAI as an app called Refined LinkedIn, and the person allows it to use their plan; folds then go to
`https://api.openai.com/v1/responses` with their access token, `store: false` and `stream: true`, and count against
their plan, not API billing. OpenAI only accepts a callback on `http://127.0.0.1:<port>/auth/callback`, and an
extension cannot listen on a port, so the settings page watches the sign-in tab and reads the code from the address
OpenAI sends it to. The ID token is checked against OpenAI's published keys. Tokens refresh on their own; a refused
refresh asks for a new sign-in. Everything is in `chatgpt.js`.

Giving the extension to other people needs it to be open source, or OpenAI's approval for private or paid apps.

## Notes

A note can be left on a whole job, and on any passage of its description: select text, click "Add note" next to
the selection, and write. The open job shows its notes under the Apply and Save buttons, the job's note first, then
each passage with its note; the passages stay highlighted in the description, folded or original. A passage is found
again by its characters without whitespace and the 32 around it, so it survives LinkedIn's line breaks and the
folded copy. In the job list, a job with notes shows a note icon with their count; hovering it shows them, whichever
job is open. Notes are kept in `chrome.storage.local` under `notes`, by job id.

