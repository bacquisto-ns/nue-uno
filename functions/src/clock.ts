import { isEmulator } from './env.js';

/**
 * The server owns the clock (architecture ADR-4). In the emulator only, tests can shift time with
 * NUE_UNO_TEST_CLOCK_OFFSET_MS to reach deadlines and the Final Lap without waiting.
 */
export const clock = {
  now(): number {
    const offset = isEmulator ? Number(process.env.NUE_UNO_TEST_CLOCK_OFFSET_MS ?? 0) : 0;
    return Date.now() + offset;
  },
};
