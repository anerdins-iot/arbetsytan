'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Något gick fel</h2>
      <p className="mb-6 text-muted-foreground">
        Ett oväntat fel har inträffat. Vi har blivit informerade och arbetar på att lösa det.
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors"
      >
        Försök igen
      </button>
    </div>
  );
}
