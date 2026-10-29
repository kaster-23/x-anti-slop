import { particleBudget, sweepDelay } from '@/lib/hide-motion';

const DURATION_MS = 860;
const BLUR_MS = 720;
const COLLAPSE_MS = 260;

/** Room around the post so dust can leave the card and travel over the page. */
const PAD = { left: 36, right: 220, top: 170, bottom: 48 };

const cells = new Map<HTMLElement, () => void>();
let running = 0;

export function activeDusts(): number {
  return running;
}

export function cancelDust(cell: HTMLElement): void {
  cells.get(cell)?.();
}

export function cancelAllDusts(): void {
  for (const cancel of [...cells.values()]) cancel();
}

/**
 * Plays whichever effect was selected. Particles and blur do not share a
 * timeline: one samples the post into dust, the other only blurs and scales.
 * Either way the cell keeps its height, then eases down to the card.
 */
export function playDust(options: {
  article: HTMLElement;
  cell: HTMLElement;
  particles: boolean;
  /** Collapse mode eases the reserved height down to the card. Blur-in-place does not. */
  collapse: boolean;
  color: string;
  onDone: () => void;
}): () => void {
  return options.particles ? playParticles(options) : playBlur(options);
}

function playBlur(options: {
  article: HTMLElement;
  cell: HTMLElement;
  collapse: boolean;
  onDone: () => void;
}): () => void {
  const { article, cell, collapse, onDone } = options;
  const view = article.ownerDocument.defaultView;
  if (!view) {
    onDone();
    return () => {};
  }
  cancelDust(cell);
  const held = holdHeight(cell, view);
  running += 1;
  const fade = article.animate(
    [
      { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
      { opacity: 0, filter: 'blur(16px)', transform: 'scale(0.94)' },
    ],
    { duration: BLUR_MS, easing: 'ease-in', fill: 'forwards' },
  );
  return track(cell, view, held, fade, null, collapse, onDone, BLUR_MS);
}

function playParticles(options: {
  article: HTMLElement;
  cell: HTMLElement;
  collapse: boolean;
  color: string;
  onDone: () => void;
}): () => void {
  const { article, cell, collapse, color, onDone } = options;
  const view = article.ownerDocument.defaultView;
  const doc = article.ownerDocument;
  if (!view) {
    onDone();
    return () => {};
  }
  cancelDust(cell);

  const art = article.getBoundingClientRect();
  const specks = sampleSpecks(article, art);
  const held = holdHeight(cell, view);
  running += 1;

  // The dust replaces the post. No blur: the text is gone and the specks are it.
  article.style.opacity = '0';

  const canvas = doc.createElement('canvas');
  canvas.className = 'ct-dust';
  const width = art.width + PAD.left + PAD.right;
  const height = art.height + PAD.top + PAD.bottom;
  // Popover's default sheet is inset:0 with a canvas background. Pin the box
  // to the post, or the dust paints as a white page over the timeline.
  canvas.style.position = 'fixed';
  canvas.style.inset = 'auto';
  canvas.style.margin = '0';
  canvas.style.padding = '0';
  canvas.style.border = '0';
  canvas.style.background = 'transparent';
  canvas.style.overflow = 'visible';
  canvas.style.left = `${art.left - PAD.left}px`;
  canvas.style.top = `${art.top - PAD.top}px`;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const dpr = Math.min(2, view.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  doc.body.append(canvas);
  liftCanvas(canvas);

  const context = canvas.getContext('2d');
  let raf = 0;
  if (context) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const start = view.performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      drawSpecks(context, specks, color, t, width, height);
      if (t < 1) raf = view.requestAnimationFrame(tick);
    };
    drawSpecks(context, specks, color, 0, width, height);
    raf = view.requestAnimationFrame(tick);
  }

  const cancelPaint = () => {
    if (raf) view.cancelAnimationFrame(raf);
    closeCanvas(canvas);
    article.style.opacity = '';
  };

  return track(cell, view, held, null, cancelPaint, collapse, onDone, DURATION_MS);
}

function holdHeight(cell: HTMLElement, view: Window): () => void {
  const locked = cell.getBoundingClientRect().height;
  const previousPosition = cell.style.position;
  const previousOverflow = cell.style.overflow;
  const previousHeight = cell.style.height;
  const previousTransition = cell.style.transition;
  if (view.getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
  cell.style.overflow = 'hidden';
  cell.style.transition = 'none';
  cell.style.height = `${locked}px`;
  return () => {
    cell.style.position = previousPosition;
    cell.style.overflow = previousOverflow;
    cell.style.height = previousHeight;
    cell.style.transition = previousTransition;
  };
}

function track(
  cell: HTMLElement,
  view: Window,
  restoreCell: () => void,
  fade: Animation | null,
  cancelPaint: (() => void) | null,
  collapse: boolean,
  onDone: () => void,
  duration: number,
): () => void {
  let finished = false;
  let collapseTimer = 0;
  let endTimer = 0;

  const cancel = () => {
    if (finished) return;
    finished = true;
    running = Math.max(0, running - 1);
    cells.delete(cell);
    view.clearTimeout(collapseTimer);
    view.clearTimeout(endTimer);
    fade?.cancel();
    cancelPaint?.();
    restoreCell();
  };

  const release = () => {
    if (finished) return;
    cancel();
  };

  const finish = () => {
    if (finished) return;
    onDone();
    cancelPaint?.();
    if (!collapse) {
      release();
      return;
    }
    const card = cell.querySelector<HTMLElement>('.ct-placeholder');
    const target = card ? card.offsetHeight + 16 : 0;
    cell.style.transition = `height ${COLLAPSE_MS}ms ease`;
    cell.style.height = `${target}px`;
    cell.addEventListener('transitionend', release, { once: true });
    collapseTimer = view.setTimeout(release, COLLAPSE_MS + 80);
  };

  cells.set(cell, cancel);
  if (fade) fade.finished.then(finish, () => {
    if (!finished) cancel();
  });
  else endTimer = view.setTimeout(finish, duration);
  return cancel;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  media: boolean;
}

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  spin: number;
  delay: number;
  wobble: number;
}

