// What the model is asked when a job is compared with the person's CV and notes (issue #57), and the format of its
// answer. {TEXT} is the job description, {BULLETS} its bullet points left visible after folding, numbered, and
// {MATERIAL} what the person wrote under "About you" in the settings. Vlad approved this prompt on 2026-10-16.
self.MATCH_PROMPT = `You will read a job description and the candidate's own material: their
CV and notes they wrote about themselves.

Under the description is a numbered list of its bullet points. Go through
each bullet point and pick out the phrases that ask something of the
candidate or describe the work. Copy each phrase exactly from its bullet
point; a phrase can be the whole bullet point. Give each phrase one label:

MATCH: the candidate's material shows they have done this or have this.
GAP: the job asks for this and nothing in the candidate's material shows it.
UNWANTED: the candidate's notes say plainly that they do not want this.

For each phrase, fill the fields in the order given:
1. \`bullet\`: the number of its bullet point.
2. \`phrase\`: the words, copied exactly from that bullet point.
3. \`material_quote\`: the line of the candidate's material the label rests
   on, copied exactly. Leave it empty for a GAP.
4. \`reasoning\`: one sentence to the candidate, in plain words, saying why.
5. \`label\`: MATCH, GAP or UNWANTED.

Write the quote and the reasoning before you decide the label. A MATCH or
an UNWANTED without a quote that supports it is wrong. A phrase that only
shares a word with the material, such as "Python" in both, is not a MATCH
unless the material shows the candidate used it for similar work.

Example. Bullet points:
1. 5+ years of product management in B2B SaaS
2. Travel to client sites 50% of the time
3. Experience with Kubernetes

Material: "Product Manager, Acme Logistics (B2B SaaS), 2017-2024." and
"Notes: I don't want a job with a lot of travel."

Answer:
{"highlights": [
 {"bullet": 1, "phrase": "5+ years of product management in B2B SaaS",
  "material_quote": "Product Manager, Acme Logistics (B2B SaaS), 2017-2024.",
  "reasoning": "You were a B2B SaaS product manager for seven years.",
  "label": "MATCH"},
 {"bullet": 2, "phrase": "Travel to client sites 50% of the time",
  "material_quote": "I don't want a job with a lot of travel.",
  "reasoning": "Your notes say you don't want much travel.",
  "label": "UNWANTED"},
 {"bullet": 3, "phrase": "Experience with Kubernetes",
  "material_quote": "",
  "reasoning": "Nothing in your material mentions Kubernetes.",
  "label": "GAP"}
]}

<description>
{TEXT}
</description>

<bullet_points>
{BULLETS}
</bullet_points>

<material>
{MATERIAL}
</material>`;

self.MATCH_SCHEMA = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bullet: { type: "integer" },
          phrase: { type: "string" },
          material_quote: { type: "string" },
          reasoning: { type: "string" },
          label: { type: "string", enum: ["MATCH", "GAP", "UNWANTED"] },
        },
        required: ["bullet", "phrase", "material_quote", "reasoning", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["highlights"],
  additionalProperties: false,
};
