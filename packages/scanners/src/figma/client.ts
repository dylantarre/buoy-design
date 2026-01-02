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
  boundVariables?: Record<string, unknown>;
}

export interface FigmaPropertyDefinition {
  type: string;
  defaultValue: unknown;
  variantOptions?: string[];
  description?: string;
  preferredValues?: Array<{ type: string; key: string }>;
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks: string[];
  remote?: boolean;
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

/**
 * Error thrown when authentication fails (401, 403)
 */
export class FigmaAuthError extends FigmaAPIError {
  constructor(message: string, statusCode: number, responseBody: string) {
    super(message, statusCode, responseBody);
    this.name = "FigmaAuthError";
  }
}

/**
 * Error thrown when a resource is not found (404)
 */
export class FigmaNotFoundError extends FigmaAPIError {
  constructor(message: string, responseBody: string) {
    super(message, 404, responseBody);
    this.name = "FigmaNotFoundError";
  }
}

/**
 * Error thrown when rate limit is exceeded (429)
 */
export class FigmaRateLimitError extends FigmaAPIError {
  constructor(
    message: string,
    responseBody: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 429, responseBody);
    this.name = "FigmaRateLimitError";
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

  /**
   * Threshold for proactive rate limiting.
   * When remaining requests fall below this threshold, the client will
   * wait until the rate limit resets before making new requests.
   * @default 0 (disabled)
   */
  proactiveRateLimitThreshold?: number;

  /**
   * Authentication type to use
   * @default 'personal'
   */
  authType?: "personal" | "oauth2";

  /**
   * Enable request deduplication for concurrent identical requests
   * @default true
   */
  deduplicateRequests?: boolean;

  /**
   * Callback for OAuth2 token refresh when token expires (401)
   * Should return a new access token
   */
  onTokenRefresh?: () => Promise<string>;
}

/**
 * Options for creating a Figma client with authentication
 */
export interface CreateFigmaClientOptions extends FigmaClientOptions {
  accessToken: string;
}

/**
 * Options for fetching a file
 */
export interface GetFileOptions {
  /**
   * Specific version ID to fetch
   */
  version?: string;

  /**
   * Depth of the node tree to return (1-4)
   * Useful for getting only top-level structure
   */
  depth?: number;

  /**
   * Set to "paths" to include vector paths in the response
   */
  geometry?: "paths";

  /**
   * Include plugin data. Set to "shared" for shared plugin data
   */
  plugin_data?: string;

  /**
   * Include branch metadata if true
   */
  branch_data?: boolean;

  /**
   * AbortSignal to cancel the request
   */
  signal?: AbortSignal;
}

/**
 * Options for fetching nodes
 */
export interface GetNodesOptions {
  /**
   * Depth of the node tree to return (1-4)
   */
  depth?: number;

  /**
   * Set to "paths" to include vector paths
   */
  geometry?: "paths";

  /**
   * Include plugin data
   */
  plugin_data?: string;
}

/**
 * Pagination options for team endpoints
 */
export interface PaginationOptions {
  /**
   * Cursor for pagination - fetches results after this cursor
   */
  after?: string;

