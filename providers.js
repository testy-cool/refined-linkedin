// The model providers the settings page offers. Gemini and custom APIs speak the OpenAI chat completions format, so
// one request shape serves them; Gemini's is Google's OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai).
// Any other gateway, Vlad's Bifrost included, is an "Other OpenAI-compatible API". ChatGPT goes through the user's
// own Codex CLI, reached by the native messaging host in native/.
self.PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    keyHint: "Create a key at https://aistudio.google.com/apikey",
  },
  codex: {
    label: "ChatGPT, through your Codex CLI",
    host: "com.refined_linkedin.codex",
    model: "",
  },
  custom: {
    label: "Other OpenAI-compatible API",
    base: "",
    model: "",
    keyHint: "The API's key, sent as a Bearer token",
  },
};
