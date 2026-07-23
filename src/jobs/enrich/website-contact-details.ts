import { load } from "cheerio";
import type { ISocialLink, SocialPlatform } from "../../../shared/models/supplier_contacts";
import { cleanContactText } from "../../../shared/utils/contact-text";
import { safeSocialLabel } from "../../../shared/utils/social-label";

export interface WebsiteContactDetails {
  phone: string | null;
  phones: string[];
  address: string | null;
  contactFormUrl: string | null;
  socialLinks: ISocialLink[];
}

const SOCIAL_HOSTS: Array<[RegExp, SocialPlatform]> = [
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)facebook\.com$/i, "facebook"],
  [/(^|\.)linkedin\.com$/i, "linkedin"],
  [/(^|\.)(?:twitter|x)\.com$/i, "x"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, "youtube"],
  [/(^|\.)tiktok\.com$/i, "tiktok"],
  [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i, "whatsapp"],
  [/(^|\.)threads\.net$/i, "threads"],
  [/(^|\.)pinterest\.[a-z.]+$/i, "pinterest"],
  [/(^|\.)(?:t|telegram)\.me$/i, "telegram"],
  [/(^|\.)bsky\.app$/i, "bluesky"],
  [/(^|\.)github\.com$/i, "github"],
  [/(^|\.)(?:discord\.gg|discord\.com)$/i, "discord"],
  [/(^|\.)twitch\.tv$/i, "twitch"],
  [/(^|\.)vimeo\.com$/i, "vimeo"],
  [/(^|\.)snapchat\.com$/i, "snapchat"],
  [/(^|\.)(?:linktr\.ee|linktree\.com)$/i, "linktree"],
  [/(^|\.)reddit\.com$/i, "reddit"],
  [/(^|\.)medium\.com$/i, "medium"],
  [/(^|\.)mastodon\.social$/i, "mastodon"],
];

// Uruguay numbers appear with many visual groupings: 2914 8414, 2914 84 14,
// 099 123 456, and (+598) 2914 84 14 are all common. Allow separators between
// individual subscriber digits, then validate the normalized digit shape below.
const PHONE_RE = /(?<!\d)(?:(?:\(\s*)?\+?598\s*\)?[\s().-]*)?(?:(?:0?9\d)(?:[\s.-]*\d){6}|(?:2|4)\d{3}(?:[\s.-]*\d){4})(?!\d)/g;
const ADDRESS_HINT = /\b(?:av(?:da)?\.?|avenida|calle|ruta|camino|rambla|bvar\.?|boulevard|cnel\.?|coronel|pasaje|pje\.?|plaza)\b/i;
const CONTACT_SCOPE = "footer, address, #contact, #contacto, [id*='contact' i], [class*='contact' i]";

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanPhone(value: string): string {
  return cleanText(value).replace(/^[\s:|,-]+|[\s:|,-]+$/g, "");
}

function isUruguayPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("598") ? digits.slice(3) : digits;
  return /^(?:0?9\d{7}|[24]\d{7})$/.test(local);
}

function formLink(pageUrl: string, id: string | undefined): string {
  try {
    const url = new URL(pageUrl);
    if (id) url.hash = id;
    return url.toString();
  } catch {
    return pageUrl;
  }
}

function platformFor(url: URL): SocialPlatform | null {
  return SOCIAL_HOSTS.find(([rx]) => rx.test(url.hostname))?.[1] ?? null;
}

