// The model providers the settings page offers. Gemini and custom APIs speak the OpenAI chat completions format, so
// one request shape serves them; Gemini's is Google's OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai).
// Any other gateway, Vlad's Bifrost included, is an "Other OpenAI-compatible API". ChatGPT is a sign-in with the
// person's own Plus or Pro plan, in chatgpt.js.
self.PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    keyHint: "Create a key at https://aistudio.google.com/apikey",
    about: "Needs an API key from Google AI Studio. Google offers a free tier.",
  },
  chatgpt: {
    label: "ChatGPT, with your Plus or Pro plan",
    model: "",
    about: "Sign in with your ChatGPT account. No API key.",
  },
  custom: {
    label: "Other OpenAI-compatible API",
    base: "",
    model: "",
    keyHint: "The API's key, sent as a Bearer token",
    about: "Any service that speaks OpenAI's chat format, with its address and key.",
  },
};
