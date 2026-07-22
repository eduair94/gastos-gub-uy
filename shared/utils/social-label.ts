const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  threads: "Threads",
  pinterest: "Pinterest",
  telegram: "Telegram",
  bluesky: "Bluesky",
  github: "GitHub",
  discord: "Discord",
  twitch: "Twitch",
  vimeo: "Vimeo",
  snapchat: "Snapchat",
  linktree: "Linktree",
  reddit: "Reddit",
  medium: "Medium",
  mastodon: "Mastodon",
};

/**
 * User-facing social label. Crawl renderers occasionally expose an escaped
 * `<img ...>` as anchor text; strip any markup and fall back to the platform
 * name so raw HTML can never reach the contact UI or exports.
 */
export function safeSocialLabel(raw: unknown, platform: string): string {
  const source = typeof raw === "string" ? raw : "";
  const decodedMarkup = source
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
  const plain = decodedMarkup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
  if (!plain || plain.length > 80 || /[<>]/.test(plain)) return fallback;
  return plain;
}
