'use strict';

var CACHE_NAME = 'veggie-pop-v3';
var APP_SHELL = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 個別に追加し、一部失敗してもinstallを止めない
      return Promise.all(
        APP_SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // GET以外は素通し
  if (req.method !== 'GET') {
    return;
  }

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Anthropic APIへのリクエストはキャッシュせず常にネットワーク
  if (url.hostname === 'api.anthropic.com') {
    return; // 既定のネットワーク処理に委ねる
  }

  // アプリシェル: ネットワーク優先 → オフライン時のみキャッシュ
  // （更新が即座に反映され、オフラインでもUIが開ける）
  event.respondWith(
    fetch(req)
      .then(function (res) {
        // 同一オリジンの成功レスポンスのみキャッシュ
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) {
            return cached;
          }
          throw new Error('offline-and-no-cache');
        });
      })
  );
});
