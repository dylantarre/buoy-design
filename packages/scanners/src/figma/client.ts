export interface FigmaFile {
  name: string;
  document: FigmaDocument;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaDocument {
  id: string;
  name: string;
  type: string;
  children: FigmaNode[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  componentId?: string;
  componentPropertyDefinitions?: Record<string, FigmaPropertyDefinition>;
}

export interface FigmaPropertyDefinition {
  type: string;
  defaultValue: unknown;
  variantOptions?: string[];
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks: string[];
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, FigmaVariableValue>;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
}

export type FigmaVariableValue =
  | { type: "COLOR"; value: { r: number; g: number; b: number; a: number } }
  | { type: "FLOAT"; value: number }
  | { type: "STRING"; value: string }
  | { type: "BOOLEAN"; value: boolean };

export interface FigmaNodesResponse {
  name: string;
  nodes: Record<string, { document: FigmaNode }>;
}

export interface FigmaImageResponse {
  images: Record<string, string | null>;
}

export interface FigmaImageOptions {
  format?: "jpg" | "png" | "svg" | "pdf";
  scale?: number;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: number;
}

/**
 * Custom error class for Figma API errors with status code information
 */
export class FigmaAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "FigmaAPIError";
  }
}

export interface FigmaClientOptions {
  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before first retry (exponential backoff)
   * @default 1000
   */
  initialRetryDelayMs?: number;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Enable request caching
   * @default true
   */
  enableCache?: boolean;

  /**
   * Cache time-to-live in milliseconds
   * @default 60000 (1 minute)
   */
  cacheTtlMs?: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * HTTP status codes that should trigger a retry
 */
const RETRYABLE_STATUS_CODES = [
  429, // Too Many Requests (rate limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * HTTP status codes that should NOT be retried (client errors except rate limit)
 */
const NON_RETRYABLE_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
];

export class FigmaClient {
  private accessToken: string;
  private baseUrl = "https://api.figma.com/v1";
  private timeoutMs: number;
  private maxRetries: number;
  private initialRetryDelayMs: number;
  private enableCache: boolean;
  private cacheTtlMs: number;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(accessToken: string, options: FigmaClientOptions = {}) {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    this.accessToken = accessToken;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
    this.enableCache = options.enableCache ?? true;
    this.cacheTtlMs = options.cacheTtlMs ?? 60000;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    // Check cache first
    if (this.enableCache) {
      const cached = this.getFromCache<T>(endpoint);
      if (cached !== undefined) {
        return cached;
      }
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const result = await this.fetchOnce<T>(endpoint);

        // Cache the result
        if (this.enableCache) {
          this.setCache(endpoint, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = this.shouldRetry(lastError, attempt);
        if (!shouldRetry) {
          throw lastError;
        }

        // Calculate delay with exponential backoff + jitter
        const delay = this.calculateRetryDelay(attempt, lastError);
        await this.sleep(delay);

        attempt++;
      }
    }

    // All retries exhausted
    throw lastError ?? new Error("Unknown error during Figma API request");
  }

  private async fetchOnce<T>(endpoint: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Figma-Token": this.accessToken,
        },
        signal: controller.signal,
      });

      // Track rate limit headers
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        const text = await response.text();
        const error = new FigmaAPIError(
          `Figma API error: ${response.status} ${response.statusText} - ${text}`,
          response.status,
          text,
        );

        // For rate limits, attach Retry-After info if available
        if (response.status === 429) {
          (error as FigmaAPIError & { retryAfter?: number }).retryAfter =
            this.parseRetryAfter(response);
        }

