# Refined LinkedIn

A Chrome extension for LinkedIn job pages. It folds each job description down to the responsibilities and
what is expected of the candidate, and greys out jobs already seen.

- **Folding.** The open job's description goes to the model chosen on the settings page (the toolbar icon
  opens it): Google Gemini (`gemini-3.8-flash`) or any other OpenAI-compatible API, all asked the same way, with
  the prompt in `../research/linkedin-descriptions/scripts/luna_prompt.md`. "Save and test" folds a short sample
  to prove the key works; saving a custom address asks Chrome for access to that host. Vlad's build seeds his
  Bifrost (Luna 6, `azure/gpt-6-luna`) as such a custom API. The model answers with
  regexes for the passages to fold. The page hides those lines in a copy of LinkedIn's own description, so
  what stays keeps its bullets, bold and spacing, and a grey "folded" chip opens each hidden run in place. A check
  keeps any folded line about years of experience, degrees, must-haves or language levels visible. The
  answer is cached per job and text, so a job is asked about once (about 10 seconds the first time).

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
