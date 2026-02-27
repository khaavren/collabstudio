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

function normalizedSourceImageUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return null;
}

function resolveRequestedMode(value) {
  if (value === "auto" || value === "image" || value === "text" || value === "force_image") {
    return value;
  }
  return "auto";
}

function inferOutputMode(prompt, requestedMode) {
  if (requestedMode === "force_image") {
    return "image";
  }

  if (requestedMode === "text") {
    return requestedMode;
  }

  const normalized = String(prompt || "").trim().toLowerCase();
  if (!normalized) return "image";

  const visualSignals = [
    "generate",
    "regenerate",
    "create variant",
    "new variant",
    "render",
    "mockup",
    "illustration",
    "concept image",
    "concept render",
    "product photo",
    "photo-real",
    "make the",
    "change the",
    "update the design",
    "use attached image",
    "use the attached image",
    "based on this image",
    "show me"
  ];

  if (visualSignals.some((signal) => normalized.includes(signal))) {
    return "image";
  }

  const questionStarts = [
    "what ",
    "why ",
    "how ",
    "which ",
    "should ",
    "can ",
    "could ",
    "would ",
    "is ",
    "are ",
    "do ",
    "does ",
    "compare ",
    "recommend ",
    "suggest ",
    "list ",
    "tell me ",
    "give me ",
    "help me "
  ];

  const advisorySignals = [
    "best 2-3",
    "best option",
    "best options",
    "pros and cons",
    "tradeoff",
    "recommendation",
    "strategy",
    "packaging and shipping",
    "package and ship"
  ];

  const looksTextIntent =
    normalized.includes("?") ||
    questionStarts.some((entry) => normalized.startsWith(entry)) ||
    advisorySignals.some((entry) => normalized.includes(entry));

  if (looksTextIntent) {
    return "text";
  }

  return "image";
}

function normalizeContextMessages(value) {
  if (!Array.isArray(value)) return [];

  const normalized = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const role = entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : null;
    if (!role) continue;
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    if (!content) continue;
    normalized.push({
      role,
      content: content.slice(0, 2000)
    });
  }

  return normalized.slice(-16);
}

function shouldAllowFullRedesign(prompt) {
  const normalized = String(prompt || "").toLowerCase();
  const redesignSignals = [
    "redesign",
    "completely new",
    "start over",
    "from scratch",
    "ignore reference",
    "different concept",
    "new concept",
    "reimagine"
  ];
  return redesignSignals.some((signal) => normalized.includes(signal));
}

function buildEditPrompt(prompt) {
  return [
    "Use the provided image as the base.",
    "Preserve overall composition, camera angle, product geometry, background, and lighting.",
    "Preserve the same product category and form factor as the reference image unless the user explicitly requests a category change.",
    "Apply only the requested modification unless explicitly asked to redesign.",
    `Requested change: ${prompt}`
  ].join(" ");
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

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRetryableRuntimeError(error) {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const message = error.message.toLowerCase();
  return message.includes("fetch failed") || message.includes("network") || message.includes("timeout");
}

function createOpenAiHttpError(response, raw) {
  const payload = parseJsonSafe(raw);
  const providerMessage =
    typeof payload?.error?.message === "string"
      ? payload.error.message
      : compactErrorText(raw) || `OpenAI image generation failed (${response.status}).`;
  const type = typeof payload?.error?.type === "string" ? payload.error.type : "";
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("openai-request-id") ??
    response.headers.get("request-id") ??
    null;
  const retryable = response.status >= 500 || response.status === 429 || type === "server_error";

  const detail = compactErrorText(providerMessage);
  const parts = [
    retryable ? "OpenAI temporary server error." : "OpenAI request failed.",
    detail,
    requestId ? `Request ID: ${requestId}.` : ""
  ].filter(Boolean);
  const error = new Error(parts.join(" "));
  error.retryable = retryable;
  return error;
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

function resolveOpenAiImageModel(model) {
  const raw = String(model ?? "").trim();
  const lowered = raw.toLowerCase();

  if (!raw) return "gpt-image-1";
  if (lowered.includes("image")) return raw;
  if (lowered.startsWith("dall-e")) return raw;

  // Non-image models (for example GPT-5 text models) are not valid for the images endpoint.
  return "gpt-image-1";
}

function resolveOpenAiTextModel(model) {
  const raw = String(model ?? "").trim();
  const lowered = raw.toLowerCase();
  if (!raw) return "gpt-4.1-mini";
  if (lowered.includes("image") || lowered.startsWith("dall-e")) {
    return "gpt-4.1-mini";
  }
  return raw;
}

function sanitizeOpenAiImageParams(raw) {
  if (!isPlainObject(raw)) return {};

  const allowedKeys = new Set([
    "quality",
    "background",
    "output_format",
    "output_compression",
    "moderation",
    "n",
    "style",
    "user"
  ]);

  const sanitized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowedKeys.has(key)) continue;
    sanitized[key] = value;
  }

  return sanitized;
}

