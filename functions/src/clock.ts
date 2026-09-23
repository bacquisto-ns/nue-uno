/**
 * The server owns the clock (architecture ADR-4). In the emulator only, tests can shift time with
 * NUE_UNO_TEST_CLOCK_OFFSET_MS to reach deadlines and the Final Lap without waiting.
 */
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST;

export const clock = {
  now(): number {
    const offset = isEmulator ? Number(process.env.NUE_UNO_TEST_CLOCK_OFFSET_MS ?? 0) : 0;
    return Date.now() + offset;
  },
};
