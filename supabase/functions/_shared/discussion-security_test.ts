import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isBlockedIp, parseYouTube, validateMetadataUrl } from "./discussion-security.ts";

Deno.test("blocks private, loopback, carrier, link-local, benchmark, multicast, IPv6 and mapped IPv4", () => {
  for (const ip of [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::1",
    "fc00::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1",
  ]) assertEquals(isBlockedIp(ip), true, ip);
  assertEquals(isBlockedIp("8.8.8.8"), false);
  assertEquals(isBlockedIp("2606:4700:4700::1111"), false);
});

Deno.test("rejects dangerous schemes, credentials, hostnames and ports", () => {
  for (const url of [
    "file:///etc/passwd", "data:text/plain,hi", "javascript:alert(1)", "ftp://example.com",
    "http://localhost/test", "http://a.localhost/test", "http://user:pass@example.com",
    "https://example.com:22/test", "http://169.254.169.254/latest/meta-data",
  ]) assertEquals(validateMetadataUrl(url).ok, false, url);
  assertEquals(validateMetadataUrl("https://example.com/path").ok, true);
});

Deno.test("YouTube embeds are generated only for allowlisted hosts and IDs", () => {
  assertEquals(parseYouTube("https://youtu.be/dQw4w9WgXcQ")?.embed_url, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assertEquals(parseYouTube("https://evil.test/watch?v=dQw4w9WgXcQ"), null);
});
