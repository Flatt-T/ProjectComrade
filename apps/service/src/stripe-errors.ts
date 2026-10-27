// Stripe error shaping for Checkout and the rest of billing.
//
// The SDK throws StripeError instances. Those are not HttpError, so without this mapping
// they become the generic 500 "Something went wrong on our side". Player-facing text stays
// free of Stripe parameter names; the original message is logged separately.

export interface StripeFailure {
  type?: string;
  code?: string;
  message: string;
  statusCode?: number;
}

/** True when the stored Stripe customer id is from the other mode or has been deleted. */
export function isMissingCustomer(error: { code?: string | null; message?: string | null }): boolean {
  const message = error.message ?? '';
  if (/no such customer/i.test(message)) return true;
  if (/similar object exists in (test|live) mode/i.test(message) && /customer/i.test(message)) return true;
  return error.code === 'resource_missing' && /customer/i.test(message);
}

/** True when Stripe Tax cannot run on this price or account. */
export function isTaxIncompatible(error: { code?: string | null; message?: string | null }): boolean {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'failed_tax_calculation') return true;
  return /automatic_tax|tax_behavior|stripe tax is not enabled|not set up for tax|tax is not enabled on this account/i.test(message);
}

/** Automatic tax is only valid when the price itself declares how tax is presented. */
export function taxOnCheckout(wantTax: boolean, taxBehavior: string | null | undefined): boolean {
  return wantTax && (taxBehavior === 'inclusive' || taxBehavior === 'exclusive');
}

export function checkoutTaxFields(enabled: boolean): {
  automatic_tax: { enabled: boolean };
  customer_update?: { address: 'auto'; name: 'auto' };
  billing_address_collection: 'required' | 'auto';
} {
  if (!enabled) return { automatic_tax: { enabled: false }, billing_address_collection: 'auto' };
  return {
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    billing_address_collection: 'required',
  };
}

/** Duck-type a Stripe SDK error without importing the SDK (keeps tests and http.ts light). */
export function asStripeFailure(error: unknown): StripeFailure | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as Record<string, unknown>;
  if (typeof value.message !== 'string' || !value.message) return null;
  const type = typeof value.type === 'string' ? value.type : undefined;
  const code = typeof value.code === 'string' ? value.code : undefined;
  const statusCode = typeof value.statusCode === 'number' ? value.statusCode : undefined;
  const requestId = typeof value.requestId === 'string' ? value.requestId : undefined;
  const rawType = typeof value.rawType === 'string' ? value.rawType : undefined;
  const stripeType = type === 'StripeInvalidRequestError' || type === 'StripeAPIError'
    || type === 'StripeConnectionError' || type === 'StripeAuthenticationError'
    || type === 'StripeRateLimitError' || type === 'StripeIdempotencyError'
    || type === 'StripePermissionError' || type === 'StripeSignatureVerificationError';
  const apiType = type === 'invalid_request_error' || type === 'api_error' || type === 'card_error'
    || type === 'authentication_error' || type === 'rate_limit_error' || type === 'idempotency_error'
    || type === 'invalid_grant';
  const knownStripeCopy = /no such customer|no such price|similar object exists in (test|live) mode|automatic_tax|tax_behavior/i.test(value.message);
  if (!stripeType && !apiType && !rawType && !requestId && !knownStripeCopy) return null;
  return { type: rawType ?? type, code, message: value.message, statusCode };
}

export function stripePlayerStatus(error: StripeFailure): number {
  if (error.type === 'rate_limit_error' || error.statusCode === 429) return 429;
  if (error.type === 'authentication_error' || error.statusCode === 401) return 503;
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) return 400;
  return 502;
}

/** Short, non-technical copy for the account and billing forms. */
export function stripePlayerMessage(error: StripeFailure): string {
  if (isTaxIncompatible(error)) return 'Checkout could not start. Try again in a moment.';
  const message = error.message;
  if (/portal/i.test(message) && /settings|configuration|save your customer portal/i.test(message)) {
    return 'The billing portal is not available yet.';
  }
  if (isMissingCustomer(error)) return 'Billing is being set up for this account. Try again.';
  if (error.code === 'resource_missing') return 'That price is no longer available.';
  if (error.type === 'rate_limit_error' || error.statusCode === 429) {
    return 'Too many attempts — try again shortly';
  }
  if (error.type === 'authentication_error') return 'Billing is not configured on this deployment';
  if (error.type === 'invalid_request_error') return 'Stripe could not start that purchase. Try again in a moment.';
  if (error.statusCode && error.statusCode >= 500) return 'Stripe is having trouble. Try again in a moment.';
  return 'Stripe could not complete that request. Try again in a moment.';
}

export function describeStripeError(error: unknown): { status: number; message: string; code?: string } | null {
  const failure = asStripeFailure(error);
  if (!failure) return null;
  return { status: stripePlayerStatus(failure), message: stripePlayerMessage(failure), code: failure.code };
}
