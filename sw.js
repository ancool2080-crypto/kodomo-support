// ─────────────────────────────────────────────────────────────
//  Aroha — Service Worker
//  戦略: Cache First（静的リソース）+ Network First（API）
// ─────────────────────────────────────────────────────────────

const CACHE_NAME = 'aroha-v1.2';
const FONT_CACHE = 'aroha-fonts-v1';

// オフラインでも動作させる必須リソース
const PRECACHE_URLS = [
  '/kodomo-support/',
  '/kodomo-support/index.html',
  '/kodomo-support/manifest.json',
  '/kodomo-support/icons/icon-192.png',
  '/kodomo-support/icons/icon-512.png',
  '/kodomo-support/offline.html',
];

// Googleフォント（別キャッシュで管理）
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;700&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap',
];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // メインキャッシュ
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Precache partial failure:', err);
        });
      }),
      // フォントキャッシュ
      caches.open(FONT_CACHE).then(cache => {
        return cache.addAll(FONT_URLS).catch(err => {
          console.warn('[SW] Font cache failure (network required):', err);
        });
      }),
    ])
  );
  // 旧バージョンのSWを即座に置き換える
  self.skipWaiting();
});

// ─── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== FONT_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Anthropic API → ネットワークのみ（キャッシュ不可）
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            content: [{
              type: 'text',
              text: 'オフライン中のため、AIアドバイスを取得できません。記録は保存されました。オンラインになってから再度お試しください。'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2. Googleフォント → キャッシュ優先、なければネットワーク
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache => {
        return cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        });
      })
    );
    return;
  }

  // 3. 自サイトリソース → キャッシュ優先、なければネットワーク取得してキャッシュ
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          // キャッシュヒット → 即返却 + バックグラウンドで更新
          if (cached) {
            fetch(event.request)
              .then(response => {
                if (response.ok) cache.put(event.request, response.clone());
              })
              .catch(() => {});
            return cached;
          }
          // キャッシュミス → ネットワーク取得
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => {
            // オフライン＆キャッシュなし → オフラインページ
            return caches.match('/kodomo-support/offline.html');
          });
        });
      })
    );
    return;
  }

  // 4. その他 → 通常のネットワークリクエスト
  event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
});

// ─── BACKGROUND SYNC（将来のFirebase移行時に使用） ────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-diary') {
    console.log('[SW] Background sync: diary');
  }
});

// ─── PUSH通知（将来実装） ──────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Aroha', {
    body: data.body || '',
    icon: '/kodomo-support/icons/icon-192.png',
    badge: '/kodomo-support/icons/icon-72.png',
    tag: 'aroha-notification',
    renotify: false,
  });
});
