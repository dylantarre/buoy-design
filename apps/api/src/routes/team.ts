/**
 * Team Management Routes
 *
 * GET    /account                    - Get account details
 * PATCH  /account                    - Update account
 * GET    /account/members            - List members
 * PATCH  /account/members/:userId    - Update member role
 * DELETE /account/members/:userId    - Remove member
 * POST   /account/invites            - Send invite
 * GET    /account/invites            - List pending invites
 * DELETE /account/invites/:id        - Revoke invite
 * POST   /invites/:token/accept      - Accept invite (public)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

const team = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Validation Schemas
// ============================================================================

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

// ============================================================================
// Account Routes
// ============================================================================

/**
 * Get account details
 */
team.get('/account', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, name, slug, plan,
        user_limit, seat_count, billing_period,
        trial_started_at, trial_ends_at,
        payment_status, created_at, updated_at
      FROM accounts
      WHERE id = ?
    `).bind(session.accountId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Get member count
    const memberCount = await c.env.PLATFORM_DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE account_id = ?
    `).bind(session.accountId).first();

    // Get pending invite count
    const inviteCount = await c.env.PLATFORM_DB.prepare(`
      SELECT COUNT(*) as count FROM invites
      WHERE account_id = ? AND expires_at > datetime('now')
    `).bind(session.accountId).first();

    return c.json({
      id: account.id,
      name: account.name,
      slug: account.slug,
      plan: account.plan,
      seats: account.plan === 'team' ? {
        purchased: account.seat_count || 1,
        used: (memberCount?.count as number || 0) + (inviteCount?.count as number || 0),
        available: (account.seat_count as number || 1) - ((memberCount?.count as number || 0) + (inviteCount?.count as number || 0)),
        billingPeriod: account.billing_period,
      } : null,
      limits: {
        users: account.user_limit,
        currentUsers: memberCount?.count || 0,
        pendingInvites: inviteCount?.count || 0,
      },
      trial: account.trial_started_at
        ? {
            startedAt: account.trial_started_at,
            endsAt: account.trial_ends_at,
            isActive: account.trial_ends_at && new Date(account.trial_ends_at as string) > new Date(),
          }
        : null,
      paymentStatus: account.payment_status,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    });
  } catch (error) {
    console.error('Error getting account:', error);
    return c.json({ error: 'Failed to get account' }, 500);
  }
});

/**
 * Update account details
 */
team.patch('/account', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owners and admins can update account
  const user = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return c.json({ error: 'Forbidden: requires admin role' }, 403);
  }

  let body: z.infer<typeof updateAccountSchema>;
  try {
    const rawBody = await c.req.json();
    body = updateAccountSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  try {
    const now = new Date().toISOString();

    await c.env.PLATFORM_DB.prepare(`
      UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?
    `).bind(body.name, now, session.accountId).run();

    return c.json({ success: true, name: body.name });
  } catch (error) {
    console.error('Error updating account:', error);
    return c.json({ error: 'Failed to update account' }, 500);
  }
});

// ============================================================================
// Member Routes
// ============================================================================

/**
 * List team members
 */
team.get('/account/members', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, email, name, avatar_url, role,
        created_at, last_login_at
      FROM users
      WHERE account_id = ?
      ORDER BY
        CASE role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END,
        created_at ASC
    `).bind(session.accountId).all();

    const members = (result.results || []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      role: row.role,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      isCurrentUser: row.id === session.userId,
    }));

    return c.json({ members });
  } catch (error) {
    console.error('Error listing members:', error);
    return c.json({ error: 'Failed to list members' }, 500);
  }
});

/**
 * Update member role
 */
team.patch('/account/members/:userId', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const targetUserId = c.req.param('userId');

  // Only owners can change roles
  const currentUser = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!currentUser || currentUser.role !== 'owner') {
    return c.json({ error: 'Forbidden: only owners can change roles' }, 403);
  }

  // Can't change own role
  if (targetUserId === session.userId) {
    return c.json({ error: 'Cannot change your own role' }, 400);
  }

  let body: z.infer<typeof updateMemberSchema>;
  try {
    const rawBody = await c.req.json();
    body = updateMemberSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Can't promote to owner (transfer ownership is separate flow)
  if (body.role === 'owner') {
    return c.json({ error: 'Use ownership transfer to make someone owner' }, 400);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      UPDATE users SET role = ? WHERE id = ? AND account_id = ?
    `).bind(body.role, targetUserId, session.accountId).run();

    if (!result.meta?.changes) {
      return c.json({ error: 'Member not found' }, 404);
    }

    return c.json({ success: true, userId: targetUserId, role: body.role });
  } catch (error) {
    console.error('Error updating member:', error);
    return c.json({ error: 'Failed to update member' }, 500);
  }
});

