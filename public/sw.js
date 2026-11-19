// egg_Edit 서비스 워커: 앱 화면(HTML, JS, CSS, 아이콘)을 저장해 두어 빨리 열리게 한다.
// 내 데이터(Supabase)는 저장하지 않는다 — 항상 서버에서 최신으로 받는다.
const CACHE = 'egg-edit-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // 다른 서버(Supabase 등)는 건드리지 않음

  // 화면(HTML): 먼저 서버에서, 안 되면(오프라인) 저장해 둔 것
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))),
    )
    return
  }
  // JS/CSS/아이콘: 이름에 해시가 붙어 바뀌지 않으므로 저장해 둔 것 먼저
  if (/\/(assets|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
