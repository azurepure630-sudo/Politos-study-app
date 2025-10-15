// firebase.ts
import { firebaseConfig } from './constants';

declare const firebase: any;

// Check if Firebase has already been initialized to prevent errors.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export the initialized services for use throughout the app.
export const database = firebase.database();
export const auth = firebase.auth();
export const serverValue = firebase.database.ServerValue;
