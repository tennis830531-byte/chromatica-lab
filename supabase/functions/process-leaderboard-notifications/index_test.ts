import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { classifyFcmResponse, classifyFcmStatus, notificationCopy, sendFcm } from "./index.ts";

const account = { client_email: "local@example.invalid", private_key: "unused", project_id: "local-project" };
const item = {
  id: "00000000-0000-4000-8000-000000000001",
  week_start: "2026-07-19",
  user_id: "00000000-0000-4000-8000-000000000002",
  notification_type: "dropped_out_of_top_ten" as const,
  rank: 11,
  transition_sequence: 3,
  attempts: 1,
};

Deno.test("weekly and every top-ten movement notification copy is exact", () => {
  assertEquals(notificationCopy("weekly_top_ten_result", 3), { title: "乖乖練習王", body: "恭喜本週在乖乖練習王中獲得第 3 名！" });
  assertEquals(notificationCopy("entered_top_ten", 10), { title: "乖乖練習王", body: "恭喜進入本週前十名，目前第 10 名！" });
  assertEquals(notificationCopy("rank_improved", 6), { title: "乖乖練習王", body: "恭喜本週名次上升到第 6 名！" });
  assertEquals(notificationCopy("dropped_out_of_top_ten", 11), { title: "乖乖練習王", body: "你目前被擠到本週第 11 名了，快去練習把前十名追回來！" });
});

Deno.test("FCM status classification bounds retries", () => {
  assertEquals(classifyFcmStatus(200), "success");
  assertEquals(classifyFcmStatus(429), "temporary");
  assertEquals(classifyFcmStatus(503), "temporary");
  assertEquals(classifyFcmStatus(403), "permanent");
  assertEquals(classifyFcmResponse(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } }), "invalid");
});

Deno.test("FCM success request contains only ranking notification data", async () => {
  let requestBody = "";
  const result = await sendFcm(account, "mock-access", "mock-device-token", item, async (_url, init) => {
    requestBody = String(init?.body || "");
    return new Response(JSON.stringify({ name: "mock-message" }), { status: 200 });
  });
  assertEquals(result, "success");
  assertMatch(requestBody, /OPEN_WEEKLY_LEADERBOARD/);
  assertMatch(requestBody, /dropped_out_of_top_ten/);
  assertEquals(/email|google|provider/i.test(requestBody), false);
});

Deno.test("FCM unregister response disables rather than retries", async () => {
  const result = await sendFcm(account, "mock-access", "mock-invalid-token", item, async () => new Response(JSON.stringify({
    error: { details: [{ errorCode: "UNREGISTERED" }] },
  }), { status: 400, headers: { "Content-Type": "application/json" } }));
  assertEquals(result, "invalid");
});

Deno.test("FCM temporary response remains retryable", async () => {
  const result = await sendFcm(account, "mock-access", "mock-temporary-token", item, async () => new Response("", { status: 503 }));
  assertEquals(result, "temporary");
});
