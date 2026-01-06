/**
 * GitHub App Routes
 *
 * Installation Flow:
 * GET  /github/install              - Start GitHub App installation
 * GET  /github/callback             - Installation callback
 * GET  /github/installations        - List installations for account
 * DELETE /github/installations/:id  - Revoke installation
 *
 * Webhooks:
 * POST /webhooks/github             - GitHub webhook handler
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';
import type { ScanJobMessage } from '../queue.js';

const github = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// GitHub App Configuration
// ============================================================================

const GITHUB_APP_NAME = 'buoy-design';
const GITHUB_API_BASE = 'https://api.github.com';

// ============================================================================
// Webhook Event Schemas
// ============================================================================

const installationEventSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'unsuspend', 'new_permissions_accepted']),
  installation: z.object({
    id: z.number(),
    account: z.object({
      login: z.string(),
      id: z.number(),
      type: z.enum(['User', 'Organization']),
      avatar_url: z.string().optional(),
    }),
    repository_selection: z.enum(['all', 'selected']),
    permissions: z.record(z.string()).optional(),
  }),
  repositories: z.array(z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  })).optional(),
  sender: z.object({
    login: z.string(),
    id: z.number(),
  }),
});

const pullRequestEventSchema = z.object({
  action: z.enum(['opened', 'synchronize', 'reopened', 'closed']),
  number: z.number(),
  pull_request: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    base: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    user: z.object({
      login: z.string(),
    }),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string(),
  }),
  installation: z.object({
    id: z.number(),
  }).optional(),
});

const checkSuiteEventSchema = z.object({
  action: z.enum(['requested', 'rerequested', 'completed']),
  check_suite: z.object({
    id: z.number(),
    head_branch: z.string(),
    head_sha: z.string(),
    status: z.string().optional(),
    conclusion: z.string().optional(),
    pull_requests: z.array(z.object({
      number: z.number(),
    })).optional(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  }),
  installation: z.object({
    id: z.number(),
  }).optional(),
});

const pushEventSchema = z.object({
  ref: z.string(), // refs/heads/main
  after: z.string(), // commit SHA
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string(),
  }),
  installation: z.object({
    id: z.number(),
  }).optional(),
});

// ============================================================================
// Crypto Utilities
// ============================================================================

async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const signatureHex = signature.slice(7);
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
    encoder.encode(payload)
  );

  const expectedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (signatureHex.length !== expectedHex.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signatureHex.length; i++) {
    result |= signatureHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate JWT for GitHub App authentication
 */
async function generateAppJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago (clock skew)
    exp: now + 600, // Expires in 10 minutes
    iss: appId,
  };

  // Parse PEM private key
  const pemContents = privateKey
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(data)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${encodedSignature}`;
}

/**
 * Get installation access token
 */
async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId: number
): Promise<{ token: string; expiresAt: string }> {
  const jwt = await generateAppJWT(appId, privateKey);

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installation token: ${error}`);
  }

  const data = await response.json() as { token: string; expires_at: string };
  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

// ============================================================================
// Installation Routes
// ============================================================================

/**
 * Start GitHub App installation
 * Redirects to GitHub App installation page
 */
github.get('/github/install', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Store state for callback verification
  const state = nanoid(32);
  await c.env.SESSIONS.put(
    `github_install_state:${state}`,
    JSON.stringify({
      accountId: session.accountId,
      userId: session.userId,
      createdAt: new Date().toISOString(),
    }),
    { expirationTtl: 600 } // 10 minutes
  );

  const installUrl = `https://github.com/apps/${GITHUB_APP_NAME}/installations/new?state=${state}`;

  return c.redirect(installUrl);
});

/**
 * GitHub App installation callback
 * Called after user installs or configures the app
 */
