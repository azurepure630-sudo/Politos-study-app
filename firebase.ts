// firebase.ts
import { firebaseConfig } from './constants';

// This tells TypeScript that a global 'firebase' object exists,
// which is created by the scripts we added to index.html.
declare var firebase: any;

// Initialize Firebase from the global object
const app = firebase.initializeApp(firebaseConfig);

// Use the v8-compat syntax to get the database and auth services
export const database = firebase.database();
export const auth = firebase.auth();