function sanitizeOpenAiTextParams(raw) {
  if (!isPlainObject(raw)) return {};

  const allowedKeys = new Set(["temperature", "max_output_tokens", "top_p"]);
  const sanitized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowedKeys.has(key)) continue;
    sanitized[key] = value;
  }

  return sanitized;
}

function resolveOpenAiTextModelFromParams(model, defaultParams) {
  const configured =
    isPlainObject(defaultParams?.openaiText) && typeof defaultParams.openaiText.model === "string"
      ? defaultParams.openaiText.model.trim()
      : "";
  return resolveOpenAiTextModel(configured || model);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDataUrl(base64, mimeType = "image/png") {
  return `data:${mimeType};base64,${base64}`;
}

function extensionFromMimeType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  return "png";
}

function parseDataUrlImage(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Source image data URL is invalid.");
  }

  const mimeType = match[1] || "image/png";
  const base64 = match[2] || "";
  const bytes = Buffer.from(base64, "base64");

  if (bytes.length === 0) {
    throw new Error("Source image data URL is empty.");
  }

  return {
    bytes,
    mimeType
  };
}

async function fetchImageBytes(sourceImageUrl) {
  if (sourceImageUrl.startsWith("data:image/")) {
    return parseDataUrlImage(sourceImageUrl);
  }

  const timeout = withTimeout(45000);
  try {
    const response = await fetch(sourceImageUrl, {
      method: "GET",
      signal: timeout.signal
    });

    if (!response.ok) {
      throw new Error(`Unable to load source image (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const mimeType = (contentType.split(";")[0] || "image/png").trim().toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0) {
      throw new Error("Loaded source image is empty.");
    }

    return {
      bytes,
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/png"
    };
  } finally {
    timeout.clear();
  }
}

function appendOpenAiFormValue(formData, key, value) {
  if (value === undefined || value === null) return;

  if (typeof value === "string") {
    formData.append(key, value);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    formData.append(key, String(value));
    return;
  }

  formData.append(key, JSON.stringify(value));
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

function extractTextFromResponsePayload(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return null;
  }

  for (const item of payload.output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim().length > 0) {
        return entry.text.trim();
      }
    }
  }

  return null;
}

async function generateOpenAiImage(options) {
  const { apiKey, model, prompt, size, defaultParams, sourceImageUrl } = options;
  const maxAttempts = 2;
  const resolvedModel = resolveOpenAiImageModel(model);
  const openAiParams = sanitizeOpenAiImageParams(defaultParams.openai);
  const sourceImage = normalizedSourceImageUrl(sourceImageUrl);
  const editPrompt =
    sourceImage && !shouldAllowFullRedesign(prompt) ? buildEditPrompt(prompt) : prompt;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const timeout = withTimeout(60000);
    try {
      const response = sourceImage
        ? await (async () => {
            const source = await fetchImageBytes(sourceImage);
            const filename = `source.${extensionFromMimeType(source.mimeType)}`;
            const formData = new FormData();
            formData.append("model", resolvedModel);
            formData.append("prompt", editPrompt);
            formData.append("size", size);
            formData.append("image", new Blob([source.bytes], { type: source.mimeType }), filename);
            for (const [key, value] of Object.entries(openAiParams)) {
              appendOpenAiFormValue(formData, key, value);
            }

            return fetch("https://api.openai.com/v1/images/edits", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`
              },
              body: formData,
              signal: timeout.signal
            });
          })()
        : await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: resolvedModel,
              prompt: editPrompt,
              size,
              ...openAiParams
            }),
            signal: timeout.signal
          });

      if (!response.ok) {
        const raw = await response.text();
        throw createOpenAiHttpError(response, raw);
      }

      const payload = await response.json();
      const image = extractImageFromJson(payload?.data?.[0] ?? payload);
      if (!image) {
        throw new Error("OpenAI returned no image content.");
      }

      return {
        imageUrl: image,
        modelUsed: resolvedModel
      };
    } catch (caughtError) {
      const retryable =
        (caughtError instanceof Error && caughtError.retryable === true) ||
        isRetryableRuntimeError(caughtError);
      const canRetry = retryable && attempt < maxAttempts - 1;

      if (!canRetry) {
        if (caughtError instanceof Error && caughtError.name === "AbortError") {
          throw new Error("OpenAI image request timed out. Please retry.");
        }
        throw caughtError;
      }

      const backoffMs = Math.min(1000 * 2 ** attempt, 8000);
      await sleep(backoffMs);
    } finally {
      timeout.clear();
    }
  }

  throw new Error("OpenAI image generation failed after retries.");
}

