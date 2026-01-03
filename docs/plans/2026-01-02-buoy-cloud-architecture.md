# Buoy Cloud Architecture Design

> **Status**: Approved
> **Date**: January 2, 2026
> **Author**: Dylan Tarre + Claude

---

## Overview

This document defines the architecture for Buoy Cloud - the SaaS backend powering the Pro ($299/month) and Enterprise tiers. The system enables:

- Historical drift trend tracking
- Web dashboard for non-CLI users
- GitHub App integration with Check Runs
- Figma sync
- Team management and billing

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| API | Cloudflare Workers | Edge-deployed, TypeScript |
| Primary Database | Cloudflare D1 (SQLite) | Tenant data, graph storage |
| Sessions/Cache | Cloudflare KV | Auth tokens, rate limits |
| Object Storage | Cloudflare R2 | Backups, exports, large reports |
| Queues | Cloudflare Queues | Async webhook processing |
| Billing | Stripe | Subscriptions, invoices |
| Auth | GitHub OAuth | Developer-focused login |

---

## Multi-Tenancy Architecture

### Hybrid Isolation Model

```
┌─────────────────────────────────────────────────────────────────┐
│  CENTRAL DB (buoy_platform)                                     │
│  - accounts, users, apiKeys, billing, subscriptions             │
│  - githubInstallations, members, invites                        │
│  - Shared across all tenants                                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ buoy_tenant_abc  │  │ buoy_tenant_def  │  │ buoy_tenant_xyz  │
│                  │  │                  │  │                  │
│ - projects       │  │ - projects       │  │ - projects       │
│ - scans          │  │ - scans          │  │ - scans          │
│ - components     │  │ - components     │  │ - components     │
│ - tokens         │  │ - tokens         │  │ - tokens         │
│ - driftSignals   │  │ - driftSignals   │  │ - driftSignals   │
│ - snapshots      │  │ - snapshots      │  │ - snapshots      │
│ - graph tables   │  │ - graph tables   │  │ - graph tables   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Why this approach:**
- Complete data isolation - impossible for tenant A to query tenant B
- Easy GDPR compliance - drop database to delete all customer data
- Performance isolation - one tenant can't slow others
- Enterprise customers can verify separation

---

## Database Schema

### Central Platform Database

```typescript
// Accounts & Billing
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'), // free, pro, enterprise

  // Stripe
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),

  // Limits
  userLimit: integer('user_limit').default(3),

  // Trial
  trialStartedAt: integer('trial_started_at', { mode: 'timestamp' }),
  trialEndsAt: integer('trial_ends_at', { mode: 'timestamp' }),
  trialConverted: integer('trial_converted', { mode: 'boolean' }),

  // Payment status
  paymentStatus: text('payment_status').default('active'), // active, past_due, unpaid
  paymentFailedAt: integer('payment_failed_at', { mode: 'timestamp' }),
  gracePeriodEndsAt: integer('grace_period_ends_at', { mode: 'timestamp' }),

  // Cancellation
  cancellationRequestedAt: integer('cancellation_requested_at', { mode: 'timestamp' }),
  cancellationReason: text('cancellation_reason'),

  // Tenant DB reference
  tenantDbName: text('tenant_db_name').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  githubId: text('github_id').unique(),
  role: text('role').notNull().default('member'), // owner, admin, member
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

