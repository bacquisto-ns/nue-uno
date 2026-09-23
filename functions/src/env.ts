/** True when running under the Firebase Emulator Suite (tests, local dev). */
export const isEmulator =
  process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST;
