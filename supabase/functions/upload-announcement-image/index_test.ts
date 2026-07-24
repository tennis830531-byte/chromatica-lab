import { assertEquals, assertGreater, assertLessOrEqual, assertThrows } from "jsr:@std/assert@1";
import { corsHeaders, handler, normalizeExistingImages, parseImageOrder, processAnnouncementImage } from "./index.ts";

const VALID_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));

Deno.test("announcement image is actually decoded and safely transcoded to WebP", () => {
  const result = processAnnouncementImage(VALID_PNG);
  assertGreater(result.bytes.byteLength, 0);
  assertLessOrEqual(result.bytes.byteLength, 1536 * 1024);
  assertEquals(new TextDecoder().decode(result.bytes.slice(0, 4)), "RIFF");
  assertEquals(new TextDecoder().decode(result.bytes.slice(8, 12)), "WEBP");
  assertGreater(result.width, 0);
  assertGreater(result.height, 0);
});

Deno.test("corrupt announcement image cannot pass actual decode", () => {
  assertThrows(() => processAnnouncementImage(new TextEncoder().encode("not-an-image")));
});

Deno.test("allowed announcement preflight returns only the exact origin", async () => {
  const response = await handler(new Request("http://local.test", {
    method: "OPTIONS",
    headers: { Origin: "https://localhost" },
  }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "https://localhost");
  assertEquals(response.headers.get("Access-Control-Allow-Origin") === "*", false);
});

Deno.test("unlisted announcement origin is rejected before auth and has no CORS grant", async () => {
  const response = await handler(new Request("http://local.test", {
    method: "OPTIONS",
    headers: { Origin: "https://someone-else.github.io" },
  }));
  assertEquals(response.status, 403);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("announcement CORS declares the authenticated DELETE operation", () => {
  const headers = corsHeaders("https://tennis830531-byte.github.io");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://tennis830531-byte.github.io");
  assertEquals(headers["Access-Control-Allow-Methods"], "POST, DELETE, OPTIONS");
});

Deno.test("legacy announcement cover becomes a compatible first gallery item", () => {
  assertEquals(normalizeExistingImages({ image_path: "announcement-a.webp", image_version: 4 }, []), [{
    image_path: "announcement-a.webp",
    image_version: 4,
    sort_order: 0,
  }]);
});

Deno.test("explicit mixed image order is stable and duplicate paths are rejected", () => {
  const existing = [{ image_path: "announcement-a.webp", image_version: 4, sort_order: 0 }];
  assertEquals(parseImageOrder(JSON.stringify([
    { kind: "new", index: 0 },
    { kind: "existing", path: "announcement-a.webp" },
  ]), existing, 1), [
    { kind: "new", index: 0 },
    { kind: "existing", path: "announcement-a.webp" },
  ]);
  assertThrows(() => parseImageOrder(JSON.stringify([
    { kind: "existing", path: "announcement-a.webp" },
    { kind: "existing", path: "announcement-a.webp" },
  ]), existing, 0));
});
