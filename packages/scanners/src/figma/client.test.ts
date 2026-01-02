import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FigmaClient,
  FigmaAPIError,
  FigmaClientOptions,
  FigmaAuthError,
  FigmaNotFoundError,
  FigmaRateLimitError,
  createFigmaClient,
} from './client.js';

describe('FigmaClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const createClient = (options?: FigmaClientOptions) => {
    return new FigmaClient('test-token', { enableCache: false, deduplicateRequests: false, ...options });
  };

  const mockSuccessResponse = (data: unknown, headers?: Record<string, string>) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
      headers: {
        get: (name: string) => headers?.[name] ?? null,
      },
    });
  };

  const mockErrorResponse = (status: number, statusText: string, body: string, headers?: Record<string, string>) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      statusText,
      text: () => Promise.resolve(body),
      headers: {
        get: (name: string) => headers?.[name] ?? null,
      },
    });
  };

  describe('authentication', () => {
    it('sends X-Figma-Token header with all requests', async () => {
      mockSuccessResponse({ name: 'Test File' });
      const client = createClient();
      await client.getFile('test-key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Figma-Token': 'test-token',
          }),
        })
      );
    });

    it('validates access token is not empty', () => {
      expect(() => new FigmaClient('')).toThrow('Access token is required');
    });

    it('validates access token is not whitespace only', () => {
      expect(() => new FigmaClient('   ')).toThrow('Access token is required');
    });
  });

  describe('rate limiting', () => {
    it('retries on 429 status code', async () => {
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // Advance timers to allow retry
      await vi.advanceTimersByTimeAsync(3000);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects Retry-After header in seconds', async () => {
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited', {
        'Retry-After': '5',
      });
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // Should wait at least 5 seconds as specified by Retry-After
      await vi.advanceTimersByTimeAsync(4900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(600); // 5s + jitter
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects Retry-After header as HTTP-date', async () => {
      // With fake timers, use a date relative to the fake now
      const now = Date.now();
      const retryDate = new Date(now + 3000).toUTCString();
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited', {
        'Retry-After': retryDate,
      });
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // Wait long enough for the retry (3s + jitter up to 500ms)
      await vi.advanceTimersByTimeAsync(4000);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses exponential backoff on rate limit without Retry-After', async () => {
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 1000, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // First retry: ~2000ms (initialDelay * 2 for rate limit) + jitter
      await vi.advanceTimersByTimeAsync(2600);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: ~4000ms (exponential backoff) + jitter
      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('tracks rate limit headers for proactive throttling', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      mockSuccessResponse({ name: 'Test File' }, {
        'X-RateLimit-Remaining': '10',
        'X-RateLimit-Reset': String(resetTime),
      });

      const client = createClient();
      await client.getFile('test-key');

      const rateLimitInfo = client.getRateLimitInfo();
      expect(rateLimitInfo).toBeDefined();
      expect(rateLimitInfo?.remaining).toBe(10);
    });
  });

  describe('exponential backoff', () => {
    it('uses exponential backoff for server errors', async () => {
      mockErrorResponse(503, 'Service Unavailable', 'Server down');
      mockErrorResponse(503, 'Service Unavailable', 'Server down');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 1000, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // First retry: ~1000ms + jitter
      await vi.advanceTimersByTimeAsync(1600);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: ~2000ms + jitter
      await vi.advanceTimersByTimeAsync(2600);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('caps retry delay at 30 seconds', async () => {
      // Set very high initial delay to test cap
      mockErrorResponse(503, 'Service Unavailable', 'Server down');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 20000, maxRetries: 3 });
      const promise = client.getFile('test-key');

      // With 20000ms initial delay and 2^1 multiplier = 40000ms, but capped at 30000ms + jitter
      await vi.advanceTimersByTimeAsync(30600);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('adds jitter to prevent thundering herd', async () => {
      vi.useRealTimers();

      const delays: number[] = [];
      const originalMathRandom = Math.random;
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        // Return different values to verify jitter is applied
        return callCount % 2 === 0 ? 0.5 : 0.8;
      });

      mockErrorResponse(503, 'Service Unavailable', 'Server down');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 1 });

      const startTime = Date.now();
      await client.getFile('test-key');
      const elapsed = Date.now() - startTime;

      // Delay should be around 100ms + jitter (between 0-500ms)
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(700);

      vi.spyOn(Math, 'random').mockRestore();
      vi.useFakeTimers();
    });
  });

  describe('timeout handling', () => {
    it('times out requests after configured duration', async () => {
      mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = options.signal as AbortSignal;
          signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const client = createClient({ timeoutMs: 5000, maxRetries: 0 });

      // Attach catch handler before advancing time to avoid unhandled rejection
      const promise = client.getFile('test-key').catch((e) => e);

      await vi.advanceTimersByTimeAsync(5001);

      const error = await promise;
      expect((error as Error).message).toContain('timed out after 5s');
    });

    it('retries on timeout', async () => {
      mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = options.signal as AbortSignal;
          signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ timeoutMs: 1000, initialRetryDelayMs: 100, maxRetries: 1 });
      const promise = client.getFile('test-key');

      // Advance past first timeout
      await vi.advanceTimersByTimeAsync(1100);
      // Advance past retry delay
      await vi.advanceTimersByTimeAsync(600);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('file and node fetching', () => {
    it('fetches file with getFile', async () => {
      const fileData = {
        name: 'Test File',
        document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
        components: {},
        styles: {},
      };
      mockSuccessResponse(fileData);

      const client = createClient();
      const result = await client.getFile('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123',
        expect.any(Object)
      );
      expect(result).toEqual(fileData);
    });

    it('fetches specific nodes with getNodes', async () => {
      const nodesData = {
        name: 'Test File',
        nodes: {
          '1:1': { document: { id: '1:1', name: 'Button', type: 'COMPONENT' } },
          '1:2': { document: { id: '1:2', name: 'Card', type: 'COMPONENT' } },
        },
      };
      mockSuccessResponse(nodesData);

      const client = createClient();
      const result = await client.getNodes('abc123', ['1:1', '1:2']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/nodes?ids=1%3A1,1%3A2',
        expect.any(Object)
      );
      expect(result).toEqual(nodesData);
    });

    it('fetches file components with getFileComponents', async () => {
      const componentsData = {
        meta: {
          components: [
            { key: 'btn', name: 'Button', description: '', documentationLinks: [] },
          ],
        },
      };
      mockSuccessResponse(componentsData);

      const client = createClient();
      const result = await client.getFileComponents('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/components',
        expect.any(Object)
      );
      expect(result).toEqual(componentsData);
    });

    it('fetches file styles with getFileStyles', async () => {
      const stylesData = {
        meta: {
          styles: [
            { key: 'primary', name: 'Primary', styleType: 'FILL', description: '' },
          ],
        },
      };
      mockSuccessResponse(stylesData);

      const client = createClient();
      const result = await client.getFileStyles('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/styles',
        expect.any(Object)
      );
      expect(result).toEqual(stylesData);
    });

    it('fetches local variables with getLocalVariables', async () => {
      const variablesData = {
        meta: {
          variables: {},
          variableCollections: {},
        },
      };
      mockSuccessResponse(variablesData);

      const client = createClient();
      const result = await client.getLocalVariables('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/variables/local',
        expect.any(Object)
      );
      expect(result).toEqual(variablesData);
    });
  });

  describe('image export', () => {
    it('fetches image URLs for nodes', async () => {
      const imageData = {
        images: {
          '1:1': 'https://figma-alpha.s3.us-west-2.amazonaws.com/img1.png',
          '1:2': 'https://figma-alpha.s3.us-west-2.amazonaws.com/img2.png',
        },
      };
      mockSuccessResponse(imageData);

      const client = createClient();
      const result = await client.getImageUrls('abc123', ['1:1', '1:2']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/images/abc123?ids=1%3A1,1%3A2',
        expect.any(Object)
      );
      expect(result).toEqual(imageData);
    });

    it('supports image format and scale options', async () => {
      mockSuccessResponse({ images: {} });

      const client = createClient();
      await client.getImageUrls('abc123', ['1:1'], { format: 'svg', scale: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/images/abc123?ids=1%3A1&format=svg&scale=2',
        expect.any(Object)
      );
    });

    it('supports PNG format with specific scale', async () => {
      mockSuccessResponse({ images: {} });

      const client = createClient();
      await client.getImageUrls('abc123', ['1:1'], { format: 'png', scale: 3 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/images/abc123?ids=1%3A1&format=png&scale=3',
        expect.any(Object)
      );
    });
  });

  describe('request caching', () => {
    it('caches identical requests within TTL', async () => {
      mockSuccessResponse({ name: 'Test File' });

      const client = new FigmaClient('test-token', { enableCache: true });

      await client.getFile('abc123');
      await client.getFile('abc123');

      // Should only have made one fetch call due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not cache when caching is disabled', async () => {
      mockSuccessResponse({ name: 'Test File' });
      mockSuccessResponse({ name: 'Test File' });

      const client = new FigmaClient('test-token', { enableCache: false });

      await client.getFile('abc123');
      await client.getFile('abc123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('expires cache after TTL', async () => {
      mockSuccessResponse({ name: 'Test File v1' });
      mockSuccessResponse({ name: 'Test File v2' });

      const client = new FigmaClient('test-token', { enableCache: true, cacheTtlMs: 5000 });

      await client.getFile('abc123');

      // Advance past cache TTL
      await vi.advanceTimersByTimeAsync(6000);

      await client.getFile('abc123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('caches different endpoints separately', async () => {
      mockSuccessResponse({ name: 'Test File' });
      mockSuccessResponse({ meta: { components: [] } });

      const client = new FigmaClient('test-token', { enableCache: true });

      await client.getFile('abc123');
      await client.getFileComponents('abc123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('provides method to clear cache', async () => {
      mockSuccessResponse({ name: 'Test File v1' });
      mockSuccessResponse({ name: 'Test File v2' });

      const client = new FigmaClient('test-token', { enableCache: true });

      await client.getFile('abc123');
      client.clearCache();
      await client.getFile('abc123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('throws FigmaAPIError on non-ok response', async () => {
      mockErrorResponse(403, 'Forbidden', 'Invalid token');

      const client = createClient({ maxRetries: 0 });

      await expect(client.getFile('abc123')).rejects.toThrow(FigmaAPIError);
    });

    it('includes status code in FigmaAPIError', async () => {
      mockErrorResponse(403, 'Forbidden', 'Invalid token');

      const client = createClient({ maxRetries: 0 });

      try {
        await client.getFile('abc123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).statusCode).toBe(403);
      }
    });

    it('does not retry on 4xx errors (except 429)', async () => {
      mockErrorResponse(403, 'Forbidden', 'Invalid token');

      const client = createClient({ maxRetries: 3 });

      await expect(client.getFile('abc123')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx errors', async () => {
      mockErrorResponse(500, 'Internal Server Error', 'Server error');
      mockErrorResponse(502, 'Bad Gateway', 'Gateway error');
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 3 });
      const promise = client.getFile('abc123');

      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting retries', async () => {
      mockErrorResponse(500, 'Internal Server Error', 'Server error');
      mockErrorResponse(500, 'Internal Server Error', 'Server error');
      mockErrorResponse(500, 'Internal Server Error', 'Server error');
      mockErrorResponse(500, 'Internal Server Error', 'Server error');

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 3 });

      // Attach catch handler before advancing time to avoid unhandled rejection
      const promise = client.getFile('abc123').catch((e) => e);

      await vi.advanceTimersByTimeAsync(10000);

      const error = await promise;
      expect(error).toBeInstanceOf(FigmaAPIError);
    });

    it('retries on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
      mockSuccessResponse({ name: 'Test File' });

      const client = createClient({ initialRetryDelayMs: 100, maxRetries: 1 });
      const promise = client.getFile('abc123');

      await vi.advanceTimersByTimeAsync(600);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('URL generation', () => {
    it('generates Figma file URL', () => {
      const client = createClient();
      const url = client.getFigmaUrl('abc123');

      expect(url).toBe('https://www.figma.com/file/abc123');
    });

    it('generates Figma URL with node ID', () => {
      const client = createClient();
      const url = client.getFigmaUrl('abc123', '1:1');

      expect(url).toBe('https://www.figma.com/file/abc123?node-id=1%3A1');
    });
  });

  describe('OAuth2 authentication', () => {
    it('supports OAuth2 bearer token via factory function', async () => {
      mockSuccessResponse({ name: 'Test File' });

      const client = createFigmaClient({
        authType: 'oauth2',
        accessToken: 'oauth-bearer-token',
      });

      await client.getFile('test-key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer oauth-bearer-token',
          }),
        })
      );
    });

    it('defaults to personal access token authentication', async () => {
      mockSuccessResponse({ name: 'Test File' });

      const client = createFigmaClient({
        accessToken: 'personal-token',
      });

      await client.getFile('test-key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Figma-Token': 'personal-token',
          }),
        })
      );
    });
  });

  describe('team and project endpoints', () => {
    it('fetches team projects with getTeamProjects', async () => {
      const projectsData = {
        projects: [
          { id: 'proj1', name: 'Design System' },
          { id: 'proj2', name: 'Marketing' },
        ],
      };
      mockSuccessResponse(projectsData);

      const client = createClient();
      const result = await client.getTeamProjects('team123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/projects',
        expect.any(Object)
      );
      expect(result).toEqual(projectsData);
    });

    it('fetches project files with getProjectFiles', async () => {
      const filesData = {
        files: [
          { key: 'file1', name: 'Components', thumbnail_url: 'https://...' },
          { key: 'file2', name: 'Icons', thumbnail_url: 'https://...' },
        ],
      };
      mockSuccessResponse(filesData);

      const client = createClient();
      const result = await client.getProjectFiles('proj123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/projects/proj123/files',
        expect.any(Object)
      );
      expect(result).toEqual(filesData);
    });
  });

  describe('file versions', () => {
    it('fetches file version history', async () => {
      const versionsData = {
        versions: [
          { id: 'v1', created_at: '2024-01-01T00:00:00Z', label: 'Initial' },
          { id: 'v2', created_at: '2024-01-02T00:00:00Z', label: 'Updated' },
        ],
      };
      mockSuccessResponse(versionsData);

      const client = createClient();
      const result = await client.getFileVersions('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/versions',
        expect.any(Object)
      );
      expect(result).toEqual(versionsData);
    });

    it('fetches specific file version', async () => {
      const fileData = {
        name: 'Old Version',
        document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
      };
      mockSuccessResponse(fileData);

      const client = createClient();
      const result = await client.getFile('abc123', { version: 'v123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?version=v123',
        expect.any(Object)
      );
      expect(result).toEqual(fileData);
    });
  });

  describe('specific error types', () => {
    it('throws FigmaAuthError on 401 Unauthorized', async () => {
      mockErrorResponse(401, 'Unauthorized', 'Invalid token');

      const client = createClient({ maxRetries: 0 });

      await expect(client.getFile('abc123')).rejects.toThrow(FigmaAuthError);
    });

    it('throws FigmaAuthError on 403 Forbidden', async () => {
      mockErrorResponse(403, 'Forbidden', 'Access denied');

      const client = createClient({ maxRetries: 0 });

      await expect(client.getFile('abc123')).rejects.toThrow(FigmaAuthError);
    });

    it('throws FigmaNotFoundError on 404', async () => {
      mockErrorResponse(404, 'Not Found', 'File not found');

      const client = createClient({ maxRetries: 0 });

      await expect(client.getFile('abc123')).rejects.toThrow(FigmaNotFoundError);
    });

    it('throws FigmaRateLimitError on 429 after retries exhausted', async () => {
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited');

      const client = createClient({ maxRetries: 3, initialRetryDelayMs: 100 });

      const promise = client.getFile('abc123').catch((e) => e);

      await vi.advanceTimersByTimeAsync(30000);

      const error = await promise;
      expect(error).toBeInstanceOf(FigmaRateLimitError);
    });

    it('FigmaRateLimitError includes retry timing information', async () => {
      mockErrorResponse(429, 'Too Many Requests', 'Rate limited', {
        'Retry-After': '60',
      });

      const client = createClient({ maxRetries: 0 });

      try {
        await client.getFile('abc123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaRateLimitError);
        expect((error as FigmaRateLimitError).retryAfterMs).toBe(60000);
      }
    });
  });

  describe('proactive rate limit handling', () => {
    it('waits proactively when approaching rate limit', async () => {
      // First request returns low remaining count
      const resetTime = Math.floor(Date.now() / 1000) + 5;
      mockSuccessResponse({ name: 'File 1' }, {
        'X-RateLimit-Remaining': '1',
        'X-RateLimit-Reset': String(resetTime),
      });
      mockSuccessResponse({ name: 'File 2' });

      const client = new FigmaClient('test-token', {
        enableCache: false,
        proactiveRateLimitThreshold: 2,
      });

      await client.getFile('file1');

      // Second request should wait until rate limit resets
      const startTime = Date.now();
      const promise = client.getFile('file2');

      // Should not complete immediately due to proactive waiting
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After waiting for reset, should proceed
      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not wait when remaining requests are above threshold', async () => {
      mockSuccessResponse({ name: 'File 1' }, {
        'X-RateLimit-Remaining': '100',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
      });
      mockSuccessResponse({ name: 'File 2' });

      const client = new FigmaClient('test-token', {
        enableCache: false,
        proactiveRateLimitThreshold: 5,
      });

      await client.getFile('file1');
      await client.getFile('file2');

      // Both requests should complete without delay
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('comments API', () => {
    it('fetches file comments', async () => {
      const commentsData = {
        comments: [
          { id: 'c1', message: 'Nice work!', user: { handle: 'designer' } },
        ],
      };
      mockSuccessResponse(commentsData);

      const client = createClient();
      const result = await client.getComments('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/comments',
        expect.any(Object)
      );
      expect(result).toEqual(commentsData);
    });
  });

  describe('component sets', () => {
    it('fetches component sets from a file', async () => {
      const componentSetsData = {
        meta: {
          component_sets: [
            { key: 'set1', name: 'Button', description: 'Button variants' },
          ],
        },
      };
      mockSuccessResponse(componentSetsData);

      const client = createClient();
      const result = await client.getFileComponentSets('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/component_sets',
        expect.any(Object)
      );
      expect(result).toEqual(componentSetsData);
    });
  });

  describe('file metadata endpoint', () => {
    it('fetches lightweight file metadata', async () => {
      const metaData = {
        name: 'Design System',
        role: 'owner',
        createdAt: '2024-01-01T00:00:00Z',
        lastModified: '2024-12-01T00:00:00Z',
        thumbnailUrl: 'https://...',
        branches: [],
      };
      mockSuccessResponse(metaData);

      const client = createClient();
      const result = await client.getFileMeta('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/meta',
        expect.any(Object)
      );
      expect(result).toEqual(metaData);
    });
  });

  describe('image fills endpoint', () => {
    it('fetches all image fill URLs from a file', async () => {
      const imageFillsData = {
        images: {
          'img-hash-1': 'https://s3.amazonaws.com/img1.png',
          'img-hash-2': 'https://s3.amazonaws.com/img2.jpg',
        },
      };
      mockSuccessResponse(imageFillsData);

      const client = createClient();
      const result = await client.getImageFills('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/images',
        expect.any(Object)
      );
      expect(result).toEqual(imageFillsData);
    });
  });

  describe('user info endpoint', () => {
    it('fetches current authenticated user info', async () => {
      const userData = {
        id: 'user123',
        handle: 'designer',
        email: 'designer@example.com',
        img_url: 'https://...',
      };
      mockSuccessResponse(userData);

      const client = createClient();
      const result = await client.getMe();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/me',
        expect.any(Object)
      );
      expect(result).toEqual(userData);
    });
  });

  describe('individual component/style fetching', () => {
    it('fetches a single component by key', async () => {
      const componentData = {
        meta: {
          key: 'btn-primary',
          file_key: 'abc123',
          node_id: '1:1',
          name: 'Button',
          description: 'Primary button component',
        },
      };
      mockSuccessResponse(componentData);

      const client = createClient();
      const result = await client.getComponent('btn-primary');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/components/btn-primary',
        expect.any(Object)
      );
      expect(result).toEqual(componentData);
    });

    it('fetches a single style by key', async () => {
      const styleData = {
        meta: {
          key: 'primary-color',
          file_key: 'abc123',
          node_id: '2:1',
          name: 'Primary',
          style_type: 'FILL',
        },
      };
      mockSuccessResponse(styleData);

      const client = createClient();
      const result = await client.getStyle('primary-color');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/styles/primary-color',
        expect.any(Object)
      );
      expect(result).toEqual(styleData);
    });

    it('fetches team components with pagination', async () => {
      const teamComponentsData = {
        meta: {
          components: [
            { key: 'comp1', name: 'Button' },
            { key: 'comp2', name: 'Card' },
          ],
          cursor: { after: 'cursor123' },
        },
      };
      mockSuccessResponse(teamComponentsData);

      const client = createClient();
      const result = await client.getTeamComponents('team123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/components',
        expect.any(Object)
      );
      expect(result).toEqual(teamComponentsData);
    });

    it('fetches team components with pagination cursor', async () => {
      mockSuccessResponse({ meta: { components: [], cursor: null } });

      const client = createClient();
      await client.getTeamComponents('team123', { after: 'cursor123', page_size: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/components?after=cursor123&page_size=50',
        expect.any(Object)
      );
    });

    it('fetches team styles', async () => {
      const teamStylesData = {
        meta: {
          styles: [
            { key: 'style1', name: 'Primary', style_type: 'FILL' },
          ],
        },
      };
      mockSuccessResponse(teamStylesData);

      const client = createClient();
      const result = await client.getTeamStyles('team123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/styles',
        expect.any(Object)
      );
      expect(result).toEqual(teamStylesData);
    });
  });

  describe('file fetching with depth and geometry', () => {
    it('fetches file with depth parameter', async () => {
      mockSuccessResponse({ name: 'Test', document: {} });

      const client = createClient();
      await client.getFile('abc123', { depth: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?depth=2',
        expect.any(Object)
      );
    });

    it('fetches file with geometry paths', async () => {
      mockSuccessResponse({ name: 'Test', document: {} });

      const client = createClient();
      await client.getFile('abc123', { geometry: 'paths' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?geometry=paths',
        expect.any(Object)
      );
    });

    it('fetches file with plugin data', async () => {
      mockSuccessResponse({ name: 'Test', document: {} });

      const client = createClient();
      await client.getFile('abc123', { plugin_data: 'shared' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?plugin_data=shared',
        expect.any(Object)
      );
    });

    it('fetches file with branch data', async () => {
      mockSuccessResponse({ name: 'Test', document: {} });

      const client = createClient();
      await client.getFile('abc123', { branch_data: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?branch_data=true',
        expect.any(Object)
      );
    });

    it('combines multiple file options', async () => {
      mockSuccessResponse({ name: 'Test', document: {} });

      const client = createClient();
      await client.getFile('abc123', { depth: 1, geometry: 'paths', version: 'v123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?version=v123&depth=1&geometry=paths',
        expect.any(Object)
      );
    });
  });

  describe('nodes fetching with additional options', () => {
    it('fetches nodes with depth parameter', async () => {
      mockSuccessResponse({ name: 'Test', nodes: {} });

      const client = createClient();
      await client.getNodes('abc123', ['1:1'], { depth: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/nodes?ids=1%3A1&depth=2',
        expect.any(Object)
      );
    });

    it('fetches nodes with geometry paths', async () => {
      mockSuccessResponse({ name: 'Test', nodes: {} });

      const client = createClient();
      await client.getNodes('abc123', ['1:1'], { geometry: 'paths' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/nodes?ids=1%3A1&geometry=paths',
        expect.any(Object)
      );
    });

    it('fetches nodes with plugin data', async () => {
      mockSuccessResponse({ name: 'Test', nodes: {} });

      const client = createClient();
      await client.getNodes('abc123', ['1:1'], { plugin_data: 'shared' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/nodes?ids=1%3A1&plugin_data=shared',
        expect.any(Object)
      );
    });
  });

  describe('published variables', () => {
    it('fetches published variables from a file', async () => {
      const publishedVarsData = {
        meta: {
          variables: { 'var1': { id: 'var1', name: 'primary-color' } },
          variableCollections: {},
        },
      };
      mockSuccessResponse(publishedVarsData);

      const client = createClient();
      const result = await client.getPublishedVariables('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/variables/published',
        expect.any(Object)
      );
      expect(result).toEqual(publishedVarsData);
    });
  });

  describe('component set by key', () => {
    it('fetches a single component set by key', async () => {
      const componentSetData = {
        meta: {
          key: 'btn-set',
          name: 'Button',
          description: 'Button component set with variants',
        },
      };
      mockSuccessResponse(componentSetData);

      const client = createClient();
      const result = await client.getComponentSet('btn-set');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/component_sets/btn-set',
        expect.any(Object)
      );
      expect(result).toEqual(componentSetData);
    });
  });

  describe('team component sets', () => {
    it('fetches team component sets with pagination', async () => {
      const teamComponentSetsData = {
        meta: {
          component_sets: [
            { key: 'set1', name: 'Buttons' },
            { key: 'set2', name: 'Cards' },
          ],
          cursor: { after: 'cursor456' },
        },
      };
      mockSuccessResponse(teamComponentSetsData);

      const client = createClient();
      const result = await client.getTeamComponentSets('team123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/component_sets',
        expect.any(Object)
      );
      expect(result).toEqual(teamComponentSetsData);
    });

    it('fetches team component sets with pagination options', async () => {
      mockSuccessResponse({ meta: { component_sets: [] } });

      const client = createClient();
      await client.getTeamComponentSets('team123', { after: 'cursor456', page_size: 30 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/component_sets?after=cursor456&page_size=30',
        expect.any(Object)
      );
    });
  });

  describe('batch node fetching', () => {
    it('automatically chunks large node requests', async () => {
      // Create 150 node IDs (exceeds 100 node limit)
      const nodeIds = Array.from({ length: 150 }, (_, i) => `1:${i}`);

      // First chunk response (100 nodes)
      mockSuccessResponse({
        name: 'Test',
        nodes: Object.fromEntries(
          nodeIds.slice(0, 100).map((id) => [id, { document: { id, name: `Node ${id}`, type: 'FRAME' } }])
        ),
      });

      // Second chunk response (50 nodes)
      mockSuccessResponse({
        name: 'Test',
        nodes: Object.fromEntries(
          nodeIds.slice(100).map((id) => [id, { document: { id, name: `Node ${id}`, type: 'FRAME' } }])
        ),
      });

      const client = createClient();
      const result = await client.getNodesBatched('abc123', nodeIds);

      // Should have made 2 requests
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Result should contain all 150 nodes
      expect(Object.keys(result.nodes)).toHaveLength(150);
    });

    it('respects custom batch size', async () => {
      const nodeIds = Array.from({ length: 75 }, (_, i) => `1:${i}`);

      mockSuccessResponse({
        name: 'Test',
        nodes: Object.fromEntries(
          nodeIds.slice(0, 50).map((id) => [id, { document: { id, name: `Node ${id}`, type: 'FRAME' } }])
        ),
      });
      mockSuccessResponse({
        name: 'Test',
        nodes: Object.fromEntries(
          nodeIds.slice(50).map((id) => [id, { document: { id, name: `Node ${id}`, type: 'FRAME' } }])
        ),
      });

      const client = createClient();
      const result = await client.getNodesBatched('abc123', nodeIds, { batchSize: 50 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(Object.keys(result.nodes)).toHaveLength(75);
    });

    it('handles small requests without chunking', async () => {
      const nodeIds = ['1:1', '1:2', '1:3'];

      mockSuccessResponse({
        name: 'Test',
        nodes: Object.fromEntries(
          nodeIds.map((id) => [id, { document: { id, name: `Node ${id}`, type: 'FRAME' } }])
        ),
      });

      const client = createClient();
      const result = await client.getNodesBatched('abc123', nodeIds);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(Object.keys(result.nodes)).toHaveLength(3);
    });
  });

  describe('request deduplication', () => {
    it('deduplicates concurrent identical requests', async () => {
      vi.useRealTimers();

      let resolvePromise: (value: unknown) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(async () => {
        await delayedPromise;
        return {
          ok: true,
          json: () => Promise.resolve({ name: 'Test File' }),
          headers: { get: () => null },
        };
      });

      const client = new FigmaClient('test-token', { enableCache: false, deduplicateRequests: true });

      // Start two concurrent requests to the same endpoint
      const promise1 = client.getFile('abc123');
      const promise2 = client.getFile('abc123');

      // Resolve the fetch
      resolvePromise!(undefined);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result
      expect(result1).toEqual(result2);
      // Only one fetch should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.useFakeTimers();
    });

    it('does not deduplicate when disabled', async () => {
      mockSuccessResponse({ name: 'Test File' });
      mockSuccessResponse({ name: 'Test File' });

      const client = new FigmaClient('test-token', { enableCache: false, deduplicateRequests: false });

      await Promise.all([
        client.getFile('abc123'),
        client.getFile('abc123'),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('dev resources endpoint', () => {
    it('fetches dev resources from a file', async () => {
      const devResourcesData = {
        dev_resources: [
          {
            id: 'res1',
            name: 'Primary Color',
            url: 'https://example.com/colors/primary',
            node_id: '1:1',
          },
          {
            id: 'res2',
            name: 'Button Component',
            url: 'https://example.com/components/button',
            node_id: '1:2',
          },
        ],
      };
      mockSuccessResponse(devResourcesData);

      const client = createClient();
      const result = await client.getDevResources('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/dev_resources',
        expect.any(Object)
      );
      expect(result).toEqual(devResourcesData);
    });

    it('fetches dev resources for specific node', async () => {
      const devResourcesData = {
        dev_resources: [
          { id: 'res1', name: 'Button Styles', url: 'https://example.com/button', node_id: '1:1' },
        ],
      };
      mockSuccessResponse(devResourcesData);

      const client = createClient();
      const result = await client.getDevResources('abc123', { node_id: '1:1' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/dev_resources?node_id=1%3A1',
        expect.any(Object)
      );
      expect(result).toEqual(devResourcesData);
    });
  });

  describe('token refresh for OAuth2', () => {
    it('calls refresh handler when token expires', async () => {
      vi.useRealTimers();

      mockErrorResponse(401, 'Unauthorized', 'Token expired');
      mockSuccessResponse({ name: 'Test File' });

      const refreshHandler = vi.fn().mockResolvedValue('new-access-token');

      const client = new FigmaClient('old-token', {
        authType: 'oauth2',
        enableCache: false,
        deduplicateRequests: false,
        maxRetries: 0,
        onTokenRefresh: refreshHandler,
      });

      await client.getFile('abc123');

      expect(refreshHandler).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call should use the new token
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer new-access-token',
          }),
        })
      );

      vi.useFakeTimers();
    });

    it('does not call refresh handler for personal tokens', async () => {
      mockErrorResponse(401, 'Unauthorized', 'Invalid token');

      const refreshHandler = vi.fn();

      const client = new FigmaClient('personal-token', {
        authType: 'personal',
        enableCache: false,
        deduplicateRequests: false,
        maxRetries: 0,
        onTokenRefresh: refreshHandler,
      });

      await expect(client.getFile('abc123')).rejects.toThrow(FigmaAuthError);
      expect(refreshHandler).not.toHaveBeenCalled();
    });

    it('throws if refresh handler fails', async () => {
      vi.useRealTimers();

      mockErrorResponse(401, 'Unauthorized', 'Token expired');

      const refreshHandler = vi.fn().mockRejectedValue(new Error('Refresh failed'));

      const client = new FigmaClient('old-token', {
        authType: 'oauth2',
        enableCache: false,
        deduplicateRequests: false,
        maxRetries: 0,
        onTokenRefresh: refreshHandler,
      });

      await expect(client.getFile('abc123')).rejects.toThrow('Refresh failed');

      vi.useFakeTimers();
    });
  });

  describe('abort controller support', () => {
    it('aborts request when signal is triggered', async () => {
      vi.useRealTimers();

      const controller = new AbortController();

      mockFetch.mockImplementationOnce(async (_url: string, options: RequestInit) => {
        const signal = options.signal as AbortSignal;
        await new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const client = createClient();
      const promise = client.getFile('abc123', { signal: controller.signal });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow();

      vi.useFakeTimers();
    });
  });
});
