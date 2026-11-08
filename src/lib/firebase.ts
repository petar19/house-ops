import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Firebase web config is public by design — access control lives in Firestore
// Security Rules (firestore.rules), not in hiding these values.
const firebaseConfig = {
  apiKey: 'AIzaSyDozjOtr-CBhvEa_XB2ewpt7nyJC4Ed_oA',
  authDomain: 'expense-tracker-5acdb.firebaseapp.com',
  projectId: 'expense-tracker-5acdb',
  storageBucket: 'expense-tracker-5acdb.firebasestorage.app',
  messagingSenderId: '835548937115',
  appId: '1:835548937115:web:69091210701313121bff3e',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ignoreUndefinedProperties: optional fields (description, itemCount, a
// subitem's count, etc.) are left as `undefined` when a form field is blank —
// without this, the Firestore SDK throws instead of just omitting them.
//
// NOTE: persistentLocalCache + persistentMultipleTabManager was tried here to
// cut re-read cost, but caused live updates to silently stop reaching an open
// tab after a while (new expenses stopped appearing without a full reload) —
// reverted. The read-cost problem is instead addressed by scoping the
// expenses query to a date range (see stores/expenses.ts) rather than
// caching the unbounded query.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const googleProvider = new GoogleAuthProvider();