  /**
   * Number of items per page (max 100)
   */
  page_size?: number;
}

/**
 * Response from team projects endpoint
 */
export interface FigmaTeamProjectsResponse {
  projects: Array<{ id: string; name: string }>;
}

/**
 * Response from project files endpoint
 */
export interface FigmaProjectFilesResponse {
  files: Array<{ key: string; name: string; thumbnail_url?: string }>;
}

/**
 * Response from file versions endpoint
 */
export interface FigmaFileVersionsResponse {
  versions: Array<{ id: string; created_at: string; label?: string }>;
}

/**
 * Response from comments endpoint
 */
export interface FigmaCommentsResponse {
  comments: Array<{
    id: string;
    message: string;
    user: { handle: string; img_url?: string };
  }>;
}

/**
 * Response from component sets endpoint
 */
export interface FigmaComponentSetsResponse {
  meta: {
    component_sets: Array<{ key: string; name: string; description: string }>;
  };
}

/**
 * Response from file meta endpoint - lightweight file metadata
 */
export interface FigmaFileMetaResponse {
  name: string;
  role: string;
  createdAt: string;
  lastModified: string;
  thumbnailUrl?: string;
  branches?: Array<{ key: string; name: string }>;
}

/**
 * Response from image fills endpoint
 */
export interface FigmaImageFillsResponse {
  images: Record<string, string>;
}

/**
 * Response from /me endpoint - current user info
 */
export interface FigmaUserResponse {
  id: string;
  handle: string;
  email?: string;
  img_url?: string;
}

/**
 * Response from single component endpoint
 */
export interface FigmaComponentResponse {
  meta: {
    key: string;
    file_key: string;
    node_id: string;
    name: string;
    description: string;
    thumbnail_url?: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Response from single style endpoint
 */
export interface FigmaStyleResponse {
  meta: {
    key: string;
    file_key: string;
    node_id: string;
    name: string;
    style_type: string;
    thumbnail_url?: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Response from team components endpoint with pagination
 */
export interface FigmaTeamComponentsResponse {
  meta: {
    components: Array<{
      key: string;
      name: string;
      description?: string;
      file_key?: string;
    }>;
    cursor?: { after: string } | null;
  };
}

/**
 * Response from team styles endpoint with pagination
 */
export interface FigmaTeamStylesResponse {
  meta: {
    styles: Array<{
      key: string;
      name: string;
      style_type: string;
      description?: string;
    }>;
    cursor?: { after: string } | null;
  };
}

/**
 * Response from single component set endpoint
 */
export interface FigmaComponentSetResponse {
  meta: {
    key: string;
    name: string;
    description: string;
    file_key?: string;
    thumbnail_url?: string;
  };
}

/**
 * Response from team component sets endpoint with pagination
 */
export interface FigmaTeamComponentSetsResponse {
  meta: {
    component_sets: Array<{
      key: string;
      name: string;
      description?: string;
    }>;
    cursor?: { after: string } | null;
  };
}

/**
 * Options for batch node fetching
 */
export interface GetNodesBatchedOptions extends GetNodesOptions {
  /**
   * Number of nodes per batch request
   * @default 100
   */
  batchSize?: number;
}

/**
 * Options for fetching dev resources
 */
export interface GetDevResourcesOptions {
  /**
   * Filter to specific node
   */
  node_id?: string;
}

/**
 * Response from dev resources endpoint
 */
export interface FigmaDevResourcesResponse {
  dev_resources: Array<{
    id: string;
    name: string;
    url: string;
    node_id: string;
    file_key?: string;
  }>;
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
  private proactiveRateLimitThreshold: number;
  private authType: "personal" | "oauth2";
  private deduplicateRequests: boolean;
  private onTokenRefresh?: () => Promise<string>;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private rateLimitInfo: RateLimitInfo | null = null;
  private pendingRequests: Map<string, Promise<unknown>> = new Map();
  private tokenRefreshAttempted = false;

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
    this.proactiveRateLimitThreshold = options.proactiveRateLimitThreshold ?? 0;
    this.authType = options.authType ?? "personal";
    this.deduplicateRequests = options.deduplicateRequests ?? true;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  private async fetch<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    // Check cache first
    if (this.enableCache) {
      const cached = this.getFromCache<T>(endpoint);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Check for request deduplication
    if (this.deduplicateRequests) {
      const pending = this.pendingRequests.get(endpoint);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    // Create the actual fetch promise
    const fetchPromise = this.fetchWithRetries<T>(endpoint, signal);

    // Store for deduplication
    if (this.deduplicateRequests) {
      this.pendingRequests.set(endpoint, fetchPromise);
      fetchPromise.finally(() => {
        this.pendingRequests.delete(endpoint);
      });
    }

    return fetchPromise;
  }

  private async fetchWithRetries<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    // Proactive rate limit waiting
    await this.waitForRateLimitIfNeeded();

    let lastError: Error | null = null;
    let attempt = 0;
    // Reset token refresh flag for each new request
    this.tokenRefreshAttempted = false;

    while (attempt <= this.maxRetries) {
      try {
        const result = await this.fetchOnce<T>(endpoint, signal);

        // Cache the result
        if (this.enableCache) {
          this.setCache(endpoint, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Try token refresh for OAuth2 401 errors
        if (
          lastError instanceof FigmaAuthError &&
          lastError.statusCode === 401 &&
          this.authType === "oauth2" &&
          this.onTokenRefresh &&
          !this.tokenRefreshAttempted
        ) {
          this.tokenRefreshAttempted = true;
          try {
            const newToken = await this.onTokenRefresh();
            this.accessToken = newToken;
            // Retry immediately with new token
            continue;
          } catch (refreshError) {
            throw refreshError instanceof Error
              ? refreshError
              : new Error(String(refreshError));
          }
        }

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

    // Convert to specific error type if rate limit was exhausted
    if (
      lastError instanceof FigmaAPIError &&
      lastError.statusCode === 429 &&
      !(lastError instanceof FigmaRateLimitError)
    ) {
      const retryAfter = (lastError as FigmaAPIError & { retryAfter?: number })
        .retryAfter;
      throw new FigmaRateLimitError(
        lastError.message,
        lastError.responseBody,
        retryAfter
      );
    }

    // All retries exhausted
    throw lastError ?? new Error("Unknown error during Figma API request");
  }

  /**
   * Wait proactively if we're approaching the rate limit
   */
  private async waitForRateLimitIfNeeded(): Promise<void> {
    if (
      this.proactiveRateLimitThreshold <= 0 ||
      !this.rateLimitInfo ||
      this.rateLimitInfo.remaining > this.proactiveRateLimitThreshold
    ) {
      return;
    }

    const waitTime = Math.max(0, this.rateLimitInfo.resetAt - Date.now());
    if (waitTime > 0) {
      await this.sleep(waitTime);
    }
  }

  private async fetchOnce<T>(endpoint: string, externalSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    // If an external signal is provided, abort when it aborts
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const headers: Record<string, string> =
        this.authType === "oauth2"
          ? { Authorization: `Bearer ${this.accessToken}` }
          : { "X-Figma-Token": this.accessToken };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
        signal: controller.signal,
      });

      // Track rate limit headers
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        const text = await response.text();
        const baseMessage = `Figma API error: ${response.status} ${response.statusText} - ${text}`;

        // Throw specific error types based on status code
        switch (response.status) {
          case 401:
          case 403:
            throw new FigmaAuthError(baseMessage, response.status, text);
          case 404:
            throw new FigmaNotFoundError(baseMessage, text);
          case 429: {
            const retryAfter = this.parseRetryAfter(response);
            const error = new FigmaRateLimitError(baseMessage, text, retryAfter);
            // Also attach retryAfter for retry logic compatibility
            (error as FigmaRateLimitError & { retryAfter?: number }).retryAfter =
              retryAfter;
            throw error;
          }
          default: {
            const error = new FigmaAPIError(baseMessage, response.status, text);
            throw error;
          }
        }
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

  /**
   * Fetch a Figma file
   * @param fileKey The key of the file to fetch
   * @param options Optional parameters including version
   */
  async getFile(fileKey: string, options?: GetFileOptions): Promise<FigmaFile> {
    const params = new URLSearchParams();
    if (options?.version) {
      params.append("version", options.version);
    }
    if (options?.depth !== undefined) {
      params.append("depth", String(options.depth));
    }
    if (options?.geometry) {
      params.append("geometry", options.geometry);
    }
    if (options?.plugin_data) {
      params.append("plugin_data", options.plugin_data);
    }
    if (options?.branch_data) {
      params.append("branch_data", "true");
    }
    const query = params.toString();
    const endpoint = `/files/${fileKey}${query ? `?${query}` : ""}`;
    return this.fetch<FigmaFile>(endpoint, options?.signal);
  }

  /**
   * Fetch specific nodes from a file by their IDs
   * More efficient than fetching the entire file when you only need specific nodes
   */
  async getNodes(
    fileKey: string,
    nodeIds: string[],
    options?: GetNodesOptions,
  ): Promise<FigmaNodesResponse> {
    // URL encode node IDs manually and join with comma (which doesn't need encoding)
    const ids = nodeIds.map(encodeURIComponent).join(",");
    let url = `/files/${fileKey}/nodes?ids=${ids}`;
    if (options?.depth !== undefined) {
      url += `&depth=${options.depth}`;
    }
    if (options?.geometry) {
      url += `&geometry=${options.geometry}`;
    }
    if (options?.plugin_data) {
      url += `&plugin_data=${encodeURIComponent(options.plugin_data)}`;
    }
    return this.fetch<FigmaNodesResponse>(url);
  }

  /**
   * Fetch nodes in batches, automatically chunking large requests
   * Figma API limits to ~100 nodes per request, this method handles pagination
   * @param fileKey The file key
   * @param nodeIds Array of node IDs to fetch
   * @param options Optional batch size and node options
   */
  async getNodesBatched(
    fileKey: string,
    nodeIds: string[],
    options?: GetNodesBatchedOptions,
  ): Promise<FigmaNodesResponse> {
    const batchSize = options?.batchSize ?? 100;

    // If under batch size, just use regular getNodes
    if (nodeIds.length <= batchSize) {
      return this.getNodes(fileKey, nodeIds, options);
    }

    // Chunk the node IDs
    const chunks: string[][] = [];
    for (let i = 0; i < nodeIds.length; i += batchSize) {
      chunks.push(nodeIds.slice(i, i + batchSize));
    }

    // Fetch all chunks sequentially to respect rate limits
    const results: FigmaNodesResponse[] = [];
    for (const chunk of chunks) {
      const result = await this.getNodes(fileKey, chunk, options);
      results.push(result);
    }

    // Merge all results
    const mergedNodes: Record<string, { document: FigmaNode }> = {};
    for (const result of results) {
      Object.assign(mergedNodes, result.nodes);
    }

    return {
      name: results[0]?.name ?? "",
      nodes: mergedNodes,
    };
  }

  /**
   * Fetch dev resources from a file
   * Dev resources are links attached to design elements (design tokens, docs, etc.)
   * @param fileKey The file key
   * @param options Optional filter by node ID
   */
  async getDevResources(
    fileKey: string,
    options?: GetDevResourcesOptions,
  ): Promise<FigmaDevResourcesResponse> {
    let url = `/files/${fileKey}/dev_resources`;
    if (options?.node_id) {
      url += `?node_id=${encodeURIComponent(options.node_id)}`;
    }
    return this.fetch<FigmaDevResourcesResponse>(url);
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

  /**
   * Fetch component sets from a file
   */
  async getFileComponentSets(
    fileKey: string,
  ): Promise<FigmaComponentSetsResponse> {
    return this.fetch(`/files/${fileKey}/component_sets`);
  }

  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.fetch(`/files/${fileKey}/variables/local`);
  }

  /**
   * Fetch version history for a file
   */
  async getFileVersions(fileKey: string): Promise<FigmaFileVersionsResponse> {
    return this.fetch(`/files/${fileKey}/versions`);
  }

  /**
   * Fetch comments on a file
   */
  async getComments(fileKey: string): Promise<FigmaCommentsResponse> {
    return this.fetch(`/files/${fileKey}/comments`);
  }

  /**
   * Fetch projects for a team
   */
  async getTeamProjects(teamId: string): Promise<FigmaTeamProjectsResponse> {
    return this.fetch(`/teams/${teamId}/projects`);
  }

  /**
   * Fetch files in a project
   */
  async getProjectFiles(projectId: string): Promise<FigmaProjectFilesResponse> {
    return this.fetch(`/projects/${projectId}/files`);
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

  /**
   * Fetch lightweight file metadata (faster than getFile)
   * Tier 3 endpoint - useful for checking file existence and basic info
   */
  async getFileMeta(fileKey: string): Promise<FigmaFileMetaResponse> {
    return this.fetch<FigmaFileMetaResponse>(`/files/${fileKey}/meta`);
  }

  /**
   * Fetch all image fill URLs from a file
   * Returns download links for images used in image fills
   * Note: URLs expire within 14 days
   */
  async getImageFills(fileKey: string): Promise<FigmaImageFillsResponse> {
    return this.fetch<FigmaImageFillsResponse>(`/files/${fileKey}/images`);
  }

  /**
   * Fetch current authenticated user information
   */
  async getMe(): Promise<FigmaUserResponse> {
    return this.fetch<FigmaUserResponse>("/me");
  }

  /**
   * Fetch a single component by its key
   * @param componentKey The unique key of the component
   */
  async getComponent(componentKey: string): Promise<FigmaComponentResponse> {
    return this.fetch<FigmaComponentResponse>(`/components/${componentKey}`);
  }

  /**
   * Fetch a single style by its key
   * @param styleKey The unique key of the style
   */
  async getStyle(styleKey: string): Promise<FigmaStyleResponse> {
    return this.fetch<FigmaStyleResponse>(`/styles/${styleKey}`);
  }

  /**
   * Fetch a single component set by its key
   * @param componentSetKey The unique key of the component set
   */
  async getComponentSet(componentSetKey: string): Promise<FigmaComponentSetResponse> {
    return this.fetch<FigmaComponentSetResponse>(`/component_sets/${componentSetKey}`);
  }

  /**
   * Fetch all components for a team with pagination
   * @param teamId The team ID
   * @param options Pagination options (after cursor, page_size)
   */
  async getTeamComponents(
    teamId: string,
    options?: PaginationOptions,
  ): Promise<FigmaTeamComponentsResponse> {
    const params = new URLSearchParams();
    if (options?.after) {
      params.append("after", options.after);
    }
    if (options?.page_size !== undefined) {
      params.append("page_size", String(options.page_size));
    }
    const query = params.toString();
    const endpoint = `/teams/${teamId}/components${query ? `?${query}` : ""}`;
    return this.fetch<FigmaTeamComponentsResponse>(endpoint);
  }

  /**
   * Fetch all styles for a team with pagination
   * @param teamId The team ID
   * @param options Pagination options (after cursor, page_size)
   */
  async getTeamStyles(
    teamId: string,
    options?: PaginationOptions,
  ): Promise<FigmaTeamStylesResponse> {
    const params = new URLSearchParams();
    if (options?.after) {
      params.append("after", options.after);
    }
    if (options?.page_size !== undefined) {
      params.append("page_size", String(options.page_size));
    }
    const query = params.toString();
    const endpoint = `/teams/${teamId}/styles${query ? `?${query}` : ""}`;
    return this.fetch<FigmaTeamStylesResponse>(endpoint);
  }

  /**
   * Fetch all component sets for a team with pagination
   * @param teamId The team ID
   * @param options Pagination options (after cursor, page_size)
   */
  async getTeamComponentSets(
    teamId: string,
    options?: PaginationOptions,
  ): Promise<FigmaTeamComponentSetsResponse> {
    const params = new URLSearchParams();
    if (options?.after) {
      params.append("after", options.after);
    }
    if (options?.page_size !== undefined) {
      params.append("page_size", String(options.page_size));
    }
    const query = params.toString();
    const endpoint = `/teams/${teamId}/component_sets${query ? `?${query}` : ""}`;
    return this.fetch<FigmaTeamComponentSetsResponse>(endpoint);
  }

  /**
   * Fetch published variables from a file (for library consumption)
   * Enterprise feature - returns variables that have been published
   */
  async getPublishedVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.fetch<FigmaVariablesResponse>(`/files/${fileKey}/variables/published`);
  }

  getFigmaUrl(fileKey: string, nodeId?: string): string {
    const base = `https://www.figma.com/file/${fileKey}`;
    if (nodeId) {
      return `${base}?node-id=${encodeURIComponent(nodeId)}`;
    }
    return base;
  }
}

/**
 * Factory function to create a FigmaClient with authentication options
 */
export function createFigmaClient(
  options: CreateFigmaClientOptions
): FigmaClient {
  return new FigmaClient(options.accessToken, options);
}
