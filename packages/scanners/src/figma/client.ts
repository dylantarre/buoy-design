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

export class FigmaClient {
  private accessToken: string;
  private baseUrl = "https://api.figma.com/v1";
  private timeoutMs: number;
  private maxRetries: number;
  private initialRetryDelayMs: number;

  constructor(accessToken: string, options: FigmaClientOptions = {}) {
    this.accessToken = accessToken;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const result = await this.fetchOnce<T>(endpoint);
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

      if (!response.ok) {
        const text = await response.text();
        const error = new FigmaAPIError(
          `Figma API error: ${response.status} ${response.statusText} - ${text}`,
          response.status,
          text,
        );
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
      // Figma doesn't typically send Retry-After, but we respect it if present
      // For rate limits, use a longer base delay
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

  async getFile(fileKey: string): Promise<FigmaFile> {
    return this.fetch<FigmaFile>(`/files/${fileKey}`);
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

  getFigmaUrl(fileKey: string, nodeId?: string): string {
    const base = `https://www.figma.com/file/${fileKey}`;
    if (nodeId) {
      return `${base}?node-id=${encodeURIComponent(nodeId)}`;
    }
    return base;
  }
}
