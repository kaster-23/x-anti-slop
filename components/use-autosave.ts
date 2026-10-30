import { useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_HINT,
  AUTOSAVE_QUIET_MS,
  afterSave,
  type AutosavePhase,
} from '@/lib/autosave';
import type { Settings } from '@/lib/types';

const HINT_KEY = 'x-antislop-autosave-hint';

export function useAutosave(persist: (patch: Partial<Settings>) => Promise<void>) {
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const [phase, setPhase] = useState<AutosavePhase>('idle');
  const [showHint, setShowHint] = useState(false);
  const pending = useRef<Partial<Settings> | null>(null);
  const failed = useRef<Partial<Settings> | null>(null);
  const tries = useRef(0);
  const timer = useRef(0);
  const quiet = useRef(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY) === '1') return;
      localStorage.setItem(HINT_KEY, '1');
      setShowHint(true);
    } catch {
      setShowHint(true);
    }
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(quiet.current);
    };
  }, []);

  async function run(patch: Partial<Settings>): Promise<void> {
    setPhase('saving');
    let ok = false;
    try {
      await persistRef.current(patch);
      ok = true;
      failed.current = null;
    } catch {
      failed.current = patch;
    }
    const next = afterSave(tries.current, ok);
    tries.current = next.tries;
    if (next.retry) {
      await run(patch);
      return;
    }
    setPhase(next.phase);
    if (next.phase === 'saved') {
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(() => setPhase('quiet'), AUTOSAVE_QUIET_MS);
    }
  }

  function flush() {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    void run(patch);
  }

  function submit(patch: Partial<Settings>, debounce: boolean) {
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    if (!debounce) {
      flush();
      return;
    }
    timer.current = window.setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }

  function retry() {
    const patch = failed.current;
    if (!patch) return;
    tries.current = 0;
    void run(patch);
  }

  return { phase, showHint, hint: AUTOSAVE_HINT, submit, retry };
}
