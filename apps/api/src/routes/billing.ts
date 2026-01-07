/**
 * Billing Routes
 *
 * Stripe integration for subscriptions and payments.
 *
 * GET    /billing                  - Get current plan and usage
 * GET    /billing/invoices         - List invoice history
 * POST   /billing/checkout         - Create Stripe checkout session
 * POST   /billing/portal           - Create Stripe customer portal session
 * POST   /billing/cancel-request   - Request cancellation with reason
 * POST   /webhooks/stripe          - Stripe webhook handler
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

const billing = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Configuration
// ============================================================================

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

// Plan configuration
// Pricing: $25/dev/month or $240/dev/year (20% off)
const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    userLimit: null, // Unlimited - CLI is fully free
    features: [
      'Auto-detect design system',
      'All drift detection commands',
      'Token import (JSON, CSS, Tokens Studio)',
      'AI guardrails (skills, MCP, context)',
      'Local scan history',
    ],
  },
  team: {
    name: 'Team',
    // Per-seat pricing: $25/dev/month or $240/dev/year (20% off)
    priceIdMonthly: 'price_1SmmuUH6AdYcVyeguHV6ACMn', // $25/seat/month
    priceIdAnnual: 'price_1SmmuWH6AdYcVyegQ465xfHd',  // $240/seat/year
    amountMonthly: 2500, // $25.00 in cents per seat
    amountAnnual: 24000, // $240.00 in cents per seat/year (20% off)
    userLimit: null, // Per-seat, no limit
    features: [
      'Everything in Free',
      'Unlimited repos',
      'GitHub PR comments',
      'Slack & Teams alerts',
      'Cloud history & trends',
      'Figma Monitor plugin',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: null, // Custom pricing
    userLimit: null,
    features: [
      'Everything in Team',
      'SSO / SAML',
      'Audit logs',
      'SLA guarantees',
      'Design system implementation consulting',
      'Dedicated Slack channel',
      'Custom integrations',
    ],
  },
} as const;

// Grace period configuration (days)
const GRACE_PERIOD = {
  WARNING: 3,     // Days 1-3: Warning banner, full access
  LIMITED: 7,     // Days 4-7: No new projects/members
  READ_ONLY: 14,  // Days 8-14: Read-only mode
  SUSPENDED: 15,  // Day 15+: Account suspended
};

// ============================================================================
// Stripe API Helpers
// ============================================================================

async function stripeRequest<T>(
  secretKey: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(error.error?.message || `Stripe API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function encodeFormData(data: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Parse the signature header
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const v1Signature = parts['v1'];

  if (!timestamp || !v1Signature) {
    return false;
  }

  // Check timestamp is within tolerance (5 minutes)
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > 300) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (v1Signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < v1Signature.length; i++) {
    result |= v1Signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// Billing Routes
// ============================================================================

/**
 * Get current billing status
 */
