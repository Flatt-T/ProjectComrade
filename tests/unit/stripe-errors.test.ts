import { describe, expect, it } from 'vitest';
import { HttpError } from '../../apps/service/src/http';
import {
  asStripeFailure, checkoutTaxFields, describeStripeError, isTaxIncompatible, taxOnCheckout,
} from '../../apps/service/src/stripe-errors';

describe('checkout tax gating', () => {
  it('never enables Stripe Tax on prices that have not declared tax behaviour', () => {
    expect(taxOnCheckout(true, 'unspecified')).toBe(false);
    expect(taxOnCheckout(true, null)).toBe(false);
    expect(taxOnCheckout(true, undefined)).toBe(false);
    expect(taxOnCheckout(false, 'inclusive')).toBe(false);
  });

  it('enables Stripe Tax only when asked and the price is inclusive or exclusive', () => {
    expect(taxOnCheckout(true, 'inclusive')).toBe(true);
    expect(taxOnCheckout(true, 'exclusive')).toBe(true);
  });

  it('omits customer_update unless tax is actually on, which Stripe requires', () => {
    expect(checkoutTaxFields(false)).toEqual({
      automatic_tax: { enabled: false },
      billing_address_collection: 'auto',
    });
    expect(checkoutTaxFields(true)).toEqual({
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
    });
  });
});

describe('Stripe error mapping', () => {
  it('treats unspecified tax_behavior rejections as tax-incompatible so checkout can retry', () => {
    expect(isTaxIncompatible({
      message: 'As stripe tax is not enabled on this account, automatic_tax[enabled] cannot be set to true.',
    })).toBe(true);
    expect(isTaxIncompatible({
      message: 'Automatic tax calculation requires that all prices have a `tax_behavior` of `inclusive` or `exclusive`.',
    })).toBe(true);
    expect(isTaxIncompatible({ code: 'failed_tax_calculation', message: 'Tax calculation failed' })).toBe(true);
    expect(isTaxIncompatible({ message: 'No such price: price_abc' })).toBe(false);
  });

  it('maps a Stripe invalid-request error to a player-safe 400 instead of a generic 500', () => {
    const mapped = describeStripeError({
      type: 'invalid_request_error',
      code: 'parameter_invalid_empty',
      message: 'As stripe tax is not enabled on this account, automatic_tax[enabled] cannot be set to true.',
      statusCode: 400,
      requestId: 'req_test',
    });
    expect(mapped).toEqual({
      status: 400,
      message: 'Checkout could not start. Try again in a moment.',
      code: 'parameter_invalid_empty',
    });
  });

  it('does not treat HttpError or a plain Error as a Stripe failure', () => {
    expect(asStripeFailure(new Error('disk full'))).toBeNull();
    expect(describeStripeError(new Error('disk full'))).toBeNull();
    expect(describeStripeError(new HttpError(404, 'Not found'))).toBeNull();
  });

  it('maps a missing Customer Portal configuration to a portal-specific message', () => {
    const mapped = describeStripeError({
      type: 'invalid_request_error',
      message: 'You cannot create a portal session in live mode until you save your customer portal settings in live mode at https://dashboard.stripe.com/settings/billing/portal',
      statusCode: 400,
      requestId: 'req_portal',
    });
    expect(mapped?.status).toBe(400);
    expect(mapped?.message).toBe('The billing portal is not available yet.');
  });
});
