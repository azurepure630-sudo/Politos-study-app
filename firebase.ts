// firebase.ts
import { firebaseConfig } from './constants';

declare const firebase: any;

// Initialize Firebase directly. The check for existing apps is not necessary
// in this simple, single-load environment.
firebase.initializeApp(firebaseConfig);

// Export the initialized services for use throughout the app.
export const database = firebase.database();
export const auth = firebase.auth();
export const serverValue = firebase.database.ServerValue;
