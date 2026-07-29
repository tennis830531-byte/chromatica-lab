export const DISCUSSION_MEDIA = Object.freeze({
  bucket: "discussion-media",
  maximumCount: 10,
  maximumTotalBytes: 200 * 1024 * 1024,
  draftExpirySeconds: 24 * 60 * 60,
  signedReadSeconds: 15 * 60,
  mime: Object.freeze({
    "image/jpeg": { kind: "image", extension: "jpg", maximumBytes: 10 * 1024 * 1024 },
    "image/png": { kind: "image", extension: "png", maximumBytes: 10 * 1024 * 1024 },
    "image/webp": { kind: "image", extension: "webp", maximumBytes: 10 * 1024 * 1024 },
    "image/gif": { kind: "image", extension: "gif", maximumBytes: 10 * 1024 * 1024 },
    "video/mp4": { kind: "video", extension: "mp4", maximumBytes: 100 * 1024 * 1024 },
    "video/webm": { kind: "video", extension: "webm", maximumBytes: 100 * 1024 * 1024 },
  }),
});

export function mediaDefinition(mime: unknown) {
  return DISCUSSION_MEDIA.mime[String(mime || "").toLowerCase() as keyof typeof DISCUSSION_MEDIA.mime] || null;
}

export function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function ipv4Number(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((result, part) => (result * 256 + Number(part)) >>> 0, 0);
}

function inV4Range(value: number, base: string, prefix: number) {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

export function isBlockedIp(value: string) {
  let input = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (input.startsWith("::ffff:")) input = input.slice(7);
  const v4 = ipv4Number(input);
  if (v4 !== null) {
    return [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["224.0.0.0", 4],
    ].some(([base, prefix]) => inV4Range(v4, String(base), Number(prefix)));
  }
  return input === "::" || input === "::1" || input.startsWith("fc") || input.startsWith("fd")
    || /^fe[89ab]/.test(input);
}

export function validateMetadataUrl(value: unknown) {
  let url: URL;
  try { url = new URL(String(value || "")); } catch { return { ok: false as const, code: "invalid-url" }; }
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false as const, code: "invalid-scheme" };
  if (url.username || url.password) return { ok: false as const, code: "embedded-credentials" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal" || host === "169.254.169.254") {
    return { ok: false as const, code: "blocked-host" };
  }
  if (isBlockedIp(host)) return { ok: false as const, code: "blocked-address" };
  const port = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);
  if (![80, 443, 8080, 8443].includes(port)) return { ok: false as const, code: "blocked-port" };
  url.hash = "";
  return { ok: true as const, url };
}

export async function assertPublicDestination(url: URL) {
  const records = await Deno.resolveDns(url.hostname, "A").catch(() => [] as string[]);
  const records6 = await Deno.resolveDns(url.hostname, "AAAA").catch(() => [] as string[]);
  if (!records.length && !records6.length) throw new Error("dns-resolution-failed");
  if ([...records, ...records6].some(isBlockedIp)) throw new Error("blocked-address");
}

export function parseYouTube(value: unknown) {
  const checked = validateMetadataUrl(value);
  if (!checked.ok) return null;
  const url = checked.url;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed"].includes(parts[0])) id = parts[1] || "";
    }
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    normalized_url: `https://www.youtube.com/watch?v=${id}`,
    provider: "youtube",
    site_name: "YouTube",
    title: "YouTube 影片",
    description: "",
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    embed_url: `https://www.youtube-nocookie.com/embed/${id}`,
    status: "ready",
  };
}