billing.get('/billing', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Get account with billing info
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, name, plan,
        stripe_customer_id, stripe_subscription_id,
        user_limit, seat_count, billing_period,
        trial_started_at, trial_ends_at, trial_converted,
        payment_status, payment_failed_at, grace_period_ends_at,
        cancellation_requested_at, cancellation_reason,
        created_at
      FROM accounts
      WHERE id = ?
    `).bind(session.accountId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Get current usage
    const period = new Date().toISOString().substring(0, 7);
    const usage = await c.env.PLATFORM_DB.prepare(`
      SELECT scans_count, api_calls_count, storage_bytes
      FROM usage
      WHERE account_id = ? AND period = ?
    `).bind(session.accountId, period).first();

    // Get member count
    const memberCount = await c.env.PLATFORM_DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE account_id = ?
    `).bind(session.accountId).first();

    const plan = account.plan as keyof typeof PLANS;
    const planConfig = PLANS[plan] || PLANS.free;

    // Calculate trial status
    let trialStatus = null;
    if (account.trial_ends_at) {
      const trialEndsAt = new Date(account.trial_ends_at as string);
      const now = new Date();
      const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      trialStatus = {
        active: daysRemaining > 0 && !account.trial_converted,
        daysRemaining: Math.max(0, daysRemaining),
        endsAt: account.trial_ends_at,
        converted: !!account.trial_converted,
      };
    }

    // Calculate payment status
    let paymentAlert = null;
    if (account.payment_status !== 'active' && account.grace_period_ends_at) {
      const graceEndsAt = new Date(account.grace_period_ends_at as string);
      const now = new Date();
      const daysRemaining = Math.ceil((graceEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      paymentAlert = {
        status: account.payment_status,
        daysRemaining: Math.max(0, daysRemaining),
        graceEndsAt: account.grace_period_ends_at,
        failedAt: account.payment_failed_at,
      };
    }

    return c.json({
      plan: {
        id: plan,
        name: planConfig.name,
        features: planConfig.features,
      },
      subscription: account.stripe_subscription_id
        ? {
            id: account.stripe_subscription_id,
            customerId: account.stripe_customer_id,
          }
        : null,
      seats: {
        purchased: (account.seat_count as number) || 1,
        used: (memberCount?.count as number) || 0,
        available: ((account.seat_count as number) || 1) - ((memberCount?.count as number) || 0),
        billingPeriod: account.billing_period || null,
        pricePerSeat: account.billing_period === 'annual'
          ? PLANS.team.amountAnnual
          : PLANS.team.amountMonthly,
      },
      limits: {
        users: planConfig.userLimit,
        currentUsers: memberCount?.count || 0,
      },
      usage: {
        period,
        scans: usage?.scans_count || 0,
        apiCalls: usage?.api_calls_count || 0,
        storageBytes: usage?.storage_bytes || 0,
      },
      trial: trialStatus,
      paymentAlert,
      cancellation: account.cancellation_requested_at
        ? {
            requestedAt: account.cancellation_requested_at,
            reason: account.cancellation_reason,
          }
        : null,
    });
  } catch (error) {
    console.error('Error getting billing:', error);
    return c.json({ error: 'Failed to get billing info' }, 500);
  }
});

/**
 * List invoices
 */