github.get('/github/callback', async (c) => {
  const installationId = c.req.query('installation_id');
  const setupAction = c.req.query('setup_action');
  const state = c.req.query('state');

  if (!installationId || !state) {
    return c.json({ error: 'Missing installation_id or state' }, 400);
  }

  // Verify state
  const stateData = await c.env.SESSIONS.get(`github_install_state:${state}`);
  if (!stateData) {
    return c.json({ error: 'Invalid or expired state' }, 400);
  }

  const { accountId, userId } = JSON.parse(stateData) as {
    accountId: string;
    userId: string;
  };

  // Clean up state
  await c.env.SESSIONS.delete(`github_install_state:${state}`);

  try {
    // Get installation details from GitHub
    const jwt = await generateAppJWT(
      c.env.GITHUB_APP_ID,
      c.env.GITHUB_APP_PRIVATE_KEY
    );

    const installResponse = await fetch(
      `${GITHUB_API_BASE}/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!installResponse.ok) {
      const error = await installResponse.text();
      console.error('Failed to get installation:', error);
      return c.json({ error: 'Failed to verify installation' }, 500);
    }

    const installation = await installResponse.json() as {
      id: number;
      account: {
        login: string;
        type: string;
        avatar_url?: string;
      };
      repository_selection: string;
    };

    // Get installation token
    const { token, expiresAt } = await getInstallationToken(
      c.env.GITHUB_APP_ID,
      c.env.GITHUB_APP_PRIVATE_KEY,
      parseInt(installationId, 10)
    );

    const now = new Date().toISOString();

    // Check if installation already exists
    const existing = await c.env.PLATFORM_DB.prepare(`
      SELECT id FROM github_installations WHERE installation_id = ?
    `).bind(parseInt(installationId, 10)).first();

    if (existing) {
      // Update existing installation
      await c.env.PLATFORM_DB.prepare(`
        UPDATE github_installations
        SET
          account_id = ?,
          account_login = ?,
          account_type = ?,
          account_avatar_url = ?,
          access_token = ?,
          token_expires_at = ?,
          repository_selection = ?,
          suspended_at = NULL,
          updated_at = ?
        WHERE installation_id = ?
      `).bind(
        accountId,
        installation.account.login,
        installation.account.type,
        installation.account.avatar_url || null,
        token,
        expiresAt,
        installation.repository_selection,
        now,
        parseInt(installationId, 10)
      ).run();
    } else {
      // Create new installation record
      await c.env.PLATFORM_DB.prepare(`
        INSERT INTO github_installations (
          id, account_id, installation_id,
          account_login, account_type, account_avatar_url,
          access_token, token_expires_at,
          repository_selection,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `ghi_${nanoid(21)}`,
        accountId,
        parseInt(installationId, 10),
        installation.account.login,
        installation.account.type,
        installation.account.avatar_url || null,
        token,
        expiresAt,
        installation.repository_selection,
        now,
        now
      ).run();
    }

    // Redirect to dashboard with success
    const redirectUrl = `${c.env.CORS_ORIGIN}/settings/integrations?github=connected`;
    return c.redirect(redirectUrl);
  } catch (error) {
    console.error('GitHub callback error:', error);
    const redirectUrl = `${c.env.CORS_ORIGIN}/settings/integrations?github=error`;
    return c.redirect(redirectUrl);
  }
});

/**
 * List GitHub installations for account
 */
