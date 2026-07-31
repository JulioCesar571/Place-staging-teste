// ═══════════════════════════════════════════════════════════════
// PLACE — SERVICE WORKER
// Estratégia: rede primeiro para o app (atualizações chegam sempre),
// cache como reserva para abrir offline; APIs nunca são cacheadas.
// ═══════════════════════════════════════════════════════════════
const CACHE = 'place-v37';
const APP_SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

// Instala: guarda o esqueleto do app
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Ativa: remove caches de versões antigas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // APIs dinâmicas (banco, licença): sempre rede, nunca cache
  if (url.includes('supabase.co') || url.includes('gist.githubusercontent')) {
    return; // deixa o navegador tratar normalmente
  }

  // Navegação/HTML: rede primeiro (pega atualizações), cache se offline.
  // IMPORTANTE: usamos e.request.url (string) e não e.request (objeto) — o Chrome
  // proíbe fetch(request, init) quando request.mode === 'navigate' e lançaria
  // TypeError, fazendo TODA navegação cair no cache (bug grave).
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request.url, { cache: 'reload' }) // 'reload' ignora o cache HTTP do navegador, força ida à rede
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Demais recursos (bibliotecas CDN, fontes, ícones): cache primeiro,
  // buscando na rede e guardando quando ainda não estiver salvo
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        // Só cacheia respostas válidas de GET
        if (e.request.method === 'GET' && res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// ═══════════════════════════════════════════════════════════════
// PUSH DE VERDADE — chega mesmo com o app fechado.
// O payload vem das Edge Functions send-push / notify-booking-cycle:
// { "title": "...", "body": "..." }
// ═══════════════════════════════════════════════════════════════
self.addEventListener('push', (e) => {
  let data = { title: 'Place', body: '' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || undefined
    })
  );
});

// Ao tocar na notificação: foca uma aba já aberta do app, ou abre uma nova.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