billing.get('/billing/invoices', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT stripe_customer_id FROM accounts WHERE id = ?
    `).bind(session.accountId).first();

    if (!account?.stripe_customer_id) {
      return c.json({ invoices: [] });
    }

    // Fetch invoices from Stripe
    const invoices = await stripeRequest<{
      data: Array<{
        id: string;
        number: string;
        status: string;
        amount_due: number;
        amount_paid: number;
        currency: string;
        created: number;
        hosted_invoice_url: string;
        invoice_pdf: string;
      }>;
    }>(
      c.env.STRIPE_SECRET_KEY,
      `/invoices?customer=${account.stripe_customer_id}&limit=12`,
      { method: 'GET' }
    );

    return c.json({
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        createdAt: new Date(inv.created * 1000).toISOString(),
        hostedUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      })),
    });
  } catch (error) {
    console.error('Error listing invoices:', error);
    return c.json({ error: 'Failed to list invoices' }, 500);
  }
});

/**
 * Create checkout session for upgrading to Team plan
 * Per-seat pricing: $25/dev/month or $240/dev/year (20% off)
 */
billing.post('/billing/checkout', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owners can manage billing
  const user = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!user || user.role !== 'owner') {
    return c.json({ error: 'Only account owners can manage billing' }, 403);
  }

  // Parse request body for billing options
  const schema = z.object({
    seats: z.number().int().min(1).default(1),
    billingPeriod: z.enum(['monthly', 'annual']).default('monthly'),
  });

  let options: z.infer<typeof schema>;
  try {
    const rawBody = await c.req.json().catch(() => ({}));
    options = schema.parse(rawBody);
  } catch {
    options = { seats: 1, billingPeriod: 'monthly' };
  }

  try {
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT id, name, slug, stripe_customer_id, plan
      FROM accounts WHERE id = ?
    `).bind(session.accountId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    if (account.plan === 'team') {
      return c.json({ error: 'Already on Team plan' }, 400);
    }

    // Get user email for Stripe
    const userRecord = await c.env.PLATFORM_DB.prepare(`
      SELECT email FROM users WHERE id = ?
    `).bind(session.userId).first();

    // Create or get Stripe customer
    let customerId = account.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>(
        c.env.STRIPE_SECRET_KEY,
        '/customers',
        {
          method: 'POST',
          body: encodeFormData({
            email: userRecord?.email as string,
            name: account.name as string,
            'metadata[buoy_account_id]': account.id as string,
          }),
        }
      );
      customerId = customer.id;

      // Save customer ID
      await c.env.PLATFORM_DB.prepare(`
        UPDATE accounts SET stripe_customer_id = ? WHERE id = ?
      `).bind(customerId, session.accountId).run();
    }

    // Select price based on billing period
    const priceId = options.billingPeriod === 'annual'
      ? PLANS.team.priceIdAnnual
      : PLANS.team.priceIdMonthly;

    // Create checkout session with per-seat quantity
    const checkoutSession = await stripeRequest<{
      id: string;
      url: string;
    }>(
      c.env.STRIPE_SECRET_KEY,
      '/checkout/sessions',
      {
        method: 'POST',
        body: encodeFormData({
          customer: customerId,
          mode: 'subscription',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': options.seats,
          'line_items[0][adjustable_quantity][enabled]': true,
          'line_items[0][adjustable_quantity][minimum]': 1,
          success_url: `${c.env.CORS_ORIGIN}/settings/billing?success=true`,
          cancel_url: `${c.env.CORS_ORIGIN}/settings/billing?canceled=true`,
          'subscription_data[metadata][buoy_account_id]': account.id as string,
          'subscription_data[metadata][initial_seats]': options.seats,
          allow_promotion_codes: true,
        }),
      }
    );

    return c.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      seats: options.seats,
      billingPeriod: options.billingPeriod,
      pricePerSeat: options.billingPeriod === 'annual'
        ? PLANS.team.amountAnnual / 12
        : PLANS.team.amountMonthly,
    });
  } catch (error) {
    console.error('Error creating checkout:', error);
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }
});

/**
 * Create customer portal session for managing subscription
 */