github.get('/github/installations', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, installation_id, account_login, account_type, account_avatar_url,
        repository_selection, suspended_at, created_at, updated_at
      FROM github_installations
      WHERE account_id = ?
      ORDER BY created_at DESC
    `).bind(session.accountId).all();

    const installations = (result.results || []).map((row) => ({
      id: row.id,
      installationId: row.installation_id,
      accountLogin: row.account_login,
      accountType: row.account_type,
      avatarUrl: row.account_avatar_url,
      repositorySelection: row.repository_selection,
      suspended: !!row.suspended_at,
      suspendedAt: row.suspended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({ installations });
  } catch (error) {
    console.error('Error listing installations:', error);
    return c.json({ error: 'Failed to list installations' }, 500);
  }
});

/**
 * Revoke GitHub installation
 */
github.delete('/github/installations/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const installationDbId = c.req.param('id');

  // Get installation
  const installation = await c.env.PLATFORM_DB.prepare(`
    SELECT installation_id FROM github_installations
    WHERE id = ? AND account_id = ?
  `).bind(installationDbId, session.accountId).first();

  if (!installation) {
    return c.json({ error: 'Installation not found' }, 404);
  }

  try {
    // Delete from our database (GitHub will notify via webhook if user uninstalls there)
    await c.env.PLATFORM_DB.prepare(`
      DELETE FROM github_installations WHERE id = ? AND account_id = ?
    `).bind(installationDbId, session.accountId).run();

    return c.json({ success: true, deleted: installationDbId });
  } catch (error) {
    console.error('Error deleting installation:', error);
    return c.json({ error: 'Failed to delete installation' }, 500);
  }
});

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * GitHub webhook handler
 * Handles: installation, pull_request, check_suite events
 */
github.post('/webhooks/github', async (c) => {
  const signature = c.req.header('X-Hub-Signature-256');
  const event = c.req.header('X-GitHub-Event');
  const deliveryId = c.req.header('X-GitHub-Delivery');

  if (!signature || !event) {
    return c.json({ error: 'Missing signature or event header' }, 400);
  }

  // Get raw body for signature verification
  const body = await c.req.text();

  // Verify webhook signature
  const isValid = await verifyWebhookSignature(
    body,
    signature,
    c.env.GITHUB_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.error('Invalid webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(body);

  console.log(`GitHub webhook received: ${event} (${deliveryId})`);

  try {
    switch (event) {
      case 'installation':
        await handleInstallationEvent(c, payload);
        break;

      case 'installation_repositories':
        await handleInstallationRepositoriesEvent(c, payload);
        break;

      case 'pull_request':
        await handlePullRequestEvent(c, payload);
        break;

      case 'check_suite':
        await handleCheckSuiteEvent(c, payload);
        break;

      case 'push':
        await handlePushEvent(c, payload);
        break;

      case 'ping':
        // GitHub sends this when webhook is first configured
        return c.json({ message: 'pong', hook_id: payload.hook_id });

      default:
        console.log(`Unhandled event type: ${event}`);
    }

    return c.json({ received: true, event, deliveryId });
  } catch (error) {
    console.error(`Error handling ${event} webhook:`, error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// ============================================================================
// Webhook Event Handlers
// ============================================================================

async function handleInstallationEvent(
  c: { env: Env },
  payload: unknown
): Promise<void> {
  const data = installationEventSchema.parse(payload);
  const now = new Date().toISOString();

  switch (data.action) {
    case 'created':
      // New installation - enqueue baseline scans for all repositories
      console.log(`Installation created: ${data.installation.id} for ${data.installation.account.login}`);

      // Get the installation from DB to find the account
      const installation = await c.env.PLATFORM_DB.prepare(`
        SELECT account_id FROM github_installations WHERE installation_id = ?
      `).bind(data.installation.id).first();

      if (installation && data.repositories) {
        // Enqueue baseline scan for each repository
        for (const repo of data.repositories) {
          // Find project for this repo
          const project = await c.env.PLATFORM_DB.prepare(`
            SELECT id FROM projects WHERE account_id = ? AND repo_url LIKE ?
          `).bind(installation.account_id, `%${repo.full_name}%`).first();

          if (project) {
            const jobMessage: ScanJobMessage = {
              type: 'baseline_scan',
              id: `job_${nanoid(21)}`,
              installationId: data.installation.id,
              repository: {
                owner: repo.full_name.split('/')[0],
                repo: repo.name,
                fullName: repo.full_name,
                defaultBranch: 'main', // Will be determined when processing
              },
              project: {
                id: project.id as string,
                accountId: installation.account_id as string,
              },
              enqueuedAt: now,
            };

            await c.env.SCAN_QUEUE.send(jobMessage);
            console.log(`Enqueued baseline scan for ${repo.full_name}`);
          }
        }
      }
      break;

    case 'deleted':
      // Installation removed - delete from our database
      await c.env.PLATFORM_DB.prepare(`
        DELETE FROM github_installations WHERE installation_id = ?
      `).bind(data.installation.id).run();
      console.log(`Installation deleted: ${data.installation.id}`);
      break;

    case 'suspend':
      // Installation suspended
      await c.env.PLATFORM_DB.prepare(`
        UPDATE github_installations
        SET suspended_at = ?, suspended_by = ?, updated_at = ?
        WHERE installation_id = ?
      `).bind(now, data.sender.login, now, data.installation.id).run();
      console.log(`Installation suspended: ${data.installation.id}`);
      break;

    case 'unsuspend':
      // Installation unsuspended
      await c.env.PLATFORM_DB.prepare(`
        UPDATE github_installations
        SET suspended_at = NULL, suspended_by = NULL, updated_at = ?
        WHERE installation_id = ?
      `).bind(now, data.installation.id).run();
      console.log(`Installation unsuspended: ${data.installation.id}`);
      break;
  }
}

async function handleInstallationRepositoriesEvent(
  c: { env: Env },
  payload: { action: string; installation: { id: number }; repositories_added?: Array<{ full_name: string }>; repositories_removed?: Array<{ full_name: string }> }
): Promise<void> {
  const now = new Date().toISOString();

  // Get current selected repositories
  const installation = await c.env.PLATFORM_DB.prepare(`
    SELECT selected_repositories FROM github_installations WHERE installation_id = ?
  `).bind(payload.installation.id).first();

  if (!installation) {
    console.log(`Installation not found: ${payload.installation.id}`);
    return;
  }

  let repos: string[] = installation.selected_repositories
    ? JSON.parse(installation.selected_repositories as string)
    : [];

  if (payload.repositories_added) {
    repos = [...repos, ...payload.repositories_added.map((r) => r.full_name)];
  }

  if (payload.repositories_removed) {
    const removed = new Set(payload.repositories_removed.map((r) => r.full_name));
    repos = repos.filter((r) => !removed.has(r));
  }

  await c.env.PLATFORM_DB.prepare(`
    UPDATE github_installations
    SET selected_repositories = ?, updated_at = ?
    WHERE installation_id = ?
  `).bind(JSON.stringify(repos), now, payload.installation.id).run();

  console.log(`Installation repositories updated: ${payload.installation.id}`);
}

async function handlePullRequestEvent(
  c: { env: Env },
  payload: unknown
): Promise<void> {
  const data = pullRequestEventSchema.parse(payload);

  // Only process opened, synchronize, and reopened events
  if (!['opened', 'synchronize', 'reopened'].includes(data.action)) {
    return;
  }

  if (!data.installation) {
    console.log('No installation ID in pull_request event');
    return;
  }

  // Find the project linked to this repository
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT p.id, p.account_id, gi.id as installation_db_id
    FROM projects p
    JOIN github_installations gi ON gi.account_id = p.account_id
    WHERE p.repo_url LIKE ? AND gi.installation_id = ?
  `).bind(`%${data.repository.full_name}%`, data.installation.id).first();

  if (!project) {
    console.log(`No project found for repo: ${data.repository.full_name}`);
    return;
  }

  // Enqueue PR scan job
  const jobMessage: ScanJobMessage = {
    type: 'pr_scan',
    id: `job_${nanoid(21)}`,
    installationId: data.installation.id,
    repository: {
      owner: data.repository.full_name.split('/')[0],
      repo: data.repository.name,
      fullName: data.repository.full_name,
      defaultBranch: data.repository.default_branch,
    },
    pullRequest: {
      number: data.number,
      headSha: data.pull_request.head.sha,
      baseSha: data.pull_request.base.sha,
      headRef: data.pull_request.head.ref,
      baseRef: data.pull_request.base.ref,
    },
    project: {
      id: project.id as string,
      accountId: project.account_id as string,
    },
    enqueuedAt: new Date().toISOString(),
  };

  await c.env.SCAN_QUEUE.send(jobMessage);
  console.log(`Enqueued PR scan for ${data.repository.full_name}#${data.number}`);
}

