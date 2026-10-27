// Turn an HTTP request into "who is this, and what are they entitled to".
//
// Every metered route starts here. A signed-in caller resolves to their account and its
// subscription tier; anyone else resolves to a guest identified by a signed cookie, whose
// allowance clock is anchored to the first time we saw them.
import { Me } from '@comrade/contracts';
import { AccountRow, accountBySub, consentFor, profileOf, touchGuest } from './accounts.js';
import { ensureGuestId, optionalCaller, requireCaller } from './auth.js';
import { Ctx, notFound } from './http.js';
import { Who, activeSubscription, entitlementsFor, tierFromSubscription } from './entitlements.js';

export interface Resolved extends Who { account?: AccountRow }

/** The caller as an account when signed in, otherwise as a guest. */
export async function resolve(ctx: Ctx): Promise<Resolved> {
  const caller = await optionalCaller(ctx);
  if (caller) {
    const account = await accountBySub(caller.sub);
    if (account) {
      const subscription = await activeSubscription(account.id);
      return {
        account, subscription,
        tier: tierFromSubscription(subscription),
        registered: true,
        subject: { accountId: account.id },
        anchor: account.week_anchor,
      };
    }
  }
  const guestId = ensureGuestId(ctx);
  const firstSeen = await touchGuest(guestId);
  return { tier: 'guest', registered: false, subject: { guestId }, anchor: firstSeen };
}

/** The caller's account, or 401/404. */
export async function resolveAccount(ctx: Ctx): Promise<{ account: AccountRow; accessToken: string; who: Resolved }> {
  const caller = await requireCaller(ctx);
  const account = await accountBySub(caller.sub);
  if (!account) throw notFound('No account found for this sign-in');
  const subscription = await activeSubscription(account.id);
  return {
    account,
    accessToken: caller.accessToken,
    who: {
      account, subscription,
      tier: tierFromSubscription(subscription),
      registered: true,
      subject: { accountId: account.id },
      anchor: account.week_anchor,
    },
  };
}

/** The `/api/me` payload: profile, entitlements and consent in one round trip. */
export async function meFor(account: AccountRow, who: Who & { account?: AccountRow }): Promise<Me> {
  const [entitlements, consent] = await Promise.all([entitlementsFor(who), consentFor(account.id)]);
  return { profile: profileOf(account), entitlements, consent };
}
