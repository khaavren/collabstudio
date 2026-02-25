const PROVIDER_ALIASES = {
  openai: "OpenAI",
  "open ai": "OpenAI",
  anthropic: "Anthropic",
  claude: "Anthropic",
  "anthropic (claude)": "Anthropic",
  "google gemini": "Google Gemini",
  gemini: "Google Gemini",
  google: "Google Gemini",
  replicate: "Replicate",
  stability: "Stability AI",
  "stability ai": "Stability AI",
  "custom http": "Custom HTTP",
  custom: "Custom HTTP"
};

const PROVIDER_VALUES = [
  "OpenAI",
  "Anthropic",
  "Google Gemini",
  "Replicate",
  "Stability AI",
  "Custom HTTP"
];

const DEFAULT_MODELS = {
  OpenAI: "gpt-image-1",
  Anthropic: "claude-3-7-sonnet-latest",
  "Google Gemini": "gemini-2.0-flash",
  Replicate: "black-forest-labs/flux-schnell",
  "Stability AI": "stable-image-core",
  "Custom HTTP": "custom-model"
};

function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function normalizeProvider(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = PROVIDER_ALIASES[raw.toLowerCase()];
  return normalized ?? raw;
}

function isSupportedProvider(value) {
  return PROVIDER_VALUES.includes(value);
}

function defaultModelForProvider(value) {
  return DEFAULT_MODELS[value] ?? "";
}

async function fetchOpenAIModels(apiKey) {
  const timeout = withTimeout();
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: timeout.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || `OpenAI API error (${response.status}).`);
    }

    const payload = await response.json();
    return (payload?.data ?? [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    timeout.clear();
  }
}

async function fetchAnthropicModels(apiKey) {
  const timeout = withTimeout();
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      signal: timeout.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || `Anthropic API error (${response.status}).`);
    }

    const payload = await response.json();
    return (payload?.data ?? [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    timeout.clear();
  }
}

async function fetchGeminiModels(apiKey) {
  const timeout = withTimeout();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      {
        method: "GET",
        signal: timeout.signal
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || `Gemini API error (${response.status}).`);
    }

    const payload = await response.json();
    return (payload?.models ?? [])
      .map((entry) => entry?.name)
      .filter((name) => typeof name === "string" && name.length > 0)
      .map((name) => name.replace(/^models\//, ""))
      .sort((a, b) => a.localeCompare(b));
  } finally {
    timeout.clear();
  }
}

async function fetchReplicateModels(apiKey) {
  const timeout = withTimeout();
  try {
    const response = await fetch("https://api.replicate.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`
      },
      signal: timeout.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || `Replicate API error (${response.status}).`);
    }

    const payload = await response.json();
    return (payload?.results ?? [])
      .map((entry) => {
        const owner = entry?.owner;
        const name = entry?.name;
        if (typeof owner !== "string" || typeof name !== "string") return null;
        return `${owner}/${name}`;
      })
      .filter((id) => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    timeout.clear();
  }
}

async function fetchStabilityModels(apiKey) {
  const timeout = withTimeout();
  try {
    const response = await fetch("https://api.stability.ai/v1/engines/list", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: timeout.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || `Stability API error (${response.status}).`);
    }

    const payload = await response.json();
    return (payload ?? [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    timeout.clear();
  }
}

async function discoverModels(provider, apiKey) {
  if (!apiKey || !provider) {
    return {
      ok: false,
      models: [],
      message: "Provider and API key are required."
    };
  }

  if (provider === "Custom HTTP") {
    return {
      ok: true,
      models: [],
      message: "Custom HTTP does not support automatic model discovery."
    };
  }

  let models = [];
  if (provider === "OpenAI") {
    models = await fetchOpenAIModels(apiKey);
  } else if (provider === "Anthropic") {
    models = await fetchAnthropicModels(apiKey);
  } else if (provider === "Google Gemini") {
    models = await fetchGeminiModels(apiKey);
  } else if (provider === "Replicate") {
    models = await fetchReplicateModels(apiKey);
  } else if (provider === "Stability AI") {
    models = await fetchStabilityModels(apiKey);
  }

  return {
    ok: true,
    models,
    message: models.length > 0 ? `Discovered ${models.length} models.` : "No models returned by provider."
  };
}

export {
  PROVIDER_VALUES,
  defaultModelForProvider,
  discoverModels,
  isSupportedProvider,
  normalizeProvider
};