/**
 * Remove member from team
 */
team.delete('/account/members/:userId', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const targetUserId = c.req.param('userId');

  // Check permissions - owners and admins can remove members
  const currentUser = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
    return c.json({ error: 'Forbidden: requires admin role' }, 403);
  }

  // Can't remove yourself
  if (targetUserId === session.userId) {
    return c.json({ error: 'Cannot remove yourself' }, 400);
  }

  // Get target user's role
  const targetUser = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(targetUserId, session.accountId).first();

  if (!targetUser) {
    return c.json({ error: 'Member not found' }, 404);
  }

  // Owners can't be removed (must transfer ownership first)
  if (targetUser.role === 'owner') {
    return c.json({ error: 'Cannot remove account owner' }, 400);
  }

  // Admins can only remove members, not other admins
  if (currentUser.role === 'admin' && targetUser.role === 'admin') {
    return c.json({ error: 'Admins cannot remove other admins' }, 403);
  }

  try {
    await c.env.PLATFORM_DB.prepare(`
      DELETE FROM users WHERE id = ? AND account_id = ?
    `).bind(targetUserId, session.accountId).run();

    return c.json({ success: true, removed: targetUserId });
  } catch (error) {
    console.error('Error removing member:', error);
    return c.json({ error: 'Failed to remove member' }, 500);
  }
});

// ============================================================================
// Invite Routes
// ============================================================================

/**
 * Send team invite
 */
team.post('/account/invites', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check permissions
  const currentUser = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
    return c.json({ error: 'Forbidden: requires admin role' }, 403);
  }

  let body: z.infer<typeof createInviteSchema>;
  try {
    const rawBody = await c.req.json();
    body = createInviteSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Check if user already exists in account
  const existingUser = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM users WHERE email = ? AND account_id = ?
  `).bind(body.email.toLowerCase(), session.accountId).first();

  if (existingUser) {
    return c.json({ error: 'User is already a member' }, 400);
  }

  // Check for existing pending invite
  const existingInvite = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM invites
    WHERE email = ? AND account_id = ? AND expires_at > datetime('now')
  `).bind(body.email.toLowerCase(), session.accountId).first();

  if (existingInvite) {
    return c.json({ error: 'Invite already sent to this email' }, 400);
  }

  // Check seat limit for paid plans
  const account = await c.env.PLATFORM_DB.prepare(`
    SELECT plan, seat_count, user_limit FROM accounts WHERE id = ?
  `).bind(session.accountId).first();

  const memberCount = await c.env.PLATFORM_DB.prepare(`
    SELECT COUNT(*) as count FROM users WHERE account_id = ?
  `).bind(session.accountId).first();

  const inviteCount = await c.env.PLATFORM_DB.prepare(`
    SELECT COUNT(*) as count FROM invites
    WHERE account_id = ? AND expires_at > datetime('now')
  `).bind(session.accountId).first();

  const totalUsers = ((memberCount?.count as number) || 0) + ((inviteCount?.count as number) || 0);

  // Check seat limit for team plans (per-seat billing)
  if (account?.plan === 'team') {
    const seatCount = (account.seat_count as number) || 1;
    if (totalUsers >= seatCount) {
      return c.json({
        error: 'All seats are in use',
        message: `Your team has ${seatCount} seat${seatCount === 1 ? '' : 's'}. Add more seats in your billing settings to invite more members.`,
        seatsUsed: totalUsers,
        seatsPurchased: seatCount,
      }, 400);
    }
  }
  // Legacy: check user_limit for any old accounts
  else if (account?.user_limit && totalUsers >= (account.user_limit as number)) {
    return c.json({ error: 'User limit reached. Upgrade your plan for more seats.' }, 400);
  }

  try {
    const inviteId = `inv_${nanoid(21)}`;
    const token = nanoid(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO invites (id, account_id, email, role, invited_by, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inviteId,
      session.accountId,
      body.email.toLowerCase(),
      body.role,
      session.userId,
      token,
      expiresAt.toISOString(),
      now.toISOString()
    ).run();

    // In production, send email here via Cloudflare Email Workers or third-party service

    return c.json({
      id: inviteId,
      email: body.email,
      role: body.role,
      expiresAt: expiresAt.toISOString(),
      // Include invite link (in production, this would be in the email)
      inviteUrl: `${c.env.CORS_ORIGIN}/invite/${token}`,
    }, 201);
  } catch (error) {
    console.error('Error creating invite:', error);
    return c.json({ error: 'Failed to send invite' }, 500);
  }
});

