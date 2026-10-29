import { redactSecrets } from './redact';

type RuntimeLike = { id?: string } | null | undefined;

/**
 * True while this extension page can still call `runtime` and `storage`.
 * After a reload or update, an old content script's `runtime.id` is missing,
 * and reading it can itself throw.
 */
export function runtimeAlive(readRuntime: () => RuntimeLike): boolean {
  try {
    const runtime = readRuntime();
    return typeof runtime?.id === 'string' && runtime.id.length > 0;
  } catch {
    return false;
  }
}

export function isContextInvalidatedError(err: unknown): boolean {
  return /extension context invalidated/i.test(errorMessage(err));
}

export function contentErrorText(err: unknown): string {
  return redactSecrets(errorMessage(err));
}

/** Invalidated contexts are expected. Chrome's Errors page records warns. */
export function shouldReportContentError(err: unknown, alive: boolean): boolean {
  if (!alive || isContextInvalidatedError(err)) return false;
  return true;
}

export function reportContentFailure(label: string, err: unknown, alive: boolean): void {
  if (!shouldReportContentError(err, alive)) return;
  console.warn(`[x-anti-slop] ${label}`, contentErrorText(err));
}

/** Runs a storage or runtime call. A dead context is a no-op, not a rejection. */
export async function runContentTask(
  alive: boolean,
  task: () => Promise<unknown>,
  label: string,
): Promise<void> {
  if (!alive) return;
  try {
    await task();
  } catch (err) {
    reportContentFailure(label, err, alive);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