async function generateOpenAiText(options) {
  const { apiKey, model, prompt, defaultParams } = options;
  const maxAttempts = 2;
  const resolvedModel = resolveOpenAiTextModelFromParams(model, defaultParams);
  const textParams = sanitizeOpenAiTextParams(defaultParams.openaiText);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const timeout = withTimeout(60000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: resolvedModel,
          input: [
            {
              role: "system",
              content:
                "You are an industrial product development assistant. Return clear Markdown with this exact structure: " +
                "## Recommendation, ## Why, ## Action Plan. " +
                "Use bullet points and numbered steps on separate lines. " +
                "Do not output one long paragraph. Keep it concise and practical."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          ...textParams
        }),
        signal: timeout.signal
      });

      if (!response.ok) {
        const raw = await response.text();
        throw createOpenAiHttpError(response, raw);
      }

      const payload = await response.json();
      const text = extractTextFromResponsePayload(payload);
      if (!text) {
        throw new Error("OpenAI returned no text response.");
      }

      return {
        responseText: text,
        modelUsed: resolvedModel
      };
    } catch (caughtError) {
      const retryable =
        (caughtError instanceof Error && caughtError.retryable === true) ||
        isRetryableRuntimeError(caughtError);
      const canRetry = retryable && attempt < maxAttempts - 1;

      if (!canRetry) {
        if (caughtError instanceof Error && caughtError.name === "AbortError") {
          throw new Error("OpenAI text request timed out. Please retry.");
        }
        throw caughtError;
      }

      const backoffMs = Math.min(1000 * 2 ** attempt, 8000);
      await sleep(backoffMs);
    } finally {
      timeout.clear();
    }
  }

  throw new Error("OpenAI text response failed after retries.");
}