/**
 * List pending invites
 */
team.get('/account/invites', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      SELECT
        i.id, i.email, i.role, i.created_at, i.expires_at,
        u.name as invited_by_name, u.email as invited_by_email
      FROM invites i
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.account_id = ? AND i.expires_at > datetime('now')
      ORDER BY i.created_at DESC
    `).bind(session.accountId).all();

    const invites = (result.results || []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      invitedBy: {
        name: row.invited_by_name,
        email: row.invited_by_email,
      },
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));

    return c.json({ invites });
  } catch (error) {
    console.error('Error listing invites:', error);
    return c.json({ error: 'Failed to list invites' }, 500);
  }
});

/**
 * Revoke invite
 */
team.delete('/account/invites/:inviteId', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const inviteId = c.req.param('inviteId');

  // Check permissions
  const currentUser = await c.env.PLATFORM_DB.prepare(`
    SELECT role FROM users WHERE id = ? AND account_id = ?
  `).bind(session.userId, session.accountId).first();

  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
    return c.json({ error: 'Forbidden: requires admin role' }, 403);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      DELETE FROM invites WHERE id = ? AND account_id = ?
    `).bind(inviteId, session.accountId).run();

    if (!result.meta?.changes) {
      return c.json({ error: 'Invite not found' }, 404);
    }

    return c.json({ success: true, revoked: inviteId });
  } catch (error) {
    console.error('Error revoking invite:', error);
    return c.json({ error: 'Failed to revoke invite' }, 500);
  }
});

/**
 * Accept invite (public endpoint)
 */
team.post('/invites/:token/accept', async (c) => {
  const token = c.req.param('token');

  // Find the invite
  const invite = await c.env.PLATFORM_DB.prepare(`
    SELECT
      i.id, i.account_id, i.email, i.role, i.expires_at,
      a.name as account_name
    FROM invites i
    JOIN accounts a ON i.account_id = a.id
    WHERE i.token = ?
  `).bind(token).first();

  if (!invite) {
    return c.json({ error: 'Invalid or expired invite' }, 404);
  }

  if (new Date(invite.expires_at as string) < new Date()) {
    return c.json({ error: 'Invite has expired' }, 400);
  }

  // At this point, the user needs to authenticate via GitHub
  // Return invite details for the frontend to handle
  return c.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    accountName: invite.account_name,
    // Frontend should redirect to GitHub OAuth with this token
    // After auth, it calls POST /invites/:token/complete
  });
});

/**
 * Complete invite acceptance after OAuth
 * This would be called after the user authenticates with GitHub
 */
team.post('/invites/:token/complete', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized - authenticate first' }, 401);
  }

  const token = c.req.param('token');

  // Find the invite
  const invite = await c.env.PLATFORM_DB.prepare(`
    SELECT id, account_id, email, role, expires_at
    FROM invites
    WHERE token = ?
  `).bind(token).first();

  if (!invite) {
    return c.json({ error: 'Invalid or expired invite' }, 404);
  }

  if (new Date(invite.expires_at as string) < new Date()) {
    // Clean up expired invite
    await c.env.PLATFORM_DB.prepare(`
      DELETE FROM invites WHERE id = ?
    `).bind(invite.id).run();
    return c.json({ error: 'Invite has expired' }, 400);
  }

  // Get the current user
  const user = await c.env.PLATFORM_DB.prepare(`
    SELECT id, email FROM users WHERE id = ?
  `).bind(session.userId).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Email should match (case insensitive)
  if ((user.email as string).toLowerCase() !== (invite.email as string).toLowerCase()) {
    return c.json({
      error: 'Email mismatch',
      message: `This invite was sent to ${invite.email}. Please sign in with that email.`,
    }, 400);
  }

  try {
    // Update user's account and role
    await c.env.PLATFORM_DB.prepare(`
      UPDATE users
      SET account_id = ?, role = ?
      WHERE id = ?
    `).bind(invite.account_id, invite.role, session.userId).run();

    // Delete the invite
    await c.env.PLATFORM_DB.prepare(`
      DELETE FROM invites WHERE id = ?
    `).bind(invite.id).run();

    // Get account details
    const account = await c.env.PLATFORM_DB.prepare(`
      SELECT id, name, slug FROM accounts WHERE id = ?
    `).bind(invite.account_id).first();

    return c.json({
      success: true,
      account: {
        id: account?.id,
        name: account?.name,
        slug: account?.slug,
      },
      role: invite.role,
    });
  } catch (error) {
    console.error('Error completing invite:', error);
    return c.json({ error: 'Failed to accept invite' }, 500);
  }
});

export { team };
