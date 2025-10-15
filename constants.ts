import { Character } from './types';
import { IMAGE_ASSETS, AUDIO_ASSETS } from './assets';

// This configuration now connects your app to your Firebase project.
export const firebaseConfig = {
  apiKey: "AIzaSyCPj_yF4PbZXh-nWcNBZORVJJ1XFTBc9XQ",
  authDomain: "politofocus.firebaseapp.com",
  // The database was likely created in the asia-southeast1 region.
  // This URL format is required for non-us-central1 databases.
  databaseURL: "https://politofocus-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "politofocus",
  storageBucket: "politofocus.appspot.com",
  messagingSenderId: "390029492513",
  appId: "1:390029492513:web:7b5eb49e474fee375b3e60",
  measurementId: "G-KLS7VET96C"
};


export const IMAGES = IMAGE_ASSETS;
export const AUDIO = AUDIO_ASSETS;

export const CHARACTER_DATA = {
  [Character.Flynn]: {
    name: 'Flynn',
    partner: Character.Rapunzel,
  },
  [Character.Rapunzel]: {
    name: 'Rapunzel',
    partner: Character.Flynn,
  }
}