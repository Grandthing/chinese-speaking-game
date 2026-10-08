/* service worker — เปิดแอปได้ทันทีและใช้งานได้แม้เน็ตหลุด
   หลักการ: หน้าเว็บ (800KB) เปิดจากแคชทันที แล้วโหลดของใหม่เก็บไว้เบื้องหลัง → เปิดครั้งถัดไปได้รุ่นใหม่
            (เดิมโหลดจากเน็ตก่อนทุกครั้ง เน็ตมือถือช้า = รอสูงสุด 4 วิ ทุกครั้งที่เปิด)
            ยังไม่เคยแคช / มาจากปุ่ม "อัปเดตเดี๋ยวนี้" (?u=) = โหลดจากเน็ตก่อน · หน้าแอปเช็ก version.json แล้วขึ้นแถบให้อัปเดตเองอยู่แล้ว
   หมายเหตุ: ระบบตรวจเสียงของ Chrome ต้องต่อเน็ต ออฟไลน์จะเปิดดูได้แต่ตรวจเสียงไม่ได้ */
const V = '2026-10-08a';
const CACHE = 'zhgame-' + V;
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const DOC_TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function withTimeout(p, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;   // ไฟล์เช็กรุ่น ห้ามแคชเด็ดขาด

  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if (isDoc) {                                  // หน้าเว็บ: แคชก่อน (เร็ว) + อัปเดตเบื้องหลัง
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = (await c.match('./index.html')) || (await c.match('./'));
      const net = fetch(req).then(r => { if (r && r.ok) c.put('./index.html', r.clone()); return r; }).catch(() => null);
      if (hit && !/[?&]u=/.test(url.search)) { e.waitUntil(net); return hit; }
      try {
        const r = await withTimeout(net.then(x => x || Promise.reject(new Error('net'))), DOC_TIMEOUT);
        return r;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {                  // ไอคอน/manifest: เอาของในแคชก่อน เร็วกว่า
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && r.ok && r.type === 'basic') c.put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});
