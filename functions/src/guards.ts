import { isCompanyEmail } from '@nue-uno/shared';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { z } from 'zod';
import { fail } from './errors.js';

type AuthedRequest = Pick<CallableRequest<unknown>, 'auth' | 'data'>;

/**
 * Signed in with a company email. Throws otherwise. Returns the caller's uid + email.
 * Email verification is deliberately not required: password sign-in is allowed without a
 * verification email (decision 2026-09-25, architecture.md ADR-3). The domain check is the lock.
 */
export function requireEmployee(req: AuthedRequest): { uid: string; email: string } {
  const auth = req.auth;
  if (!auth) throw fail('unauthenticated', 'NOT_SIGNED_IN', 'Please sign in.');
  const email = auth.token.email;
  if (!isCompanyEmail(email)) {
    throw fail('permission-denied', 'NOT_EMPLOYEE', 'Nue Uno is for NueSynergy employees only.');
  }
  return { uid: auth.uid, email: email!.trim().toLowerCase() };
}

/** Employee with the `active` claim (approved / on the roster). */
export function requirePlayer(req: AuthedRequest): { uid: string; email: string } {
  const who = requireEmployee(req);
  if (req.auth!.token.active !== true) {
    throw fail('permission-denied', 'PENDING_APPROVAL', 'Your account is waiting for approval.');
  }
  return who;
}

export function requireAdmin(req: AuthedRequest): { uid: string; email: string } {
  const who = requirePlayer(req);
  if (req.auth!.token.admin !== true) throw fail('permission-denied', 'NOT_ADMIN', 'Admins only.');
  return who;
}

/** Validate request data against a zod schema, mapping failures to invalid-argument. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid request';
    throw fail('invalid-argument', 'BAD_REQUEST', message);
  }
  return result.data;
}