// API Keys (for CLI)
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // "buoy_abc123" (visible)
  keyHash: text('key_hash').notNull(),     // bcrypt hash of full key
  scopes: text('scopes'),                   // JSON: ["scan:write", "drift:read"]
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Team Invites
export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  invitedBy: text('invited_by').references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// GitHub App Installations
export const githubInstallations = sqliteTable('github_installations', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  installationId: integer('installation_id').notNull(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(), // User, Organization
  accessToken: text('access_token'),           // Encrypted
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Usage Tracking
export const usage = sqliteTable('usage', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  period: text('period').notNull(),          // "2026-01"
  scansCount: integer('scans_count').default(0),
  apiCallsCount: integer('api_calls_count').default(0),
  storageBytes: integer('storage_bytes').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

### Tenant Databases

Each tenant database uses the existing schema from `packages/db/src/schema/index.ts`:
- projects, scans, components, tokens, driftSignals
- snapshots, w3cTokens, commits, developers
- tokenUsages, componentUsages, fileImports
- pullRequests, prComments, feedback
- stories, testFiles, cssClasses, graphEdges

No modifications needed - the entire database belongs to one tenant.

---

## API Routes

### Authentication

```
GET  /auth/github           # Redirect to GitHub OAuth
GET  /auth/callback         # OAuth callback, create session
GET  /auth/me               # Get current user + account
POST /auth/logout           # Clear session
```

### API Keys

```
GET    /api-keys            # List keys for account
POST   /api-keys            # Create new key
DELETE /api-keys/:id        # Revoke key
```

### Projects

```
GET    /projects                        # List projects (paginated)
POST   /projects                        # Create project
GET    /projects/:id                    # Get project details
PATCH  /projects/:id                    # Update settings
DELETE /projects/:id                    # Remove project
GET    /projects/:id/events             # SSE stream for real-time
```

### Scans

```
POST   /projects/:id/scans              # Upload scan results
POST   /projects/:id/scans/chunked      # Large scan upload (streaming)
GET    /projects/:id/scans              # List scans (paginated)
GET    /projects/:id/scans/:scanId      # Get scan details
GET    /projects/:id/scans/latest       # Get most recent
```

### Drift

```
GET    /projects/:id/drift              # List signals (filterable)
GET    /projects/:id/drift/trends       # Time-series data
GET    /projects/:id/drift/summary      # Current summary
PATCH  /projects/:id/drift/:signalId    # Mark resolved
POST   /projects/:id/drift/:signalId/ignore  # Ignore signal
```

### Components & Tokens

```
GET    /projects/:id/components         # List components
GET    /projects/:id/tokens             # List tokens
GET    /projects/:id/graph              # Graph relationships
GET    /projects/:id/search             # Search across all
```

### Team Management

```
GET    /account                         # Account details
PATCH  /account                         # Update account
GET    /account/members                 # List members
DELETE /account/members/:userId         # Remove member
POST   /account/invites                 # Send invite
GET    /account/invites                 # List pending
DELETE /account/invites/:id             # Revoke invite
POST   /invites/:token/accept           # Accept invite (public)
```

### Billing

```
GET    /billing                         # Current plan, usage
GET    /billing/invoices                # Invoice history
POST   /billing/checkout                # Create Stripe checkout
POST   /billing/portal                  # Stripe customer portal
POST   /billing/cancel-request          # Capture cancellation reason
```

### Webhooks

```
POST   /webhooks/github                 # GitHub App events
POST   /webhooks/stripe                 # Stripe events
```

### GitHub Integration

```
GET    /github/install                  # Start GitHub App install
GET    /github/callback                 # Installation callback
GET    /github/installations            # List installations
DELETE /github/installations/:id        # Revoke installation
```

---

## Authentication Flow

### Web Dashboard (GitHub OAuth)

```
1. User visits /auth/github
2. Redirect to GitHub OAuth with state param
3. User authorizes, redirected to /auth/callback
4. Exchange code for access token
5. Fetch user info from GitHub API
6. Create/update user record
7. Create session in KV (7 day TTL)
8. Set httpOnly, secure, sameSite=lax cookie
9. Redirect to dashboard
```

### CLI (API Keys)

```
1. User runs `buoy login`
2. CLI opens browser to https://app.buoy.design/cli-auth
3. User authenticates (if not logged in)
4. Dashboard generates API key, shows to user
5. User copies key or CLI receives via localhost callback
6. CLI stores in ~/.buoy/config.json
7. All CLI requests include: Authorization: Bearer buoy_xxx
```

### API Key Format

```
buoy_live_<account_prefix>_<32_random_bytes>
buoy_test_<account_prefix>_<32_random_bytes>
```

---

## Security Requirements

### Rate Limiting

```typescript
const RATE_LIMITS = {
  '/auth/*':      { requests: 10,  window: 60 },   // 10/min
  '/api-keys':    { requests: 20,  window: 60 },   // 20/min
  '/scans':       { requests: 100, window: 60 },   // 100/min
  '/drift':       { requests: 200, window: 60 },   // 200/min
  '/webhooks/*':  { requests: 100, window: 60 },   // 100/min
};
```

Implemented via KV with sliding window counters.

### Webhook Validation

**GitHub:**
```typescript
const signature = request.headers.get('X-Hub-Signature-256');
const valid = await verifyHmacSha256(body, signature, GITHUB_WEBHOOK_SECRET);
```

**Stripe:**
```typescript
const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
```

### Session Security

```typescript
{
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  domain: '.buoy.design',
}
```

### Tenant Isolation

- All queries scoped to tenant database
- No cross-tenant joins possible
- KV keys prefixed with tenant ID
- R2 paths include tenant ID
- Error messages sanitized (no tenant data in responses)

---

## Billing Integration

### Plans

| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | Up to 3 users, CLI only, local scans |
| Pro | $299/month | Unlimited users, dashboard, trends, Figma, GitHub App |
| Enterprise | Custom | SSO, multi-repo, SLAs, dedicated support |

### Stripe Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription, upgrade plan |
| `customer.subscription.updated` | Handle plan changes |
| `customer.subscription.deleted` | Downgrade to free |
| `customer.subscription.trial_will_end` | Send trial ending email |
| `invoice.payment_succeeded` | Clear past_due status |
| `invoice.payment_failed` | Set past_due, start grace period |

### Grace Period Policy

- Days 1-3: Warning banner, full access
- Days 4-7: Warning banner, no new projects/members
- Days 8-14: Read-only mode
- Day 15+: Account suspended

---

## GitHub App Integration

### Required Permissions

```yaml
permissions:
  pull_requests: write    # Comment on PRs
  checks: write           # Create Check Runs
  contents: read          # Read repo files
  statuses: write         # Commit status
  metadata: read          # Required

events:
  - pull_request
  - check_suite
  - installation
```

### Check Run Flow

```
1. PR opened/updated → webhook received
2. Create Check Run (status: in_progress)
3. Fetch changed files
4. Run drift analysis
5. Update Check Run with:
   - conclusion: success/failure
   - annotations on specific lines
   - summary with drift counts
```

---

## CLI Integration

### New Commands

```bash
buoy login              # Authenticate with Buoy Cloud
buoy logout             # Clear credentials
buoy whoami             # Show current user
buoy link               # Connect project to cloud
buoy unlink             # Disconnect project
buoy sync               # Manually sync pending uploads
```

### Config Storage

**Global** (`~/.buoy/config.json`):
```json
{
  "buoyApiToken": "buoy_live_xxx...",
  "buoyApiEndpoint": "https://api.buoy.design"
}
```

**Project** (`buoy.config.mjs`):
```javascript
export default {
  project: {
    name: 'my-app',
    cloudProjectId: 'prj_abc123'  // Added by buoy link
  }
}
```

### Offline Support

- Scans complete locally even when API unreachable
- Failed uploads queued to `.buoy/sync-queue.json`
- Auto-retry on next successful API call
- `buoy sync` for manual retry

### Large Scan Handling

- Compress payload with gzip
- Chunk uploads for >500 components
- Stream to `/scans/chunked` endpoint

---

## Operations

### Monitoring

| Tool | Purpose |
|------|---------|
| Cloudflare Logpush | Structured logs to Datadog/Grafana |
| Sentry | Error tracking |
| Analytics Engine | Custom metrics |
| Uptime checks | Endpoint availability |

### Backups

- Daily D1 exports to R2 at 3am UTC
- Retention: 30 daily, 12 weekly, 6 monthly
- Cross-region R2 replication for DR

### Tenant Provisioning

On signup:
1. Create D1 database via API
2. Run schema migrations
3. Store binding in central registry
4. Create KV namespace for sessions
5. Send welcome email

### Database Migrations

- Migrations stored in central DB
- Worker runs migrations in batches
- Status tracked per-tenant
- Rollback capability for failures

---

## Data Retention

| Tier | Scan History | Drift History | Backups |
|------|--------------|---------------|---------|
| Free | 30 days | 30 days | None |
| Pro | Unlimited | Unlimited | Daily, 90 day retention |
| Enterprise | Unlimited | Unlimited | Daily, 1 year retention |

---

## Cost Estimates

### 100 Tenants
- Workers: ~$1.50/mo
- D1 Storage: ~$75/mo
- D1 Operations: ~$50/mo
- KV/R2: ~$3/mo
- **Total: ~$130/mo**

### 1,000 Tenants
- Workers: ~$15/mo
- D1 Storage: ~$750/mo
- D1 Operations: ~$525/mo
- KV/R2: ~$30/mo
- **Total: ~$1,320/mo**

---

## Implementation Phases

### Phase 1: Core API (Week 1-2)
- [ ] Workers project setup with wrangler
- [ ] Central DB schema + migrations
- [ ] GitHub OAuth flow
- [ ] Session management in KV
- [ ] Basic CRUD for projects

### Phase 2: CLI Integration (Week 3)
- [ ] `buoy login/logout/whoami` commands
- [ ] `buoy link` command
- [ ] API key management
- [ ] Scan upload endpoint
- [ ] Offline queue + sync

### Phase 3: Dashboard API (Week 4)
- [ ] Drift/trends endpoints
- [ ] Team management
- [ ] Pagination/filtering
- [ ] SSE for real-time

### Phase 4: GitHub App (Week 5)
- [ ] GitHub App creation
- [ ] Installation flow
- [ ] Webhook handling
- [ ] Check Runs integration

### Phase 5: Billing (Week 6)
- [ ] Stripe integration
- [ ] Checkout/portal flows
- [ ] Webhook handlers
- [ ] Plan enforcement

### Phase 6: Production Hardening (Week 7-8)
- [ ] Rate limiting
- [ ] Monitoring/alerting
- [ ] Backup automation
- [ ] Load testing
- [ ] Security audit

---

## Open Questions

1. **Figma sync**: Real-time or manual trigger?
2. **Enterprise SSO**: Build or use WorkOS?
3. **Self-hosted**: Offer on-prem option?

---

## Appendix: Security Checklist

- [ ] Rate limiting on all endpoints
- [ ] Webhook signature verification
- [ ] API key hashing (bcrypt)
- [ ] Session httpOnly, secure, sameSite
- [ ] CORS allowlist (no wildcards)
- [ ] Input validation (Zod schemas)
- [ ] SQL injection prevention (parameterized queries)
- [ ] Tenant isolation verification tests
- [ ] Secrets in Cloudflare Secrets (not env vars)
- [ ] Audit logging for sensitive actions
