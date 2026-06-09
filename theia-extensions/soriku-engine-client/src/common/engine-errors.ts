/********************************************************************************
 * Soriku IDE — typed engine errors
 ********************************************************************************/

export type EngineErrorCode =
    | 'network'
    | 'http'
    | 'parse'
    | 'aborted'
    | 'configuration';

export class EngineError extends Error {
    readonly code: EngineErrorCode;
    readonly status?: number;
    readonly body?: unknown;
    readonly underlying?: Error;

    constructor(code: EngineErrorCode, message: string, options?: { status?: number; body?: unknown; cause?: Error }) {
        super(message);
        this.name = 'EngineError';
        this.code = code;
        this.status = options?.status;
        this.body = options?.body;
        this.underlying = options?.cause;
    }
}
