// firebase.ts
import { initializeApp } from 'firebase/app';
// Fix: Use namespace import for firebase/auth to avoid potential module resolution issues.
import * as firebaseAuth from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { firebaseConfig } from './constants';

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);
export const auth = firebaseAuth.getAuth(app);
