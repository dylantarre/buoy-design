/**
 * Stripe Test Fixtures
 *
 * Use these for unit/integration tests.
 * All values are from Stripe TEST mode - safe to commit.
 */

export const STRIPE_TEST_CONFIG = {
  // Test mode price ID for Pro plan
  proPriceId: 'price_1SlgHXAo0W5eA8UvGqHwZWCR',

  // Test card numbers (from Stripe docs)
  cards: {
    success: '4242424242424242',
    declined: '4000000000000002',
    requiresAuth: '4000002500003155',
    insufficientFunds: '4000000000009995',
  },

  // Test webhook payload signatures
  webhookTimestampTolerance: 300, // 5 minutes
};

/**
 * Mock Stripe webhook event
 */
export function createMockWebhookEvent(
  type: string,
  data: Record<string, unknown>
): { body: string; signature: string } {
  const event = {
    id: `evt_test_${Date.now()}`,
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
  };

  const body = JSON.stringify(event);

  // For tests, we'll bypass signature verification
  // In real tests, use stripe.webhooks.generateTestHeaderString()
  const signature = `t=${Math.floor(Date.now() / 1000)},v1=test_signature`;

  return { body, signature };
}

/**
 * Mock checkout.session.completed event
 */
export function mockCheckoutCompleted(customerId: string, subscriptionId: string) {
  return createMockWebhookEvent('checkout.session.completed', {
    id: `cs_test_${Date.now()}`,
    customer: customerId,
    subscription: subscriptionId,
    payment_status: 'paid',
  });
}

/**
 * Mock invoice.payment_failed event
 */
export function mockPaymentFailed(customerId: string, attemptCount = 1) {
  return createMockWebhookEvent('invoice.payment_failed', {
    id: `in_test_${Date.now()}`,
    customer: customerId,
    attempt_count: attemptCount,
    amount_due: 29900,
    currency: 'usd',
  });
}

/**
 * Mock subscription events
 */
export function mockSubscriptionUpdated(
  customerId: string,
  subscriptionId: string,
  status: 'active' | 'past_due' | 'canceled' | 'unpaid'
) {
  return createMockWebhookEvent('customer.subscription.updated', {
    id: subscriptionId,
    customer: customerId,
    status,
  });
}

export function mockSubscriptionDeleted(customerId: string, subscriptionId: string) {
  return createMockWebhookEvent('customer.subscription.deleted', {
    id: subscriptionId,
    customer: customerId,
  });
}
