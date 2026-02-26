import { createHash } from "node:crypto";
import { decryptSecret } from "./_lib/encryption.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "./_lib/http.js";
import { defaultModelForProvider, normalizeProvider } from "./_lib/providers.js";
import { getSupabaseAdminClient } from "./_lib/supabase.js";
import { resolveMembership } from "./_lib/auth.js";

function normalizedSize(size) {
  if (typeof size !== "string") return "1024x1024";
  return /^\d+x\d+$/.test(size) ? size : "1024x1024";
}

function parseSize(size) {
  const [widthRaw, heightRaw] = normalizedSize(size).split("x");
  const width = Number.parseInt(widthRaw, 10) || 1024;
  const height = Number.parseInt(heightRaw, 10) || 1024;
  const gcd = (left, right) => (right === 0 ? left : gcd(right, left % right));
  const divisor = gcd(width, height) || 1;
  const ratioWidth = Math.max(1, Math.round(width / divisor));
  const ratioHeight = Math.max(1, Math.round(height / divisor));

  return {
    width,
    height,
    aspectRatio: `${ratioWidth}:${ratioHeight}`
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(ms = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function compactErrorText(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function buildPlaceholderUrl(prompt, size, providerUsed, modelUsed) {
  const { width, height } = parseSize(size);
  const seed = createHash("sha256")
    .update(`${prompt}:${size}:${providerUsed}:${modelUsed}:band-joes-studio`)
    .digest("hex")
    .slice(0, 16);

  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

function readSafeDefaultParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDataUrl(base64, mimeType = "image/png") {
  return `data:${mimeType};base64,${base64}`;
}

function extractImageFromJson(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/")) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractImageFromJson(entry);
      if (found) return found;
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const objectValue = value;
  const directUrl =
    extractImageFromJson(objectValue.imageUrl) ??
    extractImageFromJson(objectValue.image_url) ??
    extractImageFromJson(objectValue.url) ??
    extractImageFromJson(objectValue.output_url) ??
    extractImageFromJson(objectValue.output);
  if (directUrl) return directUrl;

  const base64 = objectValue.b64_json ?? objectValue.base64 ?? objectValue.bytesBase64Encoded;
  if (typeof base64 === "string" && base64.trim().length > 0) {
    return toDataUrl(base64.trim(), objectValue.mime_type || objectValue.mimeType || "image/png");
  }

  if (isPlainObject(objectValue.inlineData) && typeof objectValue.inlineData.data === "string") {
    return toDataUrl(objectValue.inlineData.data, objectValue.inlineData.mimeType || "image/png");
  }

  if (isPlainObject(objectValue.inline_data) && typeof objectValue.inline_data.data === "string") {
    return toDataUrl(objectValue.inline_data.data, objectValue.inline_data.mime_type || "image/png");
  }

  for (const candidate of Object.values(objectValue)) {
    const found = extractImageFromJson(candidate);
    if (found) return found;
  }

  return null;
}

function mergeInput(baseInput, defaultParams) {
  const merged = {
    ...baseInput
  };

  if (isPlainObject(defaultParams.input)) {
    Object.assign(merged, defaultParams.input);
  }

  return merged;
}

function applyTemplate(value, replacements) {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*(prompt|size|model)\s*\}\}/g, (_match, key) => replacements[key] ?? "");
  }

  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplate(entry, replacements));
  }

  if (isPlainObject(value)) {
    const mapped = {};
    for (const [key, entry] of Object.entries(value)) {
      mapped[key] = applyTemplate(entry, replacements);
    }
    return mapped;
  }

  return value;
}

async function parseNonOkError(response, fallbackMessage) {
  const raw = await response.text();
  throw new Error(compactErrorText(raw) || fallbackMessage);
}

async function generateOpenAiImage(options) {
  const { apiKey, model, prompt, size, defaultParams } = options;
  const timeout = withTimeout();

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model || "gpt-image-1",
        prompt,
        size,
        response_format: "b64_json",
        ...(isPlainObject(defaultParams.openai) ? defaultParams.openai : {})
      }),
      signal: timeout.signal
    });

    if (!response.ok) {
      await parseNonOkError(response, `OpenAI image generation failed (${response.status}).`);
    }

    const payload = await response.json();
    const image = extractImageFromJson(payload?.data?.[0] ?? payload);
    if (!image) {
      throw new Error("OpenAI returned no image content.");
    }
    return image;
  } finally {
    timeout.clear();
  }
}

