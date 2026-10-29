import { describe, expect, test } from 'bun:test';
import { QUEUE_CONCURRENCY, RequestQueue } from './request-queue';

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RequestQueue', () => {
  test('defaults to four workers', () => {
    expect(QUEUE_CONCURRENCY).toBe(4);
  });

  test('never runs more than the concurrency cap', async () => {
    const queue = new RequestQueue<number>({ concurrency: 4 });
    let active = 0;
    let max = 0;
    const gate = defer();
    const tasks = Array.from({ length: 10 }, (_, i) =>
      queue.enqueue({
        id: `t-${i}`,
        priority: i,
        run: async () => {
          active++;
          max = Math.max(max, active);
          await gate.promise;
          active--;
          return i;
        },
      }),
    );
    await tick();
    expect(active).toBe(4);
    expect(max).toBe(4);
    gate.resolve();
    const outcomes = await Promise.all(tasks);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(max).toBe(4);
  });

  test('runs a closer post before one that was queued earlier', async () => {
    const queue = new RequestQueue<string>({ concurrency: 1 });
    const order: string[] = [];
    const enqueue = (id: string, priority: number) =>
      queue.enqueue({
        id,
        priority,
        run: async () => {
          order.push(id);
          return id;
        },
      });
    await Promise.all([enqueue('far', 100), enqueue('near', 0), enqueue('mid', 50)]);
    expect(order).toEqual(['near', 'mid', 'far']);
  });

  test('merges duplicate ids into one in-flight call and keeps the closer priority', async () => {
    const queue = new RequestQueue<string>({ concurrency: 1 });
    const hold = defer();
    let runs = 0;
    const blocker = queue.enqueue({
      id: 'hold',
      priority: -1,
      run: () => {
        runs++;
        return hold.promise.then(() => 'hold');
      },
    });
    await tick();

    const order: string[] = [];
    const first = queue.enqueue({
      id: 'post',
      priority: 40,
      run: async () => {
        runs++;
        order.push('post');
        return 'post';
      },
    });
    const duplicate = queue.enqueue({
      id: 'post',
      priority: 1,
      run: async () => {
        runs++;
        order.push('duplicate');
        return 'duplicate';
      },
    });
    const other = queue.enqueue({
      id: 'other',
      priority: 10,
      run: async () => {
        order.push('other');
        return 'other';
      },
    });

    hold.resolve();
    const [a, b] = await Promise.all([first, duplicate]);
    await Promise.all([blocker, other]);
    expect(a).toEqual({ ok: true, value: 'post' });
    expect(b).toEqual(a);
    expect(order).toEqual(['post', 'other']);
    expect(runs).toBe(2);
  });

  test('fail-opens when the task throws, without rejecting', async () => {
    const queue = new RequestQueue<string>({ concurrency: 1 });
    const outcome = await queue.enqueue({
      id: 'bad',
      priority: 0,
      run: async () => {
        throw new Error('socket closed');
      },
    });
    expect(outcome).toEqual({ ok: false, error: 'socket closed' });
  });

  test('fail-opens a hung task at the timeout and frees the slot', async () => {
    const queue = new RequestQueue<string>({ concurrency: 1, timeoutMs: 30 });
    const hung = queue.enqueue({
      id: 'hung',
      priority: 0,
      run: () => new Promise(() => {}),
    });
    const next = queue.enqueue({
      id: 'next',
      priority: 1,
      run: async () => 'next',
    });
    const [hungOutcome, nextOutcome] = await Promise.all([hung, next]);
    expect(hungOutcome).toEqual({ ok: false, error: 'Timed out' });
    expect(nextOutcome).toEqual({ ok: true, value: 'next' });
  });
});
