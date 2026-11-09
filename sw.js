/* マラソンBGM：オフラインでも開けるようにするサービスワーカー
   - アプリ本体（index.html）：開くときはスマホに保存した控えですぐ開き、裏で新しい版を取りに行く（ネットが不安定でも待たない）
   - 新しい版の確認（画面の中から）：ネットを先に試し（3秒まで）、つながらなければ控えを使う
   - km版（…/marathon-bgm/）とマイル版（…/marathon-bgm-mile/）は同じサイトにあるので、同じ控えの名前を使い、アドレスごとに分けて保存する（お互いの控えを消さない）
   - 使い方の画像（guide/）：保存した控えを先に使い、裏で新しくする
   - 地図・天気・場所名・Dropboxなど、ほかのサイトへの通信には手を出さない */
const CACHE = 'mbgm-v2';
const APP = ['./index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(APP.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mbgm-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* 画面から「使い方の画像の一覧」を受け取ったら、まだ保存していないものを保存しておく */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'precache' && Array.isArray(d.urls)) {
    e.waitUntil(caches.open(CACHE).then(async c => {
      for (const u of d.urls) { try { if (!(await c.match(u))) await c.add(u); } catch (err) {} }
    }));
  }
});
const isApp = (req, url) => req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
/* 開いたページのアドレスごとに控えを持つ（km版 …/marathon-bgm/、マイル版 …/marathon-bgm-mile/） */
const appKey = url => (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  if (isApp(req, url) && req.mode === 'navigate') {
    /* 画面を開くとき：控えがあればすぐそれで開き、裏でネットから新しい版を取りに行って控えを新しくする */
    const key = appKey(url);
    const net = fetch(req, { cache: 'no-store' }).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } return r; });
    e.respondWith(caches.open(CACHE).then(c => c.match(key)).then(hit => hit || Promise.race([net, timeout(8000)])).catch(() =>
      new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:20px">インターネットにつながっていません。一度ネットにつないで開くと、次からはネットがなくても開けます。</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  if (isApp(req, url)) {
    /* 新しい版の確認（画面の中からの読み込み）：ネット優先。届いたら控えも新しくする */
    const key = appKey(url);
    const net = fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } return r; });
    e.respondWith(Promise.race([net, timeout(3000)]).catch(() =>
      caches.open(CACHE).then(c => c.match(key)).then(hit => hit || net)
    ).catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:20px">インターネットにつながっていません。一度ネットにつないで開くと、次からはネットがなくても開けます。</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  /* そのほか同じサイトのファイル（使い方の画像など）：控えを先に返し、裏で新しくする */
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net; return r || new Response('', { status: 504 });
  }));
});
