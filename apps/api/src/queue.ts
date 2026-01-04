/**
 * Queue Consumer Handler
 *
 * Processes PR scan jobs from the buoy-scan queue
 */

import { nanoid } from 'nanoid';
import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from './env.js';
import { decrypt } from './lib/crypto.js';
import {
  getChangedFiles,
  getFileContent,
  filterScannableFiles,
  checkRateLimit,
  RateLimitError,
} from './lib/github-files.js';
import { scanFileContent, getSignalSignature, filterAgainstBaseline, type DriftSignal } from './lib/scanner.js';
import { formatCommentWithMarker, type CommentData } from './lib/pr-comment.js';
import { postOrUpdateComment } from './lib/github-comments.js';
import { enrichSignalsWithAuthors } from './lib/github-blame.js';

/**
 * Queue message schema for scan jobs
 */
export interface ScanJobMessage {
  type: 'pr_scan' | 'baseline_scan';
  id: string;
  installationId: number;
  repository: {
    owner: string;
    repo: string;
    fullName: string;
    defaultBranch: string;
  };
  pullRequest?: {
    number: number;
    headSha: string;
    baseSha: string;
    headRef: string;
    baseRef: string;
  };
  project: {
    id: string;
    accountId: string;
  };
  enqueuedAt: string;
}

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Queue consumer handler
 * Called by Cloudflare when messages are available in the queue
 */
export async function handleQueue(
  batch: MessageBatch<ScanJobMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const job = message.body;
      console.log(`Processing ${job.type} job: ${job.id}`);

      if (job.type === 'pr_scan' && job.pullRequest) {
        await processPRScan(job, env);
      } else if (job.type === 'baseline_scan') {
        await processBaselineScan(job, env);
      }

      // Acknowledge the message
      message.ack();
    } catch (error) {
      console.error(`Failed to process job:`, error);
      // Message will be retried (up to max_retries)
      message.retry();
    }
  }
}

/**
 * Get a fresh installation token
 */
async function getFreshInstallationToken(
  installationId: number,
  env: Env
): Promise<string> {
  // Generate App JWT
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: env.GITHUB_APP_ID,
  };

  const pemContents = env.GITHUB_APP_PRIVATE_KEY
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

  const jwt = `${data}.${encodedSignature}`;

  // Get installation token
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
    throw new Error(`Failed to get installation token: ${await response.text()}`);
  }

  const tokenData = (await response.json()) as { token: string };
  return tokenData.token;
}

/**
 * Try to claim a scan job (idempotency via UNIQUE constraint)
 * Returns the claim ID if successful, null if already claimed
 */
async function tryClaimJob(
  job: ScanJobMessage,
  env: Env
): Promise<{ claimId: string; existingCommentId: number | null } | null> {
  const claimId = `claim_${nanoid(21)}`;
  const now = new Date().toISOString();

  if (!job.pullRequest) return null;

  try {
    // Try to insert (UNIQUE constraint will reject duplicates)
    await env.PLATFORM_DB.prepare(`
      INSERT INTO scan_claims (id, repo_full_name, pr_number, commit_sha, status, claimed_at)
      VALUES (?, ?, ?, ?, 'processing', ?)
    `).bind(
      claimId,
      job.repository.fullName,
      job.pullRequest.number,
      job.pullRequest.headSha,
      now
    ).run();

    // Find existing comment ID for this PR
    const existingClaim = await env.PLATFORM_DB.prepare(`
      SELECT comment_id FROM scan_claims
      WHERE repo_full_name = ? AND pr_number = ? AND comment_id IS NOT NULL
      ORDER BY claimed_at DESC
      LIMIT 1
    `).bind(job.repository.fullName, job.pullRequest.number).first();

    return {
      claimId,
      existingCommentId: existingClaim?.comment_id as number | null,
    };
  } catch (err: unknown) {
    // Check if it's a unique constraint violation
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      // Check if stale claim (crashed worker)
      const existing = await env.PLATFORM_DB.prepare(`
        SELECT id, status, claimed_at, comment_id FROM scan_claims
        WHERE repo_full_name = ? AND pr_number = ? AND commit_sha = ?
      `).bind(
        job.repository.fullName,
        job.pullRequest.number,
        job.pullRequest.headSha
      ).first();

      if (!existing) return null;

      // If processing for more than 5 minutes, assume stale
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const claimedAt = new Date(existing.claimed_at as string);

      if (existing.status === 'processing' && claimedAt < fiveMinutesAgo) {
        // Delete stale claim and retry
        await env.PLATFORM_DB.prepare(`
          DELETE FROM scan_claims WHERE id = ?
        `).bind(existing.id).run();

        // Recursive call to try again
        return tryClaimJob(job, env);
      }

      // Already being processed or completed
      console.log(`Job already claimed for ${job.repository.fullName}#${job.pullRequest.number}`);
      return null;
    }
    throw err;
  }
}

