import React from 'react';
import { Sentry } from '../../lib/sentry';

interface MentorBirthErrorBoundaryProps {
  children: React.ReactNode;
  componentTag: string;
  onError?: () => void;
}

/** Contains mentor-birth animation failures so the surrounding flow stays usable. */
export class MentorBirthErrorBoundary extends React.Component<
  MentorBirthErrorBoundaryProps,
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[${this.props.componentTag}] crashed:`,
      error.message,
      info.componentStack,
    );
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
      tags: { component: this.props.componentTag },
    });
    this.props.onError?.();
  }

  override render() {
    return this.state.hasError ? null : this.props.children;
  }
}
