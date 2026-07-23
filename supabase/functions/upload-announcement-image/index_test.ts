import { assertEquals, assertGreater, assertLessOrEqual, assertThrows } from "jsr:@std/assert@1";
import { handler, processAnnouncementImage } from "./index.ts";

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