        throw error;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Figma API request timed out after ${this.timeoutMs / 1000}s`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse Retry-After header from response
   * Returns delay in milliseconds or undefined if not present/parseable
   */
  private parseRetryAfter(response: Response): number | undefined {
    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) return undefined;

    // Try parsing as seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
      return Math.max(0, date - Date.now());
    }

    return undefined;
  }

  /**
   * Update rate limit tracking info from response headers
   */
  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (remaining !== null) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining, 10),
        resetAt: reset ? parseInt(reset, 10) * 1000 : Date.now() + 60000,
      };
    }
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Retry on timeout
    if (error.message.includes("timed out")) {
      return true;
    }

    // Don't retry on non-retryable status codes
    if (
      error instanceof FigmaAPIError &&
      NON_RETRYABLE_STATUS_CODES.includes(error.statusCode)
    ) {
      return false;
    }

    // Retry on specific status codes
    if (
      error instanceof FigmaAPIError &&
      RETRYABLE_STATUS_CODES.includes(error.statusCode)
    ) {
      return true;
    }

    // Retry on network errors
    if (
      error.message.includes("fetch failed") ||
      error.message.includes("network")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, error: Error): number {
    // Check for Retry-After header hint from rate limiting
    if (error instanceof FigmaAPIError && error.statusCode === 429) {
      const retryAfter = (error as FigmaAPIError & { retryAfter?: number })
        .retryAfter;
      if (retryAfter !== undefined) {
        return retryAfter + this.jitter();
      }

      // For rate limits without Retry-After, use a longer base delay
      const baseDelay = this.initialRetryDelayMs * 2;
      return baseDelay * Math.pow(2, attempt) + this.jitter();
    }

    // Exponential backoff: delay = initialDelay * 2^attempt + jitter
    const exponentialDelay = this.initialRetryDelayMs * Math.pow(2, attempt);

    // Cap at 30 seconds max delay
    const cappedDelay = Math.min(exponentialDelay, 30000);

    return cappedDelay + this.jitter();
  }

  /**
   * Add random jitter (0-500ms) to prevent thundering herd
   */
  private jitter(): number {
    return Math.floor(Math.random() * 500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get value from cache if it exists and hasn't expired
   */
  private getFromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache with TTL
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  async getFile(fileKey: string): Promise<FigmaFile> {
    return this.fetch<FigmaFile>(`/files/${fileKey}`);
  }

  /**
   * Fetch specific nodes from a file by their IDs
   * More efficient than fetching the entire file when you only need specific nodes
   */
  async getNodes(
    fileKey: string,
    nodeIds: string[],
  ): Promise<FigmaNodesResponse> {
    const ids = nodeIds.map(encodeURIComponent).join(",");
    return this.fetch<FigmaNodesResponse>(`/files/${fileKey}/nodes?ids=${ids}`);
  }

  async getFileComponents(
    fileKey: string,
  ): Promise<{ meta: { components: FigmaComponentMeta[] } }> {
    return this.fetch(`/files/${fileKey}/components`);
  }

  async getFileStyles(
    fileKey: string,
  ): Promise<{ meta: { styles: FigmaStyleMeta[] } }> {
    return this.fetch(`/files/${fileKey}/styles`);
  }

  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.fetch(`/files/${fileKey}/variables/local`);
  }

  /**
   * Get image URLs for specific nodes in a file
   * Returns URLs to rendered images that can be downloaded
   */
  async getImageUrls(
    fileKey: string,
    nodeIds: string[],
    options?: FigmaImageOptions,
  ): Promise<FigmaImageResponse> {
    const ids = nodeIds.map(encodeURIComponent).join(",");
    let url = `/images/${fileKey}?ids=${ids}`;

    if (options?.format) {
      url += `&format=${options.format}`;
    }
    if (options?.scale !== undefined) {
      url += `&scale=${options.scale}`;
    }

    return this.fetch<FigmaImageResponse>(url);
  }

  getFigmaUrl(fileKey: string, nodeId?: string): string {
    const base = `https://www.figma.com/file/${fileKey}`;
    if (nodeId) {
      return `${base}?node-id=${encodeURIComponent(nodeId)}`;
    }
    return base;
  }
}
