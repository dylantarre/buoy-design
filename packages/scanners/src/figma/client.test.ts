import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FigmaClient, FigmaAPIError, FigmaClientOptions } from './client.js';

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
    return new FigmaClient('test-token', { enableCache: false, ...options });
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
});
