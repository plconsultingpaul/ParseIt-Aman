/**
 * Retry helper utility for handling transient API failures
 * Implements exponential backoff strategy
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 2000,
  maxDelayMs: 8000,
  backoffMultiplier: 2
};

/**
 * Determines if an error is retryable (network/timeout/overload errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    return (
      message.includes('failed to fetch') ||
      message.includes('network error') ||
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('500') ||
      message.includes('overloaded') ||
      message.includes('temporarily') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused')
    );
  }

  return false;
}

/**
 * Delays execution for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async operation with retry logic using exponential backoff
 *
 * @param operation - The async function to execute with retry logic
 * @param operationName - Name of the operation for logging purposes
 * @param options - Retry configuration options
 * @returns Promise that resolves with the operation result
 * @throws The last error encountered if all retry attempts fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'Operation',
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Log success if this wasn't the first attempt
      if (attempt > 1) {
        console.log(`${operationName} succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = isRetryableError(error) && attempt < config.maxAttempts;

      if (shouldRetry) {
        // Calculate delay with exponential backoff
        const delayMs = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );

        console.warn(
          `${operationName} failed on attempt ${attempt}/${config.maxAttempts}. ` +
          `Retrying in ${delayMs}ms...`,
          error instanceof Error ? error.message : error
        );

        await delay(delayMs);
      } else {
        // Don't retry - either not retryable or out of attempts
        if (!isRetryableError(error)) {
          console.error(`${operationName} failed with non-retryable error:`, error);
        } else {
          console.error(`${operationName} failed after ${attempt} attempts:`, error);
        }
        break;
      }
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}
