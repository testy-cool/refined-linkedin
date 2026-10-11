# Jobathan for LinkedIn

A Chrome extension for LinkedIn job pages. It folds each job description down to the responsibilities and
what is expected of the candidate, and greys out jobs already seen.

- **Folding.** The open job's description goes to Luna 6 (`azure/gpt-6-luna`, medium) through the Bifrost
  API with the prompt in `../research/linkedin-descriptions/scripts/luna_prompt.md`. Luna answers with
  regexes for the passages to fold; the page wraps them in grey "folded" chips that open on click. A check
  keeps any folded line about years of experience, degrees, must-haves or language levels visible. The
  answer is cached per job and text, so a job is asked about once (about 10 seconds the first time).

- **Seen.** A job counts as seen once it has been open a second and was clicked or typed in, or opened
  as its own page. LinkedIn opens the first search result by itself; that alone does not count. Jobs are
  remembered by id and by title plus employer, so a repost under a new id is recognised too. Seen jobs are
  greyed out in the classic search, the collections, the new search-results page and the "More jobs"
  cards; an open job seen before says "Seen before, <date>".

Where each LinkedIn hook comes from: `../research/linkedin-descriptions/LINKEDIN-DOM.md`.

## Build and load

`./build.sh` writes `prompt.js` from the research prompt and `config.local.js` with the Bifrost key from
the `llm` key store (git-ignored). Then load this folder in `chrome://extensions` with "Load unpacked".
Rerun `./build.sh` and press reload on the extension after changing the prompt.
