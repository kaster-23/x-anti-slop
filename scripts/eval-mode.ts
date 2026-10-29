import type { ProviderId } from '../lib/types';

/** One local command. Unset or blank keeps the recorded fixtures. */
export const LIVE_EVAL_COMMAND = 'TYPESAFE_API_KEY=… pnpm eval';

export type EvalMode =
  | { live: false }
  | { live: true; provider: ProviderId; apiKey: string };

/**
 * `pnpm eval` with no key scores the recorded fixtures.
 * `TYPESAFE_API_KEY=… pnpm eval` calls TypeSafe. OpenRouter is the same idea
 * with `PROVIDER=openrouter` and `OPENROUTER_API_KEY`.
 */
export function evalModeFromEnv(env: NodeJS.ProcessEnv = process.env): EvalMode {
  const provider = env.PROVIDER?.trim();
  const typesafeKey = env.TYPESAFE_API_KEY?.trim() ?? '';
  const openrouterKey = env.OPENROUTER_API_KEY?.trim() ?? '';

  if (provider === 'openrouter') {
    return openrouterKey ? { live: true, provider: 'openrouter', apiKey: openrouterKey } : { live: false };
  }
  if (typesafeKey) return { live: true, provider: 'typesafe', apiKey: typesafeKey };
  return { live: false };
}
