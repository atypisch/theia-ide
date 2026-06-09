/********************************************************************************
 * Soriku IDE — typed engine errors
 ********************************************************************************/

export type EngineErrorCode =
    | 'network'
    | 'timeout'
    | 'http'
    | 'parse'
    | 'stream'
    | 'aborted'
    | 'configuration';

export interface EngineErrorOptions {
    status?: number;
    body?: unknown;
    cause?: Error;
}

/**
 * Base class for all engine transport errors. `code` is a stable discriminant;
 * concrete subclasses below give callers a typed surface for UI handling.
 */
export class EngineError extends Error {
    readonly code: EngineErrorCode;
    readonly status?: number;
    readonly body?: unknown;
    readonly underlying?: Error;

    constructor(code: EngineErrorCode, message: string, options?: EngineErrorOptions) {
        super(message);
        this.name = 'EngineError';
        this.code = code;
        this.status = options?.status;
        this.body = options?.body;
        this.underlying = options?.cause;
    }
}

/** The engine could not be reached at all (connection refused, DNS, or request timeout). */
export class EngineUnavailableError extends EngineError {
    /** True when the request exceeded the configured timeout rather than failing to connect. */
    readonly timedOut: boolean;

    constructor(message: string, options?: EngineErrorOptions & { timedOut?: boolean }) {
        super(options?.timedOut ? 'timeout' : 'network', message, options);
        this.name = 'EngineUnavailableError';
        this.timedOut = options?.timedOut ?? false;
    }
}

/** Authentication/authorization failure (HTTP 401/403). */
export class AuthError extends EngineError {
    constructor(message: string, options?: EngineErrorOptions) {
        super('http', message, options);
        this.name = 'AuthError';
    }
}

/** Rate limit exceeded (HTTP 429). */
export class RateLimitError extends EngineError {
    readonly retryAfterSeconds?: number;

    constructor(message: string, options?: EngineErrorOptions & { retryAfterSeconds?: number }) {
        super('http', message, options);
        this.name = 'RateLimitError';
        this.retryAfterSeconds = options?.retryAfterSeconds;
    }
}

/** Any other non-OK HTTP response from a reachable engine (4xx/5xx). */
export class EndpointError extends EngineError {
    constructor(message: string, options?: EngineErrorOptions) {
        super('http', message, options);
        this.name = 'EndpointError';
    }
}

/** An SSE stream dropped or yielded an unreadable frame after it had started. */
export class StreamInterruptedError extends EngineError {
    constructor(message: string, options?: EngineErrorOptions) {
        super('stream', message, options);
        this.name = 'StreamInterruptedError';
    }
}

/**
 * Map a non-OK HTTP status to the appropriate typed error.
 * 401/403 → AuthError, 429 → RateLimitError, everything else → EndpointError.
 */
export function engineErrorFromStatus(
    status: number,
    message: string,
    options?: EngineErrorOptions & { retryAfterSeconds?: number },
): EngineError {
    const withStatus = { ...options, status };
    if (status === 401 || status === 403) {
        return new AuthError(message, withStatus);
    }
    if (status === 429) {
        return new RateLimitError(message, withStatus);
    }
    return new EndpointError(message, withStatus);
}