/**
 * Mark a claim as complete
 */
async function completeClaim(
  claimId: string,
  commentId: number | null,
  status: 'complete' | 'failed',
  env: Env
): Promise<void> {
  await env.PLATFORM_DB.prepare(`
    UPDATE scan_claims
    SET status = ?, comment_id = ?, completed_at = ?
    WHERE id = ?
  `).bind(status, commentId, new Date().toISOString(), claimId).run();
}

/**
 * Get baseline signatures for a project
 */
async function getBaseline(
  projectId: string,
  repoFullName: string,
  env: Env
): Promise<string[]> {
  const baseline = await env.PLATFORM_DB.prepare(`
    SELECT drift_signatures FROM project_baselines
    WHERE project_id = ? AND repo_full_name = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(projectId, repoFullName).first();

  if (!baseline || !baseline.drift_signatures) {
    return [];
  }

  try {
    return JSON.parse(baseline.drift_signatures as string);
  } catch {
    return [];
  }
}

/**
 * Check account plan status
 */
async function checkAccountPlan(
  accountId: string,
  env: Env
): Promise<{ allowed: boolean; reason?: string }> {
  const account = await env.PLATFORM_DB.prepare(`
    SELECT plan, payment_status FROM accounts WHERE id = ?
  `).bind(accountId).first();

  if (!account) {
    return { allowed: false, reason: 'account_not_found' };
  }

  if (account.plan === 'free') {
    // Free tier should use GitHub Actions, not App
    return { allowed: false, reason: 'free_tier' };
  }

  if (account.payment_status === 'suspended' || account.payment_status === 'canceled') {
    return { allowed: false, reason: 'account_suspended' };
  }

  return { allowed: true };
}

/**
 * Process a PR scan job
 */
async function processPRScan(job: ScanJobMessage, env: Env): Promise<void> {
  const { owner, repo, fullName } = job.repository;
  const pr = job.pullRequest!;

  console.log(`Scanning PR ${fullName}#${pr.number} at ${pr.headSha}`);

  // 1. Check account plan
  const planCheck = await checkAccountPlan(job.project.accountId, env);
  if (!planCheck.allowed) {
    console.log(`Skipping scan: ${planCheck.reason}`);
    return;
  }

  // 2. Try to claim the job (idempotency)
  const claim = await tryClaimJob(job, env);
  if (!claim) {
    console.log(`Job already claimed, skipping`);
    return;
  }

  try {
    // 3. Get fresh installation token
    const token = await getFreshInstallationToken(job.installationId, env);

    // 4. Check rate limit
    const rateLimit = await checkRateLimit(token);

    if (rateLimit.remaining < 100) {
      // Post deferred comment
      const deferredComment = formatCommentWithMarker({
        signals: [],
        baselineCount: 0,
        deferred: true,
        deferredResetAt: rateLimit.resetAt,
      });

      const { commentId } = await postOrUpdateComment(
        owner,
        repo,
        pr.number,
        deferredComment,
        token,
        claim.existingCommentId || undefined
      );

      await completeClaim(claim.claimId, commentId, 'complete', env);

      // Requeue for later
      const delaySeconds = Math.max(0, Math.floor((rateLimit.resetAt.getTime() - Date.now()) / 1000));
      await env.SCAN_QUEUE.send(job, { delaySeconds });

      console.log(`Deferred scan until ${rateLimit.resetAt.toISOString()}`);
      return;
    }

    // 5. Get changed files
    const { files } = await getChangedFiles(owner, repo, pr.number, token);
    const scannableFiles = filterScannableFiles(files);

    // 6. Apply rate limit degradation
    const maxFiles = rateLimit.remaining > 500 ? Infinity : 20;
    const filesToScan = scannableFiles.slice(0, maxFiles);
    const truncated = scannableFiles.length > filesToScan.length;

    // 7. Scan files
    const allSignals: DriftSignal[] = [];

    for (const file of filesToScan) {
      try {
        const { content } = await getFileContent(owner, repo, file.sha, token);
        const signals = scanFileContent(content, file.filename);
        allSignals.push(...signals);
      } catch (err) {
        console.warn(`Failed to scan ${file.filename}:`, err);
      }
    }

    // 8. Filter against baseline
    const baselineSignatures = await getBaseline(job.project.id, fullName, env);
    const newSignals = await filterAgainstBaseline(allSignals, baselineSignatures);

    // 9. Enrich signals with author info from git blame
    const enrichedSignals = await enrichSignalsWithAuthors(
      newSignals,
      owner,
      repo,
      pr.headSha,
      token
    );

    // 10. Format and post comment
    const commentData: CommentData = {
      signals: enrichedSignals,
      baselineCount: baselineSignatures.length,
      truncated,
      scannedCount: filesToScan.length,
      totalCount: scannableFiles.length,
    };

    const comment = formatCommentWithMarker(commentData);
    const { commentId } = await postOrUpdateComment(
      owner,
      repo,
      pr.number,
      comment,
      token,
      claim.existingCommentId || undefined
    );

    // 11. Mark complete
    await completeClaim(claim.claimId, commentId, 'complete', env);

    console.log(`Scan complete: ${enrichedSignals.length} signals, comment ${commentId}`);
  } catch (error) {
    console.error(`PR scan failed:`, error);
    await completeClaim(claim.claimId, null, 'failed', env);
    throw error;
  }
}

/**
 * Process a baseline scan job
 */
async function processBaselineScan(job: ScanJobMessage, env: Env): Promise<void> {
  const { owner, repo, fullName, defaultBranch } = job.repository;

  console.log(`Scanning baseline for ${fullName}@${defaultBranch}`);

  // 1. Check account plan
  const planCheck = await checkAccountPlan(job.project.accountId, env);
  if (!planCheck.allowed) {
    console.log(`Skipping baseline scan: ${planCheck.reason}`);
    return;
  }

  try {
    // 2. Get fresh installation token
    const token = await getFreshInstallationToken(job.installationId, env);

    // 3. Get tree of default branch (up to 100 files for baseline)
    const treeRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!treeRes.ok) {
      throw new Error(`Failed to get tree: ${await treeRes.text()}`);
    }

    const tree = (await treeRes.json()) as {
      tree: Array<{ path: string; sha: string; type: string; size?: number }>;
    };

    // Filter to scannable files
    const scannableExtensions = ['tsx', 'jsx', 'vue', 'svelte', 'astro'];
    const scannableFiles = tree.tree
      .filter((item) => {
        if (item.type !== 'blob') return false;
        const ext = item.path.split('.').pop()?.toLowerCase();
        if (!ext || !scannableExtensions.includes(ext)) return false;
        if (item.size && item.size > 100_000) return false;
        return true;
      })
      .slice(0, 100); // Limit for baseline

    // 4. Scan files and collect signatures
    const allSignatures: string[] = [];

    for (const file of scannableFiles) {
      try {
        const { content } = await getFileContent(owner, repo, file.sha, token);
        const signals = scanFileContent(content, file.path);

        for (const signal of signals) {
          const signature = await getSignalSignature(signal);
          allSignatures.push(signature);
        }
      } catch (err) {
        console.warn(`Failed to scan ${file.path}:`, err);
      }
    }

    // 5. Get latest commit SHA
    const refRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    const ref = (await refRes.json()) as { object: { sha: string } };
    const baselineSha = ref.object.sha;

    // 6. Upsert baseline
    const now = new Date().toISOString();
    const baselineId = `base_${nanoid(21)}`;

    await env.PLATFORM_DB.prepare(`
      INSERT INTO project_baselines (id, project_id, repo_full_name, baseline_sha, drift_signatures, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (project_id, repo_full_name)
      DO UPDATE SET baseline_sha = ?, drift_signatures = ?, updated_at = ?
    `).bind(
      baselineId,
      job.project.id,
      fullName,
      baselineSha,
      JSON.stringify([...new Set(allSignatures)]),
      now,
      now,
      baselineSha,
      JSON.stringify([...new Set(allSignatures)]),
      now
    ).run();

    console.log(`Baseline created: ${allSignatures.length} unique signals at ${baselineSha}`);
  } catch (error) {
    console.error(`Baseline scan failed:`, error);
    throw error;
  }
}