billing.post('/billing/portal', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owners can manage billing
  const user = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!user || user.role !== 'owner') {
    return c.json({ error: 'Only account owners can manage billing' }, 403);
  }

  try {
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT stripe_customer_id FROM accounts WHERE id = ?
    `).bind(session.accountId).first();

    if (!account?.stripe_customer_id) {
      return c.json({ error: 'No billing account found' }, 400);
    }

    // Create portal session
    const portalSession = await stripeRequest<{ url: string }>(
      c.env.STRIPE_SECRET_KEY,
      '/billing_portal/sessions',
      {
        method: 'POST',
        body: encodeFormData({
          customer: account.stripe_customer_id as string,
          return_url: `${c.env.CORS_ORIGIN}/settings/billing`,
        }),
      }
    );

    return c.json({ portalUrl: portalSession.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return c.json({ error: 'Failed to create portal session' }, 500);
  }
});

/**
 * Request cancellation (capture reason before actual cancellation)
 */
billing.post('/billing/cancel-request', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owners can cancel
  const user = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!user || user.role !== 'owner') {
    return c.json({ error: 'Only account owners can cancel' }, 403);
  }

  const schema = z.object({
    reason: z.string().min(1).max(1000),
    feedback: z.string().max(2000).optional(),
  });

  let body: z.infer<typeof schema>;
  try {
    const rawBody = await c.req.json();
    body = schema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  try {
    const now = new Date().toISOString();

    // Record cancellation request
    await c.env.PLATFORM_DB.prepare(`
      UPDATE accounts
      SET cancellation_requested_at = ?, cancellation_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, body.reason, now, session.accountId).run();

    // Log for analysis
    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO audit_logs (id, account_id, user_id, action, metadata, created_at)
      VALUES (?, ?, ?, 'billing.cancel_request', ?, ?)
    `).bind(
      `log_${nanoid(21)}`,
      session.accountId,
      session.userId,
      JSON.stringify({ reason: body.reason, feedback: body.feedback }),
      now
    ).run();

    return c.json({
      success: true,
      message: 'Cancellation request recorded. Your subscription will remain active until the end of the current billing period.',
    });
  } catch (error) {
    console.error('Error recording cancellation:', error);
    return c.json({ error: 'Failed to process cancellation request' }, 500);
  }
});

// ============================================================================
// Stripe Webhook Handler
// ============================================================================

/**
 * Handle Stripe webhooks
 */
billing.post('/webhooks/stripe', async (c) => {
  const signature = c.req.header('Stripe-Signature');

  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const body = await c.req.text();

  // Verify webhook signature
  const isValid = await verifyStripeWebhook(
    body,
    signature,
    c.env.STRIPE_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.error('Invalid Stripe webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body) as {
    id: string;
    type: string;
    data: {
      object: Record<string, unknown>;
    };
  };

  console.log(`Stripe webhook received: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(c.env, event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(c.env, event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(c.env, event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(c.env, event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(c.env, event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(c.env, event.data.object);
        break;

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error(`Error handling Stripe webhook ${event.type}:`, error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// ============================================================================
// Webhook Event Handlers
// ============================================================================

async function handleCheckoutCompleted(
  env: Env,
  session: Record<string, unknown>
): Promise<void> {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const metadata = session.metadata as Record<string, string> | undefined;

  if (!subscriptionId) {
    console.log('Checkout completed but no subscription (one-time payment?)');
    return;
  }

  // Find account by customer ID
  const account = await env.PLATFORM_DB.prepare(`
    SELECT id FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    console.error(`No account found for Stripe customer: ${customerId}`);
    return;
  }

  // Extract seat count from subscription metadata
  const initialSeats = metadata?.initial_seats ? parseInt(metadata.initial_seats, 10) : 1;

  // Determine billing period from subscription (need to fetch it)
  let billingPeriod = 'monthly';
  try {
    const sub = await stripeRequest<{
      items: { data: Array<{ price: { recurring: { interval: string } } }> };
    }>(
      env.STRIPE_SECRET_KEY,
      `/subscriptions/${subscriptionId}`,
      { method: 'GET' }
    );
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    billingPeriod = interval === 'year' ? 'annual' : 'monthly';
  } catch (err) {
    console.error('Error fetching subscription details:', err);
  }

  const now = new Date().toISOString();

  // Upgrade to Team with seat tracking
  await env.PLATFORM_DB.prepare(`
    UPDATE accounts
    SET
      plan = 'team',
      stripe_subscription_id = ?,
      seat_count = ?,
      billing_period = ?,
      user_limit = NULL,
      trial_converted = 1,
      payment_status = 'active',
      updated_at = ?
    WHERE id = ?
  `).bind(subscriptionId, initialSeats, billingPeriod, now, account.id).run();

  console.log(`Account ${account.id} upgraded to Team with ${initialSeats} seats (${billingPeriod})`);
}

async function handleSubscriptionUpdated(
  env: Env,
  subscription: Record<string, unknown>
): Promise<void> {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id as string;
  const status = subscription.status as string;

  // Extract seat count and billing period from subscription items
  const items = subscription.items as { data?: Array<{ quantity?: number; price?: { recurring?: { interval?: string } } }> } | undefined;
  const seatCount = items?.data?.[0]?.quantity || 1;
  const interval = items?.data?.[0]?.price?.recurring?.interval;
  const billingPeriod = interval === 'year' ? 'annual' : 'monthly';

  const account = await env.PLATFORM_DB.prepare(`
    SELECT id FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    console.error(`No account found for Stripe customer: ${customerId}`);
    return;
  }

  const now = new Date().toISOString();

  // Map Stripe status to our payment status
  let paymentStatus = 'active';
  if (status === 'past_due') {
    paymentStatus = 'past_due';
  } else if (status === 'unpaid' || status === 'canceled') {
    paymentStatus = 'unpaid';
  }

  await env.PLATFORM_DB.prepare(`
    UPDATE accounts
    SET
      stripe_subscription_id = ?,
      seat_count = ?,
      billing_period = ?,
      payment_status = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(subscriptionId, seatCount, billingPeriod, paymentStatus, now, account.id).run();

  console.log(`Subscription updated for account ${account.id}: ${status}, ${seatCount} seats (${billingPeriod})`);
}

async function handleSubscriptionDeleted(
  env: Env,
  subscription: Record<string, unknown>
): Promise<void> {
  const customerId = subscription.customer as string;

  const account = await env.PLATFORM_DB.prepare(`
    SELECT id FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    console.error(`No account found for Stripe customer: ${customerId}`);
    return;
  }

  const now = new Date().toISOString();

  // Downgrade to Free (reset seat tracking)
  await env.PLATFORM_DB.prepare(`
    UPDATE accounts
    SET
      plan = 'free',
      stripe_subscription_id = NULL,
      seat_count = 1,
      billing_period = NULL,
      user_limit = NULL,
      payment_status = 'active',
      canceled_at = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(now, now, account.id).run();

  console.log(`Account ${account.id} downgraded to Free`);
}

async function handleTrialWillEnd(
  env: Env,
  subscription: Record<string, unknown>
): Promise<void> {
  const customerId = subscription.customer as string;
  const trialEnd = subscription.trial_end as number;

  const account = await env.PLATFORM_DB.prepare(`
    SELECT id, name FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    return;
  }

  // Log for email sending (would integrate with email service)
  console.log(
    `Trial ending for account ${account.id} (${account.name}) at ${new Date(trialEnd * 1000).toISOString()}`
  );

  // In production: Send email reminder about trial ending
}

async function handlePaymentSucceeded(
  env: Env,
  invoice: Record<string, unknown>
): Promise<void> {
  const customerId = invoice.customer as string;

  const account = await env.PLATFORM_DB.prepare(`
    SELECT id FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    return;
  }

  const now = new Date().toISOString();

  // Clear any past_due status
  await env.PLATFORM_DB.prepare(`
    UPDATE accounts
    SET
      payment_status = 'active',
      payment_failed_at = NULL,
      grace_period_ends_at = NULL,
      updated_at = ?
    WHERE id = ?
  `).bind(now, account.id).run();

  console.log(`Payment succeeded for account ${account.id}`);
}

async function handlePaymentFailed(
  env: Env,
  invoice: Record<string, unknown>
): Promise<void> {
  const customerId = invoice.customer as string;
  const attemptCount = invoice.attempt_count as number;

  const account = await env.PLATFORM_DB.prepare(`
    SELECT id, payment_failed_at FROM accounts WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!account) {
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Calculate grace period end (15 days from first failure)
  let graceEndsAt: string;
  if (account.payment_failed_at) {
    // Already in grace period, keep existing date
    const failedAt = new Date(account.payment_failed_at as string);
    graceEndsAt = new Date(failedAt.getTime() + GRACE_PERIOD.SUSPENDED * 24 * 60 * 60 * 1000).toISOString();
  } else {
    // First failure, start grace period
    graceEndsAt = new Date(now.getTime() + GRACE_PERIOD.SUSPENDED * 24 * 60 * 60 * 1000).toISOString();
  }

  await env.PLATFORM_DB.prepare(`
    UPDATE accounts
    SET
      payment_status = 'past_due',
      payment_failed_at = COALESCE(payment_failed_at, ?),
      grace_period_ends_at = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(nowIso, graceEndsAt, nowIso, account.id).run();

  console.log(`Payment failed for account ${account.id} (attempt ${attemptCount})`);

  // In production: Send payment failed email
}

export { billing, PLANS, GRACE_PERIOD };
