export class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function allowMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    sendJson(res, 405, { error: "Method not allowed." });
    return false;
  }

  return true;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function getJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  const raw = await readRawBody(req);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
