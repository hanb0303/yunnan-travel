// Service Worker for 운남성 여행 안내 (PWA 오프라인 완벽 구동)
const CACHE_NAME = 'yunnan-travel-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'
];

// 설치 단계: 핵심 정적 에셋 사전 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 에셋 중 하나라도 CDN 문제로 실패해도 나머지 캐싱이 중단되지 않도록 개별 add 처리
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Pre-caching asset failed (will fetch dynamically):', asset, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 활성화 단계: 구버전 캐시 정리 및 클라이언트 즉시 제어권 획득
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 네트워크 요청 가로채기 (Stale-While-Revalidate & Cache-First & Offline Fallback)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // GET 요청만 캐싱
  if (request.method !== 'GET') return;

  // 1. HTML 페이지 탐색 요청 (Navigation): Network First -> Fallback to Cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // 비행기 모드나 통신 불가 음영지역일 때 캐시된 index.html 즉시 반환
          return caches.match('./index.html').then((cached) => cached || caches.match('./'));
        })
    );
    return;
  }

  // 2. 외부 날씨 API (open-meteo.com): Network First -> Fallback to Cache
  if (url.hostname.includes('open-meteo.com')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const respClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3. 정적 리소스(CDN, JS, CSS, 폰트, SVG): Cache First -> Network Fallback & Cache Update
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 백그라운드에서 최신 버전 체크 및 캐시 갱신 (Stale-While-Revalidate)
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {/* 오프라인 시 무시 */});
        return cachedResponse;
      }

      // 캐시에 없으면 네트워크에서 가져와서 캐시에 저장
      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const respClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
          }
          return networkResponse;
        })
        .catch((err) => {
          console.warn('[SW] Resource fetch failed offline:', request.url, err);
        });
    })
  );
});
