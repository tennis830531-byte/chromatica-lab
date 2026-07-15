const CACHE_NAME = "chromatica-lab-refresh-137";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=refresh-137",
  "./app.js?v=refresh-137",
  "./manifest.webmanifest",
  "./public/assets/chromatic-refresh/brand/chl_brand_badge.png",
  "./public/assets/chromatic-refresh/cleaned/02_harmonica_main_illustration.png",
  "./public/assets/chromatic-refresh/cleaned/04_bird_holding_harmonica.png",
  "./public/assets/chromatic-refresh/feature/note_map_explorer.png",
  "./public/assets/chromatic-refresh/feature/long_tone_bird.png",
  "./public/assets/chromatic-refresh/feature/daily_goal_badge.png",
  "./public/assets/chromatic-refresh/feature/streak_fire_bird.png",
  "./public/assets/chromatic-refresh/feature/tuner_badge.png",
  "./public/assets/chromatic-refresh/feature/tuner-card-bg.png",
  "./public/assets/chromatic-refresh/feature/hero-start-button-bg.png",
  "./public/assets/chromatic-refresh/feature/global_leaderboard_icon.png?v=transparent-1",
  "./public/assets/garden/icons/spirit-garden-icon.png",
  "./public/assets/garden/icons/home-plant-stage-bg.png",
  "./public/assets/garden/icons/home-plant-stage-bg-v2.png",
  "./public/assets/garden/icons/garden-stage-backdrop.png",
  "./public/assets/garden/plants/lucky-leaf-spirit-stage1.png",
  "./public/assets/garden/plants/lucky-leaf-spirit-stage2.png",
  "./public/assets/garden/plants/lucky-leaf-spirit-stage3.png",
  "./public/assets/garden/plants/bamboo-sound-child-stage1.png",
  "./public/assets/garden/plants/bamboo-sound-child-stage2.png",
  "./public/assets/garden/plants/bamboo-sound-child-stage3.png",
  "./public/assets/sounds/點擊音效.mp3",
  "./public/assets/sounds/關閉音效.mp3",
  "./public/assets/sounds/練習完成音效.mp3",
  "./public/assets/sounds/Sprout Charm.wav",
  "./public/assets/sounds/澆水聲.mp3",
  "./public/assets/sounds/進化開始音效.mp3",
  "./public/assets/sounds/進化完成音效.mp3",
  "./public/assets/sounds/收成採收音效.mp3",
  "./public/assets/sounds/花園音樂BGM.wav",
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
