import { get, writable } from 'svelte/store';
import { arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db, VAPID_KEY } from '../firebase';
import { currentUser } from './auth';
import { groupIdFor } from './groups';
import type { NotificationPref } from '../types';

export const notificationPref = writable<NotificationPref | null>(null);
export const notificationPermission = writable<NotificationPermission | 'unsupported'>(
  typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
);

let unsubPref: (() => void) | null = null;

groupIdFor('expenses').subscribe((groupId) => {
  if (unsubPref) {
    unsubPref();
    unsubPref = null;
  }
  const user = get(currentUser);
  if (!groupId || !user) {
    notificationPref.set(null);
    return;
  }
  unsubPref = onSnapshot(
    doc(db, 'groups', groupId, 'notificationPrefs', user.uid),
    (snap) => {
      notificationPref.set(
        snap.exists() ? (snap.data() as NotificationPref) : { uid: user.uid, enabled: false },
      );
    },
    () => notificationPref.set(null),
  );
});

export async function enableNotifications(groupId: string): Promise<void> {
  const user = get(currentUser);
  if (!user) throw new Error('Not signed in');

  if (!(await isSupported())) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  notificationPermission.set(permission);
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}firebase-messaging-sw.js`,
  );
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

  await setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayUnion(token) }, { merge: true });
  await setDoc(doc(db, 'groups', groupId, 'notificationPrefs', user.uid), {
    uid: user.uid,
    enabled: true,
  });
}

export async function disableNotifications(groupId: string): Promise<void> {
  const user = get(currentUser);
  if (!user) return;
  await setDoc(
    doc(db, 'groups', groupId, 'notificationPrefs', user.uid),
    { uid: user.uid, enabled: false },
    { merge: true },
  );
}