async function classifyOpenAiOutputMode(options) {
  const { apiKey, model, prompt, defaultParams, contextMessages = [] } = options;
  const fallback = inferOutputMode(prompt, "auto");
  const resolvedModel = resolveOpenAiTextModelFromParams(model, defaultParams);
  const timeout = withTimeout(20000);

  try {
    const inputMessages = [
      {
        role: "system",
        content:
          "Classify the user request for a collaborative design tool. Respond with exactly one token: IMAGE or TEXT. " +
          "TEXT for analysis, recommendations, explanation, planning, Q&A. IMAGE for visual generation/edit/variant requests. " +
          "When uncertain, respond TEXT."
      },
      ...contextMessages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      {
        role: "user",
        content: prompt
      }
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: resolvedModel,
        input: inputMessages,
        max_output_tokens: 4
      }),
      signal: timeout.signal
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const content = (extractTextFromResponsePayload(payload) || "").trim().toLowerCase();
    if (content.includes("image")) return "image";
    if (content.includes("text")) return "text";
    return fallback;
  } catch {
    return fallback;
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
    return {
      imageUrl: await generateGeminiImage(options),
      modelUsed: options.model
    };
  }

  if (provider === "Replicate") {
    return {
      imageUrl: await generateReplicateImage(options),
      modelUsed: options.model
    };
  }

  if (provider === "Stability AI") {
    return {
      imageUrl: await generateStabilityImage(options),
      modelUsed: options.model
    };
  }

  if (provider === "Custom HTTP") {
    return {
      imageUrl: await generateCustomHttpImage(options),
      modelUsed: options.model
    };
  }

  if (provider === "Anthropic") {
    throw new Error(
      "Anthropic/Claude does not provide direct image generation in this endpoint. Use OpenAI, Replicate, Stability AI, Gemini, or Custom HTTP."
    );
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function generateProviderText(options) {
  const provider = normalizeProvider(options.provider);

  if (provider === "OpenAI") {
    return generateOpenAiText(options);
  }

  return {
    responseText:
      `Text assistant replies are not configured for ${provider}. ` +
      "Ask for an image iteration or switch provider to OpenAI for text-mode chat.",
    modelUsed: options.model
  };
}

async function incrementUsage(organizationId, imageGenerated = true) {
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
      images_generated: imageGenerated ? 1 : 0,
      api_calls: 1,
      storage_used_mb: 0
    });
    return;
  }

  await adminClient
    .from("usage_metrics")
    .update({
      images_generated: Number(current.images_generated ?? 0) + (imageGenerated ? 1 : 0),
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
    const sourceImageUrl = normalizedSourceImageUrl(body.sourceImageUrl);
    const requestedMode = resolveRequestedMode(body.mode);
    const contextMessages = normalizeContextMessages(body.context);
    let outputMode = inferOutputMode(prompt, requestedMode);

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
          if (requestedMode === "auto" && outputMode === "image" && providerUsed === "OpenAI") {
            outputMode = await classifyOpenAiOutputMode({
              apiKey: key,
              model: modelUsed,
              prompt,
              defaultParams,
              contextMessages
            });
          }

          if (outputMode === "text") {
            const textInputContext =
              contextMessages.length > 0
                ? `\n\nConversation context:\n${contextMessages
                    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
                    .join("\n")}`
                : "";
            const generated = await generateProviderText({
              provider: providerUsed,
              model: modelUsed,
              apiKey: key,
              prompt: `${prompt}${textInputContext}`,
              size,
              sourceImageUrl,
              defaultParams
            });
            modelUsed = generated.modelUsed || modelUsed;

            await incrementUsage(organizationId, false);

            sendJson(res, 200, {
              outputType: "text",
              responseText: generated.responseText,
              configured: true,
              providerUsed,
              modelUsed
            });
            return;
          }

          const generated = await generateProviderImage({
            provider: providerUsed,
            model: modelUsed,
            apiKey: key,
            prompt,
            size,
            sourceImageUrl,
            defaultParams
          });
          modelUsed = generated.modelUsed || modelUsed;

          await incrementUsage(organizationId, true);

          sendJson(res, 200, {
            outputType: "image",
            imageUrl: generated.imageUrl,
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

    if (outputMode === "text") {
      if (organizationId) {
        await incrementUsage(organizationId, false);
      }
      sendJson(res, 200, {
        outputType: "text",
        responseText:
          "Text mode requested, but no model API is configured for this studio. Add your provider key in Admin > Model API Configuration.",
        configured,
        providerUsed,
        modelUsed
      });
      return;
    }

    const imageUrl = buildPlaceholderUrl(prompt, size, providerUsed, modelUsed);

    if (organizationId) {
      await incrementUsage(organizationId, true);
    }

    sendJson(res, 200, {
      outputType: "image",
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
