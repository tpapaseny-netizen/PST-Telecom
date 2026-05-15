#!/usr/bin/env python3
import shutil

new_sw = """// ZAMA SW v2 - No cache, always fresh
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  return;
});
"""

with open('sw.js', 'w', encoding='utf-8') as f:
    f.write(new_sw)

print("SW cache désactivé ✅")
