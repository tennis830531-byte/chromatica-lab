const CACHE_NAME = "chromatica-lab-refresh-18-target-labels";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=refresh-18-target-labels",
  "./app.js?v=refresh-18-target-labels",
  "./manifest.webmanifest",
  "./public/assets/chromatic-refresh/brand/chl_brand_badge.png",
  "./public/assets/chromatic-refresh/cleaned/02_harmonica_main_illustration.png",
  "./public/assets/chromatic-refresh/cleaned/04_bird_holding_harmonica.png",
  "./public/assets/chromatic-refresh/feature/note_map_explorer.png",
  "./public/assets/chromatic-refresh/feature/long_tone_bird.png",
  "./public/assets/chromatic-refresh/feature/daily_goal_badge.png",
  "./public/assets/chromatic-refresh/feature/tuner_badge.png",
  "./public/assets/chromatic-refresh/icon/mic_settings_icon.png",
  "./public/assets/chromatic-refresh/icon/practice_record_icon.png",
  "./public/assets/chromatic-refresh/note/encouragement_note.png",
  "./public/assets/chromatic-refresh/state/coming_soon_sign.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});
