/** An error the caller caused: a bad argument (400) or something that is not there (404). */
export class LibraryError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

export const badRequest = (message: string) => new LibraryError(400, message);
export const notFound = (message: string) => new LibraryError(404, message);