/** Text line boxes and media rectangles, in article-local coordinates. */
function sampleRegions(article: HTMLElement, art: DOMRect): Region[] {
  const regions: Region[] = [];
  const doc = article.ownerDocument;
  const walker = doc.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim()) continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width < 2 || rect.height < 2) continue;
      regions.push({
        x: rect.left - art.left,
        y: rect.top - art.top,
        w: rect.width,
        h: rect.height,
        media: false,
      });
    }
  }
  for (const el of article.querySelectorAll<HTMLElement>('img, video, canvas')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    regions.push({
      x: rect.left - art.left,
      y: rect.top - art.top,
      w: rect.width,
      h: rect.height,
      media: true,
    });
  }
  if (regions.length === 0) {
    regions.push({ x: 0, y: 0, w: art.width, h: art.height, media: false });
  }
  return regions;
}

function sampleSpecks(article: HTMLElement, art: DOMRect): Speck[] {
  const regions = sampleRegions(article, art);
  const budget = particleBudget(art.width, art.height);
  const drafted: Speck[] = [];
  let n = 1;
  for (const region of regions) {
    const gap = region.media ? 8 : 5;
    const cols = Math.max(1, Math.round(region.w / gap));
    const rows = Math.max(1, Math.round(region.h / gap));
    const stepX = region.w / cols;
    const stepY = region.h / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const localX = region.x + (col + 0.5) * stepX;
        const localY = region.y + (row + 0.5) * stepY;
        const scatter = ((n * 17) % 100) / 100;
        const upward = 0.55 + ((n * 13) % 50) / 100;
        drafted.push({
          x: PAD.left + localX,
          y: PAD.top + localY,
          vx: 80 + scatter * 190 + (scatter > 0.84 ? -50 : 0),
          vy: -36 - upward * 150,
          gravity: 64 + scatter * 48,
          size: region.media ? 1.8 + (n % 3) * 0.6 : 1.1 + (n % 2) * 0.55,
          spin: ((n % 9) - 4) * 0.55,
          delay: Math.min(0.7, sweepDelay(localX, art.width) + ((n * 3) % 5) / 100),
          wobble: (n % 2 === 0 ? 1 : -1) * (5 + (n % 6)),
        });
        n += 1;
      }
    }
  }
  if (drafted.length <= budget) return drafted;
  const stride = drafted.length / budget;
  const kept: Speck[] = [];
  for (let i = 0; i < budget; i += 1) {
    const speck = drafted[Math.floor(i * stride)];
    if (speck) kept.push(speck);
  }
  return kept;
}

function drawSpecks(
  context: CanvasRenderingContext2D,
  specks: Speck[],
  color: string,
  t: number,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height);
  context.fillStyle = color;
  for (const speck of specks) {
    const span = 1 - speck.delay;
    const life = t <= speck.delay || span <= 0 ? 0 : Math.min(1, (t - speck.delay) / span);
    const wobble = Math.sin(speck.x * 0.08 + t * 16) * speck.wobble * life;
    const x = speck.x + speck.vx * life + wobble;
    const y = speck.y + speck.vy * life + speck.gravity * life * life;
    context.globalAlpha = 1 - life;
    context.save();
    context.translate(x, y);
    context.rotate(speck.spin * life);
    context.fillRect(-speck.size / 2, -speck.size / 2, speck.size, speck.size * 0.72);
    context.restore();
  }
  context.globalAlpha = 1;
}

function liftCanvas(canvas: HTMLCanvasElement): void {
  const host = canvas as HTMLCanvasElement & { showPopover?: () => void };
  if (typeof host.showPopover !== 'function') return;
  canvas.setAttribute('popover', 'manual');
  try {
    host.showPopover();
  } catch {
    canvas.removeAttribute('popover');
    return;
  }
  // The counts overlay was already in the top layer. Showing it again keeps it above the dust.
  const meter = canvas.ownerDocument.querySelector<HTMLElement>('.ct-meter');
  const pop = meter as (HTMLElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
  if (!pop || typeof pop.showPopover !== 'function' || typeof pop.hidePopover !== 'function') return;
  if (!pop.matches(':popover-open')) return;
  try {
    pop.hidePopover();
    pop.showPopover();
  } catch {
    /* The meter stays where it was. The dust is still unclipped. */
  }
}

function closeCanvas(canvas: HTMLCanvasElement): void {
  const host = canvas as HTMLCanvasElement & { hidePopover?: () => void };
  if (typeof host.hidePopover === 'function' && canvas.matches(':popover-open')) {
    try {
      host.hidePopover();
    } catch {
      /* already closed */
    }
  }
  canvas.remove();
}
