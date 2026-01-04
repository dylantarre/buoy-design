/**
 * Authentication Routes
 *
 * GET  /auth/github    - Start GitHub OAuth flow
 * GET  /auth/callback  - GitHub OAuth callback
 * GET  /auth/me        - Get current user
 * POST /auth/logout    - Clear session
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../env.js';
import * as schema from '../db/schema/index.js';
import { createSession, getSession, deleteSession } from '../lib/session.js';
import { buildAuthUrl, exchangeCode, getUser, getUserEmail } from '../lib/github.js';
import { accountId, userId, uniqueSlug } from '../lib/id.js';
import { encrypt } from '../lib/crypto.js';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// OAuth state storage (KV with short TTL)
const STATE_TTL = 60 * 10; // 10 minutes

/**
 * Start GitHub OAuth flow
 */
auth.get('/github', async (c) => {
  // Generate state for CSRF protection
  const state = nanoid(32);

  // Store state in KV
  await c.env.SESSIONS.put(`oauth_state:${state}`, 'pending', {
    expirationTtl: STATE_TTL,
  });

  // Build redirect URI based on host
  const host = c.req.header('Host') || 'localhost:8787';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocalhost ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/auth/callback`;

  // Redirect to GitHub
  const authUrl = buildAuthUrl(c.env, state, redirectUri);
  return c.redirect(authUrl);
});

/**
 * GitHub OAuth callback
 */
auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // Handle OAuth errors
  if (error) {
    return c.redirect(`${c.env.CORS_ORIGIN}/login?error=${error}`);
  }

  if (!code || !state) {
    return c.redirect(`${c.env.CORS_ORIGIN}/login?error=missing_params`);
  }

  // Verify state
  const storedState = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!storedState) {
    return c.redirect(`${c.env.CORS_ORIGIN}/login?error=invalid_state`);
  }

  // Clean up state
  await c.env.SESSIONS.delete(`oauth_state:${state}`);

  try {
    // Build redirect URI
    const host = c.req.header('Host') || 'localhost:8787';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocalhost ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/auth/callback`;

    // Exchange code for token
    const accessToken = await exchangeCode(c.env, code, redirectUri);

    // Get GitHub user info
    const githubUser = await getUser(accessToken);
    // Get email - falls back to public profile email if emails API fails
    const email = await getUserEmail(accessToken, githubUser.email);

    // Encrypt access token for storage
    const encryptedToken = await encrypt(accessToken, c.env.ENCRYPTION_KEY);

    // Initialize Drizzle
    const db = drizzle(c.env.PLATFORM_DB, { schema });

    // Check if user exists
    let user = await db.query.users.findFirst({
      where: eq(schema.users.githubId, String(githubUser.id)),
      with: {
        // Note: we'd need to set up relations for this
      },
    });

    let account: typeof schema.accounts.$inferSelect | undefined;

    if (user) {
      // Existing user - update last login
      await db
        .update(schema.users)
        .set({
          lastLoginAt: new Date(),
          name: githubUser.name || user.name,
          avatarUrl: githubUser.avatar_url,
          githubLogin: githubUser.login,
          githubAccessToken: encryptedToken,
        })
        .where(eq(schema.users.id, user.id));

      // Get their account
      account = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, user.accountId),
      });
    } else {
      // New user - check if invited or create new account
      const invite = await db.query.invites.findFirst({
        where: eq(schema.invites.email, email),
      });

      const now = new Date();

      if (invite && invite.status === 'pending' && invite.expiresAt > now) {
        // Accept invite - join existing account
        account = await db.query.accounts.findFirst({
          where: eq(schema.accounts.id, invite.accountId),
        });

        if (account) {
          // Create user in that account
          const newUserId = userId();
          await db.insert(schema.users).values({
            id: newUserId,
            accountId: account.id,
            email,
            name: githubUser.name || githubUser.login,
            avatarUrl: githubUser.avatar_url,
            githubId: String(githubUser.id),
            githubLogin: githubUser.login,
            githubAccessToken: encryptedToken,
            role: invite.role,
            createdAt: now,
            updatedAt: now,
          });

          // Mark invite as accepted
          await db
            .update(schema.invites)
            .set({
              status: 'accepted',
              acceptedAt: now,
              acceptedBy: newUserId,
            })
            .where(eq(schema.invites.id, invite.id));

          user = await db.query.users.findFirst({
            where: eq(schema.users.id, newUserId),
          });
        }
      } else {
        // Create new account
        const newAccountId = accountId();
        const newUserId = userId();
        const slug = uniqueSlug(githubUser.login);

        await db.insert(schema.accounts).values({
          id: newAccountId,
          name: githubUser.name || githubUser.login,
          slug,
          plan: 'free',
          tenantDbName: `buoy_tenant_${slug.replace(/-/g, '_')}`,
          createdAt: now,
          updatedAt: now,
        });

        await db.insert(schema.users).values({
          id: newUserId,
          accountId: newAccountId,
          email,
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
          githubId: String(githubUser.id),
          githubLogin: githubUser.login,
          githubAccessToken: encryptedToken,
          role: 'owner',
          createdAt: now,
          updatedAt: now,
        });

        user = await db.query.users.findFirst({
          where: eq(schema.users.id, newUserId),
        });

        account = await db.query.accounts.findFirst({
          where: eq(schema.accounts.id, newAccountId),
        });
      }
    }

    if (!user || !account) {
      return c.redirect(`${c.env.CORS_ORIGIN}/login?error=user_creation_failed`);
    }

    // Create session
    await createSession(c, {
      userId: user.id,
      accountId: account.id,
      role: user.role,
      githubLogin: user.githubLogin || undefined,
    });

    // Redirect to dashboard
    return c.redirect(`${c.env.CORS_ORIGIN}/dashboard`);
  } catch (error) {
    console.error('OAuth error:', error);
    const message = error instanceof Error ? error.message : 'unknown';
    // Include error details for debugging (remove in production later)
    return c.redirect(`${c.env.CORS_ORIGIN}/login?error=oauth_failed&details=${encodeURIComponent(message)}`);
  }
});

/**
 * Get current user and account
 */
auth.get('/me', async (c) => {
  const session = await getSession(c);

  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = drizzle(c.env.PLATFORM_DB, { schema });

  const [user, account] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, session.userId),
      columns: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        githubLogin: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    db.query.accounts.findFirst({
      where: eq(schema.accounts.id, session.accountId),
      columns: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        userLimit: true,
        trialEndsAt: true,
        paymentStatus: true,
        createdAt: true,
      },
    }),
  ]);

  if (!user || !account) {
    await deleteSession(c);
    return c.json({ error: 'User or account not found' }, 401);
  }

  return c.json({ user, account });
});

/**
 * Logout - clear session
 */
auth.post('/logout', async (c) => {
  await deleteSession(c);
  return c.json({ success: true });
});

export { auth };
