import type { ErrorReason } from '@nue-uno/shared';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/** Throwable callable error with a machine-readable reason (docs/engineering/api.md §1). */
export function fail(
  code: FunctionsErrorCode,
  reason: ErrorReason,
  message: string = reason,
  hint?: string,
): HttpsError {
  return new HttpsError(code, message, hint ? { reason, hint } : { reason });
}
