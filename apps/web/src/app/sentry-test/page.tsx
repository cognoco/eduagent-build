/**
 * Sentry Test Page
 *
 * This page provides buttons to trigger different types of errors
 * for testing Sentry error tracking integration.
 *
 * IMPORTANT: This page should only be used in development/staging.
 * Consider removing or protecting this route in production.
 *
 * Usage:
 * 1. Start the web app: pnpm exec nx run web:dev
 * 2. Navigate to: http://localhost:3000/sentry-test
 * 3. Click buttons to trigger errors
 * 4. Check Sentry dashboard for captured events
 */

'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function SentryTestPage() {
  const throwClientError = () => {
    throw new Error('Test client-side error from Sentry test page');
  };

  const throwAsyncError = async () => {
    throw new Error('Test async error from Sentry test page');
  };

  const captureException = () => {
    try {
      throw new Error('Test captured exception from Sentry test page');
    } catch (error) {
      Sentry.captureException(error);
      alert('Exception captured and sent to Sentry!');
    }
  };

  const captureMessage = () => {
    Sentry.captureMessage('Test message from Sentry test page', 'info');
    alert('Message sent to Sentry!');
  };

  const addBreadcrumbAndError = () => {
    Sentry.addBreadcrumb({
      category: 'test',
      message: 'User clicked breadcrumb test button',
      level: 'info',
    });

    Sentry.addBreadcrumb({
      category: 'test',
      message: 'About to trigger error with breadcrumbs',
      level: 'warning',
    });

    throw new Error('Test error with breadcrumbs');
  };

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Sentry Error Tracking Test</h1>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Warning:</strong> This page triggers real errors. Use
                only for testing Sentry integration.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">1. Synchronous Error</h2>
            <p className="text-gray-600 mb-4">
              Throws an uncaught error immediately. This should be captured by
              Sentry&apos;s error boundary.
            </p>
            <button
              onClick={throwClientError}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Throw Client Error
            </button>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">2. Async Error</h2>
            <p className="text-gray-600 mb-4">
              Throws an error in an async function. This tests promise rejection
              handling.
            </p>
            <button
              onClick={() => {
                throwAsyncError().catch((error) => {
                  // Let the error propagate to Sentry
                  throw error;
                });
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Throw Async Error
            </button>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">
              3. Captured Exception
            </h2>
            <p className="text-gray-600 mb-4">
              Manually captures an exception using Sentry.captureException().
              Good for testing handled errors.
            </p>
            <button
              onClick={captureException}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Capture Exception
            </button>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">4. Message</h2>
            <p className="text-gray-600 mb-4">
              Sends an informational message to Sentry (not an error). Useful
              for logging important events.
            </p>
            <button
              onClick={captureMessage}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Send Message
            </button>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">
              5. Error with Breadcrumbs
            </h2>
            <p className="text-gray-600 mb-4">
              Adds breadcrumbs before throwing an error. Check the Sentry event
              to see breadcrumb trail.
            </p>
            <button
              onClick={addBreadcrumbAndError}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
            >
              Add Breadcrumbs & Error
            </button>
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Verification Steps
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ensure NEXT_PUBLIC_SENTRY_DSN is set in .env.local</li>
                  <li>Click any error button above</li>
                  <li>Go to your Sentry dashboard</li>
                  <li>Check Issues tab for the captured error</li>
                  <li>
                    Verify error details (stack trace, breadcrumbs, environment)
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
