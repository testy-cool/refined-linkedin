# Refined LinkedIn privacy policy

Last updated: 16 October 2026.

Refined LinkedIn is a Chrome extension that folds LinkedIn job descriptions down to the responsibilities and
expectations, and marks jobs you already looked at. It has no server of its own. This page says what it keeps,
what it sends, and to whom.

## What it sends, and to whom

- **The text of a job description you open on LinkedIn.** It goes to the AI service you chose in the settings, so
  the AI can say which parts to fold. Nothing is sent until you tick "I agree to send the job descriptions I open
  to the AI service I choose" in the settings. Untick it to stop.
- **What you wrote under About you, with a job's description, when you compare the job with your CV.** It goes
  to the same AI service, so the AI can say which bullet points your CV shows and which it doesn't. Nothing is sent
  unless you wrote something there, and only when you click "Compare with my CV", or for every job you open if you
  ticked that.
- The AI service is the one you pick:
  - **ChatGPT**, through OpenAI's "Sign in with ChatGPT", using your own Plus or Pro plan. OpenAI's privacy policy
    applies: https://openai.com/policies/privacy-policy
  - **Google Gemini**, with your own API key. Google's terms apply: https://ai.google.dev/gemini-api/terms
  - **Another AI service** that you set up by typing its address. That service's own policy applies.
- Each answer is saved on your computer, so a job is sent once. It is sent again only if you click "fold again"
  or "compare again", change what you wrote under About you or your folding prompt, or install a version of the
  extension that asks the AI something different.
- When you sign in with ChatGPT, the extension talks to OpenAI (`auth.openai.com`) to sign you in, and keeps you
  signed in.
- **Requests to LinkedIn for the jobs in a list.** To show when each job was first posted, and which of your
  highlight words its description mentions, the extension asks LinkedIn for each listed job's data, from your
  browser and with your LinkedIn session, as LinkedIn's own pages do when you open a job. These requests go to
  LinkedIn only. The extension keeps two dates, the words found, and the job's description, title, employer and
  place, on your computer.
- **Requests to LinkedIn for applicant counts.** Only while "Jobs with over 100 applicants" is ticked, the extension
  also asks LinkedIn's public page for each listed job how many people applied. These requests go to LinkedIn only,
  and the extension keeps the count.
- Nothing else is sent anywhere. The extension has no analytics, no tracking and no ads, and it does not send the
  other pages you visit, your notes or your highlight words to anyone.

## What it keeps on your computer

Everything below stays in Chrome's storage for the extension on your computer. Refined LinkedIn never sends it
anywhere.

- Your settings: which AI service you chose, its address and model, your API key if you entered one, and what to
  grey out or hide in job lists, including the companies and title words you listed.
- If you signed in with ChatGPT: the sign-in tokens OpenAI issued, and the email address of your ChatGPT account,
  to show who is signed in.
- Your notes on jobs and on passages of their descriptions.
- Your highlight words.
- What you wrote under About you: your CV and notes about yourself. When you load your CV from a file, the file is
  read on your computer and only its text is kept here; the file itself is never sent anywhere.
- The jobs you looked at: each job's LinkedIn id, title, employer, and when you saw it, to grey it out in lists.
- For each job that appeared in a list: its LinkedIn id, when it was first posted, when it was last listed, whether
  it is remote, hybrid or on-site, which of your highlight words its description mentions, and how many people
  applied, if you asked for that.
- The description, title, employer, place and kind of work of each job you opened or that appeared in a list, so you
  can download them all as one file from the settings.
- The AI's answers for jobs you opened, so they fold again, and show what matches your CV, without being sent.
- Your own instructions for the AI, if you changed them.

## What it never does

- It does not sell or share your data.
- It does not use your data for advertising, for credit decisions, or for anything other than folding job
  descriptions, comparing them with your CV and marking the jobs you saw.
- Nobody else, including the people who make it, can read your data. It only exists on your computer and,
  for job descriptions and what you wrote under About you, at the AI service you chose.

## Removing your data

- Untick the box in the settings to stop sending job descriptions.
- Sign out of ChatGPT in the settings to delete the sign-in tokens.
- Remove the extension in `chrome://extensions` to delete everything it stored.

## Not affiliated with LinkedIn

Refined LinkedIn is an independent, open-source project. It is not made, endorsed or supported by LinkedIn or
Microsoft.

## Contact

Questions and problems: https://github.com/testy-cool/refined-linkedin/issues
