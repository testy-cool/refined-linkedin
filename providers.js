// The model providers the settings page offers. All three speak the OpenAI chat completions format, so one request
// shape serves them; Gemini's is Google's OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai).
self.PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    keyHint: "Create a key at https://aistudio.google.com/apikey",
  },
  bifrost: {
    label: "Bifrost (Azure, Luna)",
    base: "https://bifrost.voidxd.cloud/v1",
    model: "azure/gpt-6-luna",
    keyHint: "A Bifrost virtual key, starting sk-bf-",
  },
  custom: {
    label: "Other OpenAI-compatible API",
    base: "",
    model: "",
    keyHint: "The API's key, sent as a Bearer token",
  },
};
