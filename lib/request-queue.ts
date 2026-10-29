/**
 * Priority queue for Jev calls. Lower `priority` runs first. Calls with the
 * same id share one in-flight promise, and a later enqueue can only pull a
 * still-waiting call forward. The queue resolves with `{ ok: false }` on
 * timeout or a thrown task so the post stays visible.
 */
export const QUEUE_CONCURRENCY = 4;

export interface QueueTask<T> {
  id: string;
  priority: number;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface QueueSuccess<T> {
  ok: true;
  value: T;
}

export interface QueueFailure {
  ok: false;
  error: string;
}

export type QueueOutcome<T> = QueueSuccess<T> | QueueFailure;

export interface RequestQueueOptions {
  concurrency?: number;
  /** Aborts the task and fail-opens when it is still running. */
  timeoutMs?: number;
}

interface Pending<T> {
  id: string;
  priority: number;
  run: (signal: AbortSignal) => Promise<T>;
  settle: (outcome: QueueOutcome<T>) => void;
}

export class RequestQueue<T> {
  private readonly concurrency: number;
  private readonly timeoutMs: number | undefined;
  private pending: Pending<T>[] = [];
  private readonly inflight = new Map<string, Promise<QueueOutcome<T>>>();
  private active = 0;
  private pumpScheduled = false;

  constructor(opts: RequestQueueOptions = {}) {
    this.concurrency = Math.max(1, opts.concurrency ?? QUEUE_CONCURRENCY);
    this.timeoutMs = opts.timeoutMs;
  }

  enqueue(task: QueueTask<T>): Promise<QueueOutcome<T>> {
    const existing = this.inflight.get(task.id);
    if (existing) {
      this.raisePriority(task.id, task.priority);
      return existing;
    }

    let settle!: (outcome: QueueOutcome<T>) => void;
    const promise = new Promise<QueueOutcome<T>>((resolve) => {
      settle = resolve;
    });
    this.inflight.set(task.id, promise);
    this.pending.push({ id: task.id, priority: task.priority, run: task.run, settle });
    this.schedulePump();
    return promise;
  }

  private raisePriority(id: string, priority: number) {
    const item = this.pending.find((entry) => entry.id === id);
    if (item && priority < item.priority) item.priority = priority;
  }

  private schedulePump() {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump() {
    this.pending.sort((a, b) => a.priority - b.priority);
    while (this.active < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) break;
      this.active++;
      void this.runOne(next).finally(() => {
        this.active--;
        this.inflight.delete(next.id);
        this.pump();
      });
    }
  }

  /**
   * The slot is released when the task settles or the timeout fires, whichever
   * comes first. A task that never observes the abort signal cannot hold the
   * worker after the budget.
   */
  private runOne(task: Pending<T>): Promise<void> {
    return new Promise((done) => {
      const controller = new AbortController();
      let finished = false;
      const finish = (outcome: QueueOutcome<T>) => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        task.settle(outcome);
        done();
      };

      const timer =
        this.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              controller.abort();
              finish({ ok: false, error: 'Timed out' });
            }, this.timeoutMs);

      let result: Promise<T>;
      try {
        result = Promise.resolve(task.run(controller.signal));
      } catch (err) {
        finish({ ok: false, error: errorMessage(err) });
        return;
      }
      result.then(
        (value) => finish({ ok: true, value }),
        (err: unknown) => finish({ ok: false, error: errorMessage(err) }),
      );
    });
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Classification failed';
}
