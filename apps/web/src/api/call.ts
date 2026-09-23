import type { ErrorReason } from '@nue-uno/shared';
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly reason: ErrorReason | 'UNKNOWN',
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** Typed callable wrapper that surfaces the server's machine-readable reason (api.md §1). */
export async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    const res = await httpsCallable<Req, Res>(functions, name)(data);
    return res.data;
  } catch (err) {
    if (err instanceof FirebaseError) {
      const details = (err as FirebaseError & { details?: { reason?: ErrorReason; hint?: string } })
        .details;
      throw new ApiError(err.message, details?.reason ?? 'UNKNOWN', details?.hint);
    }
    throw err;
  }
}
