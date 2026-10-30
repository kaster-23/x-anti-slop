import { HIDE_DWELL_MS, stepHideSchedule, type HideFrame } from '@/lib/hide-schedule';

/**
 * Watches a post until the scheduler says to play the effect or hide at once.
 * Scrolls re-check the band. A dwell timer fires if the post sits still.
 * The returned function cancels the wait and does not hide.
 */
export function watchHideEffect(
  article: HTMLElement,
  hooks: {
    reducedMotion: () => boolean;
    onPlay: () => void;
    onInstant: () => void;
  },
): () => void {
  const view = article.ownerDocument.defaultView;
  if (!view) {
    hooks.onInstant();
    return () => {};
  }

  let armedAt: number | null = null;
  let timer = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    view.clearTimeout(timer);
    view.removeEventListener('scroll', evaluate, true);
  };

  const evaluate = () => {
    if (stopped) return;
    if (!article.isConnected) {
      stop();
      return;
    }
    const rect = article.getBoundingClientRect();
    const frame: HideFrame = {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      viewportHeight: view.innerHeight,
    };
    const step = stepHideSchedule({
      armedAt,
      now: view.performance.now(),
      frame,
      reducedMotion: hooks.reducedMotion(),
    });
    armedAt = step.armedAt;
    view.clearTimeout(timer);
    if (step.action === 'play') {
      stop();
      hooks.onPlay();
      return;
    }
    if (step.action === 'instant') {
      stop();
      hooks.onInstant();
      return;
    }
    if (armedAt !== null) {
      const remain = HIDE_DWELL_MS - (view.performance.now() - armedAt);
      timer = view.setTimeout(evaluate, Math.max(16, remain));
    }
  };

  view.addEventListener('scroll', evaluate, true);
  evaluate();
  return stop;
}
