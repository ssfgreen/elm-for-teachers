/** An error carrying an HTTP status; the app's error handler maps it to `{ error, code? }`. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (what: string): HttpError => new HttpError(404, `${what} not found`, 'not_found');
export const tooManyRequests = (message: string, code: string): HttpError => new HttpError(429, message, code);
export const conflict = (message: string, code = 'conflict'): HttpError => new HttpError(409, message, code);
export const badRequest = (message: string, code = 'bad_request'): HttpError => new HttpError(400, message, code);