async function handleCheckSuiteEvent(
  c: { env: Env },
  payload: unknown
): Promise<void> {
  const data = checkSuiteEventSchema.parse(payload);

  // Only process requested events
  if (data.action !== 'requested' && data.action !== 'rerequested') {
    return;
  }

  if (!data.installation) {
    console.log('No installation ID in check_suite event');
    return;
  }

  // Find the project
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT p.id, p.account_id
    FROM projects p
    JOIN github_installations gi ON gi.account_id = p.account_id
    WHERE p.repo_url LIKE ? AND gi.installation_id = ?
  `).bind(`%${data.repository.full_name}%`, data.installation.id).first();

  if (!project) {
    console.log(`No project found for repo: ${data.repository.full_name}`);
    return;
  }

  const prNumber = data.check_suite.pull_requests?.[0]?.number;

  // For check_suite events, we could also trigger a PR scan if needed
  // But we primarily use pull_request events for PR scanning
  console.log(`Check suite ${data.action} for ${data.repository.full_name}`);
}

async function handlePushEvent(
  c: { env: Env },
  payload: unknown
): Promise<void> {
  const data = pushEventSchema.parse(payload);

  // Only process pushes to default branch
  const defaultBranchRef = `refs/heads/${data.repository.default_branch}`;
  if (data.ref !== defaultBranchRef) {
    return;
  }

  if (!data.installation) {
    console.log('No installation ID in push event');
    return;
  }

  // Find the project linked to this repository
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT p.id, p.account_id
    FROM projects p
    JOIN github_installations gi ON gi.account_id = p.account_id
    WHERE p.repo_url LIKE ? AND gi.installation_id = ?
  `).bind(`%${data.repository.full_name}%`, data.installation.id).first();

  if (!project) {
    console.log(`No project found for repo: ${data.repository.full_name}`);
    return;
  }

  // Enqueue baseline scan to update after merge
  const jobMessage: ScanJobMessage = {
    type: 'baseline_scan',
    id: `job_${nanoid(21)}`,
    installationId: data.installation.id,
    repository: {
      owner: data.repository.full_name.split('/')[0],
      repo: data.repository.name,
      fullName: data.repository.full_name,
      defaultBranch: data.repository.default_branch,
    },
    project: {
      id: project.id as string,
      accountId: project.account_id as string,
    },
    enqueuedAt: new Date().toISOString(),
  };

  await c.env.SCAN_QUEUE.send(jobMessage);
  console.log(`Enqueued baseline update for ${data.repository.full_name}@${data.repository.default_branch}`);
}

