import Stripe from 'stripe';

let _client: Stripe | null | undefined;

/**
 * Returns a Stripe SDK client initialized from the STRIPE_SECRET_KEY env var.
 * Returns null when the env var is not set (local dev / test mode — uses mock
 * checkout session IDs instead of calling Stripe).
 *
 * Results are memoized after first call.
 */
export function getStripeClient(): Stripe | null {
  if (_client !== undefined) {
    return _client;
  }
  const secretKey = process.env['STRIPE_SECRET_KEY'];
  if (!secretKey) {
    _client = null;
    return null;
  }
  _client = new Stripe(secretKey);
  return _client;
}

/** Reset the memoized client — used in tests that need to swap keys. */
export function resetStripeClient(): void {
  _client = undefined;
}
