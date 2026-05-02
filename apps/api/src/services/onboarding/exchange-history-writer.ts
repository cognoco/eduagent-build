import type { ExchangeEntry } from '@eduagent/schemas';

export function appendInterviewUserExchange(
  history: ExchangeEntry[],
  content: string,
  clientId?: string
): ExchangeEntry[] {
  if (!clientId) {
    return [...history, { role: 'user', content }];
  }

  const existing = history.some(
    (entry) => entry.role === 'user' && entry.client_id === clientId
  );
  if (existing) {
    return history;
  }

  return [...history, { role: 'user', content, client_id: clientId }];
}

export function appendInterviewAssistantExchange(
  history: ExchangeEntry[],
  content: string,
  clientId?: string
): ExchangeEntry[] {
  if (!clientId) {
    return [...history, { role: 'assistant', content }];
  }

  const userIndex = history.findIndex(
    (entry) => entry.role === 'user' && entry.client_id === clientId
  );
  if (userIndex === -1) {
    return [...history, { role: 'assistant', content }];
  }

  const hasAssistantAfterUser = history
    .slice(userIndex + 1)
    .some((entry) => entry.role === 'assistant');
  if (hasAssistantAfterUser) {
    return history;
  }

  return [...history, { role: 'assistant', content }];
}
