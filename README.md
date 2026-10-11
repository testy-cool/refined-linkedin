# Refined LinkedIn 🪗

**LinkedIn job descriptions, folded down to the job.**

A LinkedIn job post buries the job under the company pitch, the perks and the legal text. Refined LinkedIn is a
Chrome extension that folds those parts away, so you see what you would do and what they expect from you. It also
remembers which jobs you already opened.

![A LinkedIn job description folding: the company pitch collapses into one grey line, which opens and closes with a click](docs/images/fold.gif)

## What you get

- **Only the job.** Each hidden part becomes one grey line that says how many words it hides and how they start.
  Click the line to read the part. A line at the top sums it up: "Folded 3 parts, 65% of the description". Lines
  about years of experience, degrees or language levels stay visible even inside a fold.
- **Your words, highlighted.** Keep a list such as "remote", "German" or "SQL", and they show in blue in every
  description. If one is inside a folded part, its grey line says so: "· mentions remote".
- **Notes that stay with the job.** Write a note on a job, or select a sentence in the description and attach a
  note to it. Your notes sit under the Apply button, and the job list shows a note icon you can hover without
  opening the job.
- **Seen jobs stay seen.** Jobs you opened turn grey in every list, with the time you saw them: "👁 3 days ago".
  If a company reposts the job under a new link, it still shows as seen.
- **Fresh or stale at a glance.** Each job's age runs from green (a day old) through yellow and orange to red
  (two months).
- **You choose the AI that folds.** Use your ChatGPT Plus or Pro plan, a Google Gemini account, or another AI
  service. You can read and change the instructions the AI follows, and try them out in the settings.

**Notes under the Apply button**

![Notes under a job's Apply button](docs/images/notes.png)

**Seen jobs greyed out, ages in colour, and a job's notes on hover**

![The job list with seen jobs greyed and a note shown on hover](docs/images/list.png)

**Your words, in the pop-up behind the toolbar icon**

![The toolbar pop-up listing highlight words](docs/images/popup.png)

## Install

Refined LinkedIn is not in the Chrome Web Store yet, so Chrome loads it from a folder on your computer.

1. Download the `.zip` file from the [latest release](https://github.com/testy-cool/refined-linkedin/releases/latest).
   Its name starts with `refined-linkedin-`.
2. Unzip it somewhere you will keep it, such as your `Documents` folder. Chrome runs the extension from that
   folder, so do not delete it.
3. In Chrome's address bar, type `chrome://extensions` and press Enter.
4. Turn on **Developer mode**, the switch at the top right. It lets Chrome load an extension from a folder.
5. Click **Load unpacked** and pick the folder you unzipped, the one that contains `manifest.json`.
6. Pin the extension: click the puzzle piece next to the address bar, then the pin next to Refined LinkedIn.
7. The settings open by themselves. Tick **I agree to send the job descriptions I open to the AI service I
   choose**, then choose the AI that folds the descriptions:
   - **ChatGPT, with your Plus or Pro plan**: click **Sign in with ChatGPT**, then sign in on the OpenAI page that
     opens and allow Refined LinkedIn to use your plan. Then pick a model from the list. No key needed.
   - **Google Gemini**: paste a key from [Google AI Studio](https://aistudio.google.com/apikey).
   - **Other OpenAI-compatible API**: its address, key and model.

   Then click **Save and test**.
8. Open any job on LinkedIn. After a few seconds the description shows a grey line where each part was folded,
   like the animation above.

**Updating:** download and unzip the new version, then click **Load unpacked** again and pick the new folder.
Chrome replaces the old version and keeps your notes, words and history. You can then delete the old folder.

## What leaves your browser

- Nothing is sent until you tick the box at the top of the settings. Untick it to stop.
- The text of a job description you open goes to the AI you chose, once. The extension keeps the answer, so it
  sends that job again only if you click **fold again**.
- Nothing else is sent anywhere. Your notes, your words, the jobs you saw and your settings stay in Chrome on your
  computer. There is no Refined LinkedIn server.
- Without an AI chosen, everything except folding still works.

## Good to know

- It works in Chrome on a computer. Other browsers built on Chromium may work, but have not been tried.
- LinkedIn changes its pages often. If something stops working, please
  [open an issue](https://github.com/testy-cool/refined-linkedin/issues).
- Each fold uses some of your ChatGPT plan's usage, if you fold with ChatGPT.

## More

- [What's new](CHANGELOG.md), version by version.
- [How it works, and how to build it](docs/DEVELOPMENT.md).
- Free and open source, under the [MIT licence](LICENSE).
