import { assert, assertEquals } from "jsr:@std/assert@1";
import { corsHeaders, validateCommentPayload, validatePostPayload, verifyTurnstile } from "./index.ts";

Deno.test("discussion CORS only allows known app origins", () => {
  assertEquals(corsHeaders("https://tennis830531-byte.github.io")["Access-Control-Allow-Origin"], "https://tennis830531-byte.github.io");
  assertEquals(corsHeaders("http://localhost:4173")["Access-Control-Allow-Origin"], "http://localhost:4173");
  assertEquals(corsHeaders("http://127.0.0.1:4173")["Access-Control-Allow-Origin"], "http://127.0.0.1:4173");
  assertEquals(corsHeaders("https://example.invalid"), {});
});

Deno.test("discussion post and comment validation rejects invalid data", () => {
  assert(validatePostPayload({ category: "music_sharing", title: "有效標題", body: "" }).ok);
  assertEquals(validatePostPayload({ category: "hot", title: "有效標題" }).ok, false);
  assertEquals(validatePostPayload({ category: "music_sharing", title: " " }).ok, false);
  assert(validateCommentPayload({ post_id: "00000000-0000-4000-8000-000000000001", body: "留言" }).ok);
  assertEquals(validateCommentPayload({ post_id: "bad", body: "留言" }).ok, false);
  assertEquals(validateCommentPayload({ post_id: "00000000-0000-4000-8000-000000000001", body: " " }).ok, false);
});

Deno.test("Turnstile requires matching action hostname and fresh challenge", async () => {
  Deno.env.set("TURNSTILE_SECRET_KEY", "unit-test-secret");
  Deno.env.set("TURNSTILE_ALLOWED_HOSTNAMES", "localhost");
  const ok = await verifyTurnstile("unit-token", "create_post", "", async () =>
    Response.json({ success: true, action: "create_post", hostname: "localhost", challenge_ts: new Date().toISOString() }));
  assert(ok.ok);
  const wrongAction = await verifyTurnstile("unit-token", "create_comment", "", async () =>
    Response.json({ success: true, action: "create_post", hostname: "localhost", challenge_ts: new Date().toISOString() }));
  assertEquals(wrongAction.ok, false);
  const expired = await verifyTurnstile("unit-token", "create_post", "", async () =>
    Response.json({ success: true, action: "create_post", hostname: "localhost", challenge_ts: new Date(Date.now() - 600000).toISOString() }));
  assertEquals(expired.ok, false);
  Deno.env.delete("TURNSTILE_SECRET_KEY");
  Deno.env.delete("TURNSTILE_ALLOWED_HOSTNAMES");
});