// ============================================================================
// Check Runs (Legacy - kept for fallback)
// ============================================================================

interface CheckRunParams {
  owner: string;
  repo: string;
  headSha: string;
  prNumber?: number;
  projectId: string;
}

async function createCheckRun(
  env: Env,
  installationId: number,
  params: CheckRunParams
): Promise<void> {
  const { owner, repo, headSha, prNumber, projectId } = params;

  // Get installation token
  const { token } = await getInstallationToken(
    env.GITHUB_APP_ID,
    env.GITHUB_APP_PRIVATE_KEY,
    installationId
  );

  // Create Check Run in "in_progress" state
  const createResponse = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/check-runs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Buoy Design Drift',
        head_sha: headSha,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        output: {
          title: 'Analyzing design drift...',
          summary: 'Buoy is scanning for design system violations.',
        },
      }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Failed to create Check Run:', error);
    return;
  }

  const checkRun = await createResponse.json() as { id: number };
  console.log(`Created Check Run: ${checkRun.id}`);

  // Get latest scan for this project
  const latestScan = await env.PLATFORM_DB.prepare(`
    SELECT id, drift_count, summary, drift_data
    FROM scans
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(projectId).first();

  // Prepare results
  let conclusion: 'success' | 'failure' | 'neutral' = 'neutral';
  let title = 'No scan data available';
  let summary = 'Run `buoy sweep` to analyze this codebase.';
  let annotations: Array<{
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: 'notice' | 'warning' | 'failure';
    message: string;
    title: string;
  }> = [];

  if (latestScan) {
    const driftCount = latestScan.drift_count as number;
    const scanSummary = latestScan.summary ? JSON.parse(latestScan.summary as string) : {};
    const driftData = latestScan.drift_data ? JSON.parse(latestScan.drift_data as string) : [];

    if (driftCount === 0) {
      conclusion = 'success';
      title = 'No design drift detected';
      summary = 'All components follow design system patterns.';
    } else {
      const errorCount = scanSummary.driftBySeverity?.error || 0;
      const warningCount = scanSummary.driftBySeverity?.warning || 0;

      conclusion = errorCount > 0 ? 'failure' : 'success';
      title = `${driftCount} drift signal${driftCount !== 1 ? 's' : ''} found`;
      summary = `**Design Drift Summary**\n\n` +
        `- Errors: ${errorCount}\n` +
        `- Warnings: ${warningCount}\n` +
        `- Info: ${scanSummary.driftBySeverity?.info || 0}\n\n` +
        `Run \`buoy drift check\` for detailed analysis.`;

      // Create annotations for drift signals (max 50)
      annotations = driftData
        .filter((d: { file?: string }) => d.file)
        .slice(0, 50)
        .map((d: { file: string; line?: number; severity: string; message: string; type: string }) => ({
          path: d.file,
          start_line: d.line || 1,
          end_line: d.line || 1,
          annotation_level: d.severity === 'error' ? 'failure' : d.severity === 'warning' ? 'warning' : 'notice',
          message: d.message,
          title: d.type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        }));
    }
  }

  // Update Check Run with results
  const updateResponse = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/check-runs/${checkRun.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
        conclusion,
        completed_at: new Date().toISOString(),
        output: {
          title,
          summary,
          annotations: annotations.length > 0 ? annotations : undefined,
        },
      }),
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    console.error('Failed to update Check Run:', error);
  } else {
    console.log(`Completed Check Run: ${checkRun.id} with ${conclusion}`);
  }
}

export { github };
