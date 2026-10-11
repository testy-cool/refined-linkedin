# What's new in Refined LinkedIn

Newest first. Each version says what changed for someone using the extension.

## 0.7.0 (12 October 2026): asks before sending anything

- Nothing is sent to an AI service until you tick "I agree to send the job descriptions I open to the AI service I
  choose" at the top of the settings. Until then a job says where to allow it. Untick the box to stop.
- The settings open by themselves when you first install the extension.

## 0.6.0 (11 October 2026): highlight your own words

- Click the toolbar icon to keep a list of words to spot, such as "remote" or "German". Add several at once
  with commas, and remove one with ×.
- Select text in a job description and choose "Highlight word" to add it.
- Your words are highlighted in light blue in every job description.
- When one of your words is inside a folded part, the folded line says so, for example "· mentions benefits".
- The toolbar icon now opens this list. The settings are one click further, under "Settings: model and prompt".

## 0.5.0 (11 October 2026): edit the prompt, fold a job again

- The settings show the instructions the model gets for each job, and you can change them. "Restore the default
  prompt" brings the original back.
- "Save and test" folds a test description and greys out what would be folded. Paste any job description to try
  your prompt on it.
- On a job, "fold again" asks the model again instead of reusing its earlier answer. If folding fails, "try
  again" appears.
- The fold line now says what it did, for example "Folded 3 parts, 47% of the description".

## 0.4.1 (11 October 2026): settings work right after an update

- Opening the settings straight after an update no longer fails with "Chrome did not allow calls to OpenAI".
  The extension reloads itself and opens the settings again.

## 0.4.0 (11 October 2026): sign in with ChatGPT

- Choose "ChatGPT, with your Plus or Pro plan" and click "Sign in with ChatGPT". Folding then runs on your own
  ChatGPT plan, with no API key and nothing to install.
- This replaces the earlier ChatGPT option, which needed a command typed in a terminal.

## 0.3.0 (11 October 2026): notes on jobs

- Leave a note on a whole job, under its Apply and Save buttons.
- Select text in a description and click "Add note" to note that passage. It stays highlighted in yellow.
- Jobs with notes show a note icon in the job list. Hover it to read the notes without opening the job.

## 0.2.0 (11 October 2026): choose your AI provider

- A settings page to choose who folds the descriptions: Google Gemini, ChatGPT through the Codex command-line
  tool, or any OpenAI-compatible service with your own key.
- "Save and test" checks the key on a short sample.
- A job you viewed keeps its posting age, greyed out with the rest of its card, next to when you viewed it.
- The folding loader is bigger.

## 0.1.0 (11 October 2026): first version

- Folds each job description down to what you would do and what is expected of you. Everything else collapses
  into grey lines that open with a click.
- Keeps LinkedIn's bullets, bold text and spacing.
- Each folded line says how many words it hides and how it starts.
- Opens LinkedIn's "… more" for you.
- Greys out jobs you already viewed and says when, for example "👁 3 days ago".
- Colours each job's age from green (a day old) through yellow and orange to red (two months old).
- A blue loader while folding, and an icon.