async function generateGeminiImage(options) {
  const { apiKey, model, prompt, size, defaultParams } = options;
  const timeout = withTimeout();

  try {
    const endpointModel = (model || "").replace(/^models\//, "") || "gemini-2.5-flash-image";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(endpointModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(isPlainObject(defaultParams.geminiGenerationConfig) ? defaultParams.geminiGenerationConfig : {})
        },
        ...(isPlainObject(defaultParams.gemini) ? defaultParams.gemini : {})
      }),
      signal: timeout.signal
    });

    if (!response.ok) {
      await parseNonOkError(response, `Gemini image generation failed (${response.status}).`);
    }

    const payload = await response.json();
    const image = extractImageFromJson(payload);
    if (!image) {
      throw new Error("Gemini returned no image content.");
    }

    return image;
  } finally {
    timeout.clear();
  }
}

async function generateReplicateImage(options) {
  const { apiKey, model, prompt, size, defaultParams } = options;
  const timeout = withTimeout(60000);

  try {
    const { aspectRatio } = parseSize(size);
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait=60"
      },
      body: JSON.stringify({
        version: model,
        input: mergeInput(
          {
            prompt,
            aspect_ratio: aspectRatio
          },
          defaultParams
        ),
        ...(isPlainObject(defaultParams.replicate) ? defaultParams.replicate : {})
      }),
      signal: timeout.signal
    });

    if (!response.ok) {
      await parseNonOkError(response, `Replicate prediction failed (${response.status}).`);
    }

    let payload = await response.json();
    let status = payload?.status;
    let output = payload?.output;

    if ((status === "starting" || status === "processing") && payload?.urls?.get) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(1500);
        const poll = await fetch(payload.urls.get, {
          method: "GET",
          headers: {
            Authorization: `Token ${apiKey}`
          }
        });
        if (!poll.ok) {
          await parseNonOkError(poll, "Replicate polling failed.");
        }

        payload = await poll.json();
        status = payload?.status;
        output = payload?.output;

        if (status === "succeeded" || status === "failed" || status === "canceled") {
          break;
        }
      }
    }

    if (status !== "succeeded") {
      throw new Error(compactErrorText(payload?.error) || `Replicate prediction ended with status: ${status}.`);
    }

    const image = extractImageFromJson(output ?? payload);
    if (!image) {
      throw new Error("Replicate returned no image content.");
    }

    return image;
  } finally {
    timeout.clear();
  }
}

async function generateStabilityImage(options) {
  const { apiKey, model, prompt, size, defaultParams } = options;
  const timeout = withTimeout(45000);
  const { width, height } = parseSize(size);

  try {
    const response = await fetch(
      `https://api.stability.ai/v1/generation/${encodeURIComponent(model)}/text-to-image`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          width,
          height,
          samples: 1,
          ...(isPlainObject(defaultParams.stability) ? defaultParams.stability : {})
        }),
        signal: timeout.signal
      }
    );

    if (!response.ok) {
      await parseNonOkError(response, `Stability AI generation failed (${response.status}).`);
    }

    const payload = await response.json();
    const image = extractImageFromJson(payload?.artifacts ?? payload);
    if (!image) {
      throw new Error("Stability AI returned no image content.");
    }

    return image;
  } finally {
    timeout.clear();
  }
}

