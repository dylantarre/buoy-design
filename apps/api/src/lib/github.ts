/**
 * GitHub OAuth Utilities
 */

import type { Env } from '../env.js';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * Build the GitHub OAuth authorization URL
 */
export function buildAuthUrl(env: Env, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCode(
  env: Env,
  code: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange failed: ${data.error} - ${data.error_description || 'No access token'}`);
  }

  return data.access_token;
}

/**
 * Get the authenticated GitHub user
 */
export async function getUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Buoy-Cloud-API',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get GitHub user: ${response.status} - ${text}`);
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * Get the user's email addresses (primary verified email)
 * Falls back to public profile email if emails endpoint fails
 */
export async function getUserEmail(accessToken: string, fallbackEmail?: string | null): Promise<string> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Buoy-Cloud-API',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.ok) {
      const emails = (await response.json()) as GitHubEmail[];

      // Find primary verified email
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) return primary.email;

      // Fallback to any verified email
      const verified = emails.find((e) => e.verified);
      if (verified) return verified.email;
    }
  } catch {
    // Fall through to fallback
  }

  // Use public email from profile if available
  if (fallbackEmail) {
    return fallbackEmail;
  }

  throw new Error('No email found - please make your GitHub email public or grant email access');
}
