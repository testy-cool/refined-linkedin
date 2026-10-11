# Refined LinkedIn privacy policy

Last updated: 12 October 2026.

Refined LinkedIn is a Chrome extension that folds LinkedIn job descriptions down to the responsibilities and
expectations, and marks jobs you already looked at. It has no server of its own. This page says what it keeps,
what it sends, and to whom.

## What it sends, and to whom

- **The text of a job description you open on LinkedIn.** It goes to the AI service you chose in the settings, so
  the AI can say which parts to fold. Nothing is sent until you tick "I agree to send the job descriptions I open
  to the AI service I choose" in the settings. Untick it to stop.
- The AI service is the one you pick:
  - **ChatGPT**, through OpenAI's "Sign in with ChatGPT", using your own Plus or Pro plan. OpenAI's privacy policy
    applies: https://openai.com/policies/privacy-policy
  - **Google Gemini**, with your own API key. Google's terms apply: https://ai.google.dev/gemini-api/terms
  - **Another AI service** that you set up by typing its address. That service's own policy applies.
- Each answer is saved on your computer, so a job is sent once. It is sent again only if you click "fold again".
- When you sign in with ChatGPT, the extension talks to OpenAI (`auth.openai.com`) to sign you in, and keeps you
  signed in.
- Nothing else is sent anywhere. The extension has no analytics, no tracking and no ads, and it does not send the
  other pages you visit, your notes or your highlight words to anyone.

## What it keeps on your computer

Everything below stays in Chrome's storage for the extension on your computer. Refined LinkedIn never sends it
anywhere.

- Your settings: which AI service you chose, its address and model, and your API key if you entered one.
- If you signed in with ChatGPT: the sign-in tokens OpenAI issued, and the email address of your ChatGPT account,
  to show who is signed in.
- Your notes on jobs and on passages of their descriptions.
- Your highlight words.
- The jobs you looked at: each job's LinkedIn id, title, employer, and when you saw it, to grey it out in lists.
- The AI's answers for jobs you opened, so they fold again without being sent.
- Your own instructions for the AI, if you changed them.

## What it never does

- It does not sell or share your data.
- It does not use your data for advertising, for credit decisions, or for anything other than folding job
  descriptions and marking the jobs you saw.
- Nobody else, including the people who make it, can read your data. It only exists on your computer and,
  for job descriptions, at the AI service you chose.

## Removing your data

- Untick the box in the settings to stop sending job descriptions.
- Sign out of ChatGPT in the settings to delete the sign-in tokens.
- Remove the extension in `chrome://extensions` to delete everything it stored.

## Not affiliated with LinkedIn

Refined LinkedIn is an independent, open-source project. It is not made, endorsed or supported by LinkedIn or
Microsoft.

## Contact

Questions and problems: https://github.com/testy-cool/refined-linkedin/issues
