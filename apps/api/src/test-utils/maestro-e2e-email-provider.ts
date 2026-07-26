import { registerEmailTransportForTesting } from '../services/notifications/email';

/** Register the hosted-Maestro email receipt without contacting a provider. */
export function registerMaestroE2eEmailProvider(): void {
  registerEmailTransportForTesting(async () => ({
    sent: true,
    messageId: 'maestro-e2e-email',
  }));
}