/** Extract first-party contact facts from Crawl4AI's cleaned HTML. */
export function extractWebsiteContactDetails(html: string, pageUrl: string): WebsiteContactDetails {
  const $ = load(html || "");
  const socialLinks = new Map<string, ISocialLink>();
  const phonesByDigits = new Map<string, string>();
  const rememberPhone = (raw: string): void => {
    const value = cleanPhone(raw);
    if (!value || !isUruguayPhone(value)) return;
    const key = value.replace(/\D/g, "") || value;
    if (!phonesByDigits.has(key)) phonesByDigits.set(key, value);
  };

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    if (/^tel:/i.test(href)) {
      let hrefPhone = href.replace(/^tel:/i, "");
      try { hrefPhone = decodeURIComponent(hrefPhone); } catch { /* malformed encoding */ }
      const label = cleanText($(element).text());
      rememberPhone(isUruguayPhone(label) ? label : hrefPhone);
    }
    try {
      const url = new URL(href, pageUrl);
      const platform = platformFor(url);
      if (!platform) return;
      const normalized = url.toString();
      socialLinks.set(normalized, {
        platform,
        url: normalized,
        label: safeSocialLabel(cleanText($(element).text()), platform),
        source: "website",
        sourceUrl: pageUrl,
      });
    } catch { /* malformed link */ }
  });

  // Crawl4AI's cleaned HTML can remove href attributes. A footer/contact anchor
  // containing an @handle or underscore-heavy username is still strong evidence
  // of an Instagram profile (e.g. Segalerba's `estudio_segalerba`).
  $(CONTACT_SCOPE).find("a").each((_index, element) => {
    if ($(element).attr("href")) return;
    const text = cleanText($(element).text()).replace(/^@/, "");
    if (!/^[a-z0-9][a-z0-9._]{2,29}$/i.test(text) || (!text.includes("_") && !$(element).text().trim().startsWith("@"))) return;
    const url = `https://www.instagram.com/${text}/`;
    if (!socialLinks.has(url)) {
      socialLinks.set(url, {
        platform: "instagram", url, label: `@${text}`,
        source: "website", sourceUrl: pageUrl,
      });
    }
  });

  let contactFormUrl: string | null = null;
  $("form").each((_index, form) => {
    if (contactFormUrl) return;
    const node = $(form);
    const signature = cleanText([
      node.attr("id") ?? "", node.attr("name") ?? "", node.text(),
      node.find("input, textarea, select").map((_i, field) => [
        $(field).attr("name"), $(field).attr("id"), $(field).attr("type"), $(field).attr("placeholder"),
      ].filter(Boolean).join(" ")).get().join(" "),
    ].join(" "));
    const hasMessage = node.find("textarea").length > 0 || /\b(?:mensaje|message|consulta)\b/i.test(signature);
    const hasIdentity = /\b(?:email|e-mail|nombre|name|tel[eé]fono|phone)\b/i.test(signature);
    const isSearch = /\b(?:search|buscar|b[uú]squeda)\b/i.test(signature) && !hasMessage;
    if (hasMessage && hasIdentity && !isSearch) {
      const anchor = node.attr("id") || node.closest("[id]").attr("id");
      contactFormUrl = formLink(pageUrl, anchor);
    }
  });

  const fragments: string[] = [];
  $(CONTACT_SCOPE).find("*").addBack().each((_index, element) => {
    const direct = cleanText($(element).contents().filter((_i, node) => node.type === "text").text());
    if (direct && direct.length <= 180) fragments.push(direct);
  });
  if (!fragments.length) {
    const fallback = cleanContactText($.root().text(), 220);
    if (fallback) fragments.push(fallback);
  }

  for (const fragment of fragments) {
    for (const match of fragment.matchAll(PHONE_RE)) {
      rememberPhone(match[0]);
    }
  }
  const phones = [...phonesByDigits.values()];
  const phone = phones[0] ?? null;

  let address: string | null = null;
  for (const fragment of fragments) {
    if (ADDRESS_HINT.test(fragment) && /\d{2,5}/.test(fragment) && !/^https?:/i.test(fragment)) {
      const candidate = cleanContactText(fragment.replace(/^[\s:|,-]+|[\s:|,-]+$/g, ""), 220);
      if (candidate) {
        address = candidate;
        break;
      }
    }
  }

  return { phone, phones, address, contactFormUrl, socialLinks: [...socialLinks.values()] };
}
