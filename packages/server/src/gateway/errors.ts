export type ProviderErrorKind = 'network' | 'http' | 'timeout' | 'bad_response' | 'aborted';

/** Any failure of a provider call. Messages never contain the API key. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;

  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}
