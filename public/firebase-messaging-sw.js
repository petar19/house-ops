// Service worker for background push notifications (Firebase Cloud Messaging).
// Runs separately from the app bundle — service workers can't use Vite's ES
// module output directly, so this loads the compat SDK from Firebase's CDN,
// same as Firebase's own docs recommend for this file.
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js');

// Public config, safe here — see the comment in src/lib/firebase.ts.
firebase.initializeApp({
  apiKey: 'AIzaSyDozjOtr-CBhvEa_XB2ewpt7nyJC4Ed_oA',
  authDomain: 'expense-tracker-5acdb.firebaseapp.com',
  projectId: 'expense-tracker-5acdb',
  storageBucket: 'expense-tracker-5acdb.firebasestorage.app',
  messagingSenderId: '835548937115',
  appId: '1:835548937115:web:69091210701313121bff3e',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'New expense';
  self.registration.showNotification(title, {
    body: payload.notification?.body,
    icon: '/house-ops/icon-192.png',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/house-ops/';
  event.waitUntil(self.clients.openWindow(url));
});
