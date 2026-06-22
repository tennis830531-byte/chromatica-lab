const CACHE_NAME = "chromatica-lab-refresh-6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=refresh-6",
  "./app.js?v=refresh-6",
  "./manifest.webmanifest",
  "./public/assets/chromatic-refresh/cleaned/01_logo_chromatic_harmonica_lab.png",
  "./public/assets/chromatic-refresh/cleaned/02_harmonica_main_illustration.png",
  "./public/assets/chromatic-refresh/cleaned/03_bird_playing_harmonica.png",
  "./public/assets/chromatic-refresh/cleaned/04_bird_holding_harmonica.png",
  "./public/assets/chromatic-refresh/cleaned/05_bird_waving_harmonica.png",
  "./public/assets/chromatic-refresh/cleaned/06_icon_note_map.png",
  "./public/assets/chromatic-refresh/cleaned/07_icon_mic_settings.png",
  "./public/assets/chromatic-refresh/cleaned/08_icon_daily_goal.png",
  "./public/assets/chromatic-refresh/cleaned/09_icon_practice_record.png",
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
