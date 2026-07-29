import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicDestination,
  isBlockedIp,
  parseYouTube,
  validateMetadataUrl,
} from "../supabase/functions/_shared/discussion-security.ts";

test("metadata SSRF guard blocks private, loopback, link-local, and mapped addresses", () => {
  for (const address of [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1",
    "::1", "fc00::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1",
  ]) {
    assert.equal(isBlockedIp(address), true, address);
  }
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("metadata URL validation rejects unsafe schemes, credentials, hosts, and ports", () => {
  for (const url of [
    "file:///etc/passwd",
    "data:text/plain,hello",
    "javascript:alert(1)",
    "ftp://example.com/file",
    "http://localhost/test",
    "http://a.localhost/test",
    "http://user:pass@example.com",
    "https://example.com:22/test",
    "http://169.254.169.254/latest/meta-data",
  ]) {
    assert.equal(validateMetadataUrl(url).ok, false, url);
  }
  assert.equal(validateMetadataUrl("https://example.com/path").ok, true);
});

test("DNS rebinding guard rejects any resolved private destination", async () => {
  const previous = globalThis.Deno;
  globalThis.Deno = {
    resolveDns: async (_hostname, type) => type === "A"
      ? ["93.184.216.34", "127.0.0.1"]
      : [],
  };
  await assert.rejects(
    assertPublicDestination(new URL("https://example.com")),
    /blocked-address/,
  );
  globalThis.Deno = previous;
});

test("YouTube URLs produce only privacy-enhanced allowlisted embeds", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ]) {
    assert.equal(
      parseYouTube(url)?.embed_url,
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  }
  assert.equal(parseYouTube("https://evil.example/watch?v=dQw4w9WgXcQ"), null);
});
