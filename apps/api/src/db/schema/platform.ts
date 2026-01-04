/**
 * Buoy Platform Central Database Schema
 *
 * This schema is for the central platform database (buoy_platform) that stores:
 * - Accounts & billing
 * - Users & authentication
 * - API keys
 * - Team invites
 * - GitHub installations
 * - Usage tracking
 *
 * Tenant-specific data (scans, components, tokens, drift) lives in per-tenant databases.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Accounts & Billing
// ============================================================================

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(), // acc_xxx
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    plan: text('plan').notNull().default('free'), // free, pro, enterprise

    // Stripe integration
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),

    // Limits
    userLimit: integer('user_limit').default(3),

    // Trial tracking
    trialStartedAt: integer('trial_started_at', { mode: 'timestamp' }),
    trialEndsAt: integer('trial_ends_at', { mode: 'timestamp' }),
    trialConverted: integer('trial_converted', { mode: 'boolean' }),

    // Payment status
    paymentStatus: text('payment_status').default('active'), // active, past_due, unpaid, canceled
    paymentFailedAt: integer('payment_failed_at', { mode: 'timestamp' }),
    gracePeriodEndsAt: integer('grace_period_ends_at', { mode: 'timestamp' }),

    // Cancellation
    cancellationRequestedAt: integer('cancellation_requested_at', { mode: 'timestamp' }),
    cancellationReason: text('cancellation_reason'),
    canceledAt: integer('canceled_at', { mode: 'timestamp' }),

    // Tenant DB reference
    tenantDbName: text('tenant_db_name').notNull(),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    slugIdx: index('accounts_slug_idx').on(table.slug),
    stripeCustomerIdx: index('accounts_stripe_customer_idx').on(table.stripeCustomerId),
    planIdx: index('accounts_plan_idx').on(table.plan),
  })
);

// ============================================================================
// Users
// ============================================================================

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(), // usr_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),

    // GitHub OAuth
    githubId: text('github_id'),
    githubLogin: text('github_login'),
    githubAccessToken: text('github_access_token'), // Encrypted

    // Role
    role: text('role').notNull().default('member'), // owner, admin, member

    // Status
    status: text('status').notNull().default('active'), // active, suspended, deleted

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    githubIdIdx: uniqueIndex('users_github_id_idx').on(table.githubId),
    accountIdIdx: index('users_account_id_idx').on(table.accountId),
  })
);

// ============================================================================
// API Keys (for CLI authentication)
// ============================================================================

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(), // key_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Key info
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(), // "buoy_live_abc" (visible part)
    keyHash: text('key_hash').notNull(), // bcrypt hash of full key

    // Scopes (JSON array)
    scopes: text('scopes'), // ["scan:write", "drift:read", "project:read"]

    // Usage tracking
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    lastUsedIp: text('last_used_ip'),

    // Expiration
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    accountIdIdx: index('api_keys_account_id_idx').on(table.accountId),
    userIdIdx: index('api_keys_user_id_idx').on(table.userId),
    prefixIdx: uniqueIndex('api_keys_prefix_idx').on(table.keyPrefix),
  })
);

// ============================================================================
// Team Invites
// ============================================================================

export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(), // inv_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'), // admin, member
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),

    // Token for accepting invite
    token: text('token').notNull().unique(),

    // Status
    status: text('status').notNull().default('pending'), // pending, accepted, expired, revoked
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    acceptedBy: text('accepted_by').references(() => users.id),

    // Expiration
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    accountIdIdx: index('invites_account_id_idx').on(table.accountId),
    emailIdx: index('invites_email_idx').on(table.email),
    tokenIdx: uniqueIndex('invites_token_idx').on(table.token),
  })
);

// ============================================================================
// GitHub App Installations
// ============================================================================

export const githubInstallations = sqliteTable(
  'github_installations',
  {
    id: text('id').primaryKey(), // ghi_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    // GitHub installation info
    installationId: integer('installation_id').notNull(),
    accountLogin: text('account_login').notNull(), // GitHub org/user name
    accountType: text('account_type').notNull(), // User, Organization
    accountAvatarUrl: text('account_avatar_url'),

    // Installation access token (encrypted, refreshed as needed)
    accessToken: text('access_token'),
    tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),

    // Repository selection
    repositorySelection: text('repository_selection'), // all, selected
    selectedRepositories: text('selected_repositories'), // JSON array of repo names

    // Status
    suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
    suspendedBy: text('suspended_by'),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    accountIdIdx: index('github_installations_account_id_idx').on(table.accountId),
    installationIdIdx: uniqueIndex('github_installations_installation_id_idx').on(table.installationId),
  })
);

// ============================================================================
// Usage Tracking (for billing/analytics)
// ============================================================================

export const usage = sqliteTable(
  'usage',
  {
    id: text('id').primaryKey(), // usg_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    // Billing period (YYYY-MM format)
    period: text('period').notNull(),

    // Metrics
    scansCount: integer('scans_count').default(0),
    apiCallsCount: integer('api_calls_count').default(0),
    storageBytes: integer('storage_bytes').default(0),
    prCommentsCount: integer('pr_comments_count').default(0),
    checkRunsCount: integer('check_runs_count').default(0),

    // Timestamps
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    accountPeriodIdx: uniqueIndex('usage_account_period_idx').on(table.accountId, table.period),
  })
);

// ============================================================================
// Audit Log (security-sensitive actions)
// ============================================================================

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(), // aud_xxx
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Action info
    action: text('action').notNull(), // user.login, api_key.created, member.removed, etc.
    resourceType: text('resource_type'), // user, api_key, project, etc.
    resourceId: text('resource_id'),

    // Details (JSON)
    metadata: text('metadata'),

    // Request info
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // Timestamp
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    accountIdIdx: index('audit_logs_account_id_idx').on(table.accountId),
    userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  })
);

// ============================================================================
// Project Baselines (for auto-baseline system)
// ============================================================================

export const projectBaselines = sqliteTable(
  'project_baselines',
  {
    id: text('id').primaryKey(), // base_xxx
    projectId: text('project_id').notNull(),
    repoFullName: text('repo_full_name').notNull(), // owner/repo
    baselineSha: text('baseline_sha').notNull(), // Git commit SHA
    driftSignatures: text('drift_signatures').notNull(), // JSON array of signal hashes
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    projectRepoIdx: uniqueIndex('project_baselines_project_repo_idx').on(table.projectId, table.repoFullName),
  })
);

// ============================================================================
// Scan Claims (for queue idempotency)
// ============================================================================

export const scanClaims = sqliteTable(
  'scan_claims',
  {
    id: text('id').primaryKey(), // claim_xxx
    repoFullName: text('repo_full_name').notNull(), // owner/repo
    prNumber: integer('pr_number').notNull(),
    commitSha: text('commit_sha').notNull(),
    status: text('status').default('processing'), // processing | complete | failed
    commentId: integer('comment_id'), // GitHub comment ID for edits
    claimedAt: integer('claimed_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    uniqueScanIdx: uniqueIndex('scan_claims_unique_idx').on(table.repoFullName, table.prNumber, table.commitSha),
    prIdx: index('scan_claims_pr_idx').on(table.repoFullName, table.prNumber),
  })
);

// ============================================================================
// Type Exports
// ============================================================================

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;

export type GitHubInstallation = typeof githubInstallations.$inferSelect;
export type NewGitHubInstallation = typeof githubInstallations.$inferInsert;

export type Usage = typeof usage.$inferSelect;
export type NewUsage = typeof usage.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type ProjectBaseline = typeof projectBaselines.$inferSelect;
export type NewProjectBaseline = typeof projectBaselines.$inferInsert;

export type ScanClaim = typeof scanClaims.$inferSelect;
export type NewScanClaim = typeof scanClaims.$inferInsert;
