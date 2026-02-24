export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function hashSeed(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

export function placeholderUrl(prompt: string, size: string) {
  const [width, height] = size.split("x");
  const seed = hashSeed(`${prompt}:${size}:band-joes-studio`);
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

export function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function safeVersionNumber(version: string) {
  const parsed = Number(version.replace(/^v/i, ""));
  return Number.isFinite(parsed) ? parsed : 1;
}