async function generateCustomHttpImage(options) {
  const { apiKey, model, prompt, size, defaultParams } = options;
  const endpoint = String(defaultParams.endpoint ?? defaultParams.url ?? "").trim();
  if (!endpoint) {
    throw new Error("Custom HTTP requires `endpoint` in Advanced Params JSON.");
  }

  const method = String(defaultParams.method ?? "POST").toUpperCase();
  const rawHeaders = isPlainObject(defaultParams.headers) ? defaultParams.headers : {};
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }

  const hasAuthHeader = Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
  const authHeaderName =
    typeof defaultParams.authHeader === "string" && defaultParams.authHeader.trim().length > 0
      ? defaultParams.authHeader.trim()
      : "Authorization";

  if (!hasAuthHeader) {
    headers[authHeaderName] =
      authHeaderName.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey;
  }

  let body = defaultParams.body;
  if (body === undefined) {
    body = {
      prompt,
      size,
      model
    };
  }

  const templatedBody = applyTemplate(body, {
    prompt,
    size,
    model
  });

  if (method !== "GET" && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: method === "GET" ? undefined : typeof templatedBody === "string" ? templatedBody : JSON.stringify(templatedBody)
  });

  if (!response.ok) {
    await parseNonOkError(response, `Custom HTTP generation failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("image/")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return toDataUrl(bytes.toString("base64"), contentType.split(";")[0] || "image/png");
  }

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const image = extractImageFromJson(payload);
    if (!image) {
      throw new Error("Custom HTTP response did not include an image field.");
    }
    return image;
  }

  const raw = await response.text();
  const image = extractImageFromJson(raw);
  if (image) return image;
  throw new Error("Custom HTTP response did not include an image URL.");
}

async function generateProviderImage(options) {
  const provider = normalizeProvider(options.provider);

  if (provider === "OpenAI") {
    return generateOpenAiImage(options);
  }

  if (provider === "Google Gemini") {
    return generateGeminiImage(options);
  }

  if (provider === "Replicate") {
    return generateReplicateImage(options);
  }

  if (provider === "Stability AI") {
    return generateStabilityImage(options);
  }

  if (provider === "Custom HTTP") {
    return generateCustomHttpImage(options);
  }

  if (provider === "Anthropic") {
    throw new Error(
      "Anthropic/Claude does not provide direct image generation in this endpoint. Use OpenAI, Replicate, Stability AI, Gemini, or Custom HTTP."
    );
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function incrementUsage(organizationId) {
  const adminClient = getSupabaseAdminClient();
  const month = new Date().toISOString().slice(0, 7);

  const { data: current, error: lookupError } = await adminClient
    .from("usage_metrics")
    .select("id, images_generated, api_calls")
    .eq("organization_id", organizationId)
    .eq("month", month)
    .maybeSingle();

  if (lookupError) return;

  if (!current) {
    await adminClient.from("usage_metrics").insert({
      organization_id: organizationId,
      month,
      images_generated: 1,
      api_calls: 1,
      storage_used_mb: 0
    });
    return;
  }

  await adminClient
    .from("usage_metrics")
    .update({
      images_generated: Number(current.images_generated ?? 0) + 1,
      api_calls: Number(current.api_calls ?? 0) + 1
    })
    .eq("id", current.id);
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const body = (await getJsonBody(req)) ?? {};
    const prompt = String(body.prompt ?? "").trim();
    const size = normalizedSize(body.size);

    if (!prompt) {
      sendJson(res, 400, { error: "Prompt is required." });
      return;
    }

    const adminClient = getSupabaseAdminClient();
    const membership = await resolveMembership(req);
    const organizationId = membership?.organization_id ?? null;

    let configured = false;
    let providerUsed = "Placeholder";
    let modelUsed = "picsum";

    if (organizationId) {
      const { data: apiSetting } = await adminClient
        .from("api_settings")
        .select("provider, model, encrypted_api_key, default_params")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (apiSetting?.provider && apiSetting?.encrypted_api_key && apiSetting.encrypted_api_key.length > 0) {
        configured = true;
        providerUsed = normalizeProvider(apiSetting.provider);
        modelUsed = apiSetting.model || defaultModelForProvider(providerUsed) || "default";

        try {
          const key = decryptSecret(apiSetting.encrypted_api_key);
          if (!key) {
            throw new Error("Stored API key could not be decrypted.");
          }

          const defaultParams = readSafeDefaultParams(apiSetting.default_params);
          const imageUrl = await generateProviderImage({
            provider: providerUsed,
            model: modelUsed,
            apiKey: key,
            prompt,
            size,
            defaultParams
          });

          await incrementUsage(organizationId);

          sendJson(res, 200, {
            imageUrl,
            configured: true,
            providerUsed,
            modelUsed
          });
          return;
        } catch (caughtError) {
          sendJson(res, 502, {
            error:
              caughtError instanceof Error
                ? caughtError.message
                : "Configured provider failed to generate an image.",
            configured: true,
            providerUsed,
            modelUsed
          });
          return;
        }
      }
    }

    const imageUrl = buildPlaceholderUrl(prompt, size, providerUsed, modelUsed);

    if (organizationId) {
      await incrementUsage(organizationId);
    }

    sendJson(res, 200, {
      imageUrl,
      configured,
      providerUsed,
      modelUsed
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
