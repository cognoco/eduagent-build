/** Thrown when consent withdrawal prohibits an LLM dispatch. */
export class ConsentWithdrawnError extends Error {
  constructor() {
    super('Consent has been withdrawn — processing is refused');
    this.name = 'ConsentWithdrawnError';
  }
}
