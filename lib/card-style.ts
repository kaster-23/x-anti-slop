/**
 * How a hidden post is drawn on the timeline.
 *
 * The tag comes from the reason string the filter already shows ("AI slop (92%)",
 * "Promoted", a custom-filter label). Colors are personal: they are not preset
 * knobs, and an older save picks up these defaults on load.
 */

export type CardTagId =
  | 'slop'
  | 'aiWritten'
  | 'ragebait'
  | 'ad'
  | 'promotional'
  | 'promoted'
  | 'lowQuality'
  | 'botReply'
  | 'custom'
  | 'repeat'
  | 'hashtag'
  | 'emoji'
  | 'links'
  | 'shouting'
  | 'media'
  | 'blocked';

export type CardStyle = 'solid' | 'subtle';
export type CardTextSize = 'small' | 'medium' | 'large';
/** How a visible post leaves when a verdict hides it. */
export type HideAnimation = 'particles' | 'blur' | 'off';

/** Light is X's default light theme. Dim and lights-out are the two dark ones. */
export type FeedTheme = 'light' | 'dim' | 'dark';

export interface CardTag {
  id: CardTagId;
  /** Short name on the chip and in the color picker. */
  label: string;
}

export interface CardAppearance {
  /** Off draws the same cards in grayscale. */
  colorCoding: boolean;
  style: CardStyle;
  textSize: CardTextSize;
  /** Particles and blur when a verdict hides a post that is already on screen. */
  hideAnimation: HideAnimation;
  /** Slow silver line around the timeline counts. On by default. */
  animatedBorder: boolean;
  colors: Record<CardTagId, string>;
}

interface TagSpec extends CardTag {
  /** Reason text with the parenthetical score removed, compared case-insensitively. */
  reasons: readonly string[];
}

export const CARD_TAGS: readonly TagSpec[] = [
  { id: 'slop', label: 'AI slop', reasons: ['ai slop'] },
  { id: 'aiWritten', label: 'AI written', reasons: ['ai written'] },
  { id: 'ragebait', label: 'Rage bait', reasons: ['rage bait'] },
  { id: 'ad', label: 'Engagement bait', reasons: ['ad'] },
  { id: 'promotional', label: 'Ads', reasons: ['promotional'] },
  { id: 'promoted', label: 'Promoted', reasons: ['promoted'] },
  { id: 'lowQuality', label: 'Low quality', reasons: ['low quality'] },
  { id: 'botReply', label: 'Bot reply', reasons: [] },
  { id: 'hashtag', label: 'Hashtag spam', reasons: ['hashtag spam'] },
  { id: 'emoji', label: 'Emoji spam', reasons: ['emoji spam'] },
  { id: 'links', label: 'Link dump', reasons: ['link dump'] },
  { id: 'shouting', label: 'Shouting', reasons: ['shouting'] },
  { id: 'media', label: 'Media', reasons: ['image post', 'video post', 'gif post'] },
  { id: 'blocked', label: 'Blocked', reasons: ['blocked account'] },
  { id: 'repeat', label: 'Repeat', reasons: [] },
  { id: 'custom', label: 'Custom', reasons: [] },
];

/**
 * One flat accent per tag. Mid tones, so a chip can carry dark or light ink
 * and still stay quiet on both of X's dark themes and on light.
 */
export const DEFAULT_TAG_COLORS: Record<CardTagId, string> = {
  slop: '#8aa4b8',
  aiWritten: '#9aa3ad',
  ragebait: '#c47a72',
  ad: '#c4a36a',
  promotional: '#a89468',
  promoted: '#c48a62',
  lowQuality: '#8e98a4',
  botReply: '#9a92b0',
  custom: '#7aab9e',
  repeat: '#c49870',
  hashtag: '#8a93b8',
  emoji: '#c48a9a',
  links: '#86a888',
  shouting: '#c48474',
  media: '#7f98a8',
  blocked: '#a88888',
};

export const DEFAULT_CARD_APPEARANCE: CardAppearance = {
  colorCoding: true,
  style: 'solid',
  textSize: 'medium',
  hideAnimation: 'particles',
  animatedBorder: true,
  colors: { ...DEFAULT_TAG_COLORS },
};

const TAG_BY_ID = new Map(CARD_TAGS.map((tag) => [tag.id, tag]));
const TAG_BY_REASON = new Map(CARD_TAGS.flatMap((tag) => tag.reasons.map((reason) => [reason, tag])));

export function tagById(id: CardTagId): CardTag {
  const tag = TAG_BY_ID.get(id);
  if (!tag) throw new Error(`missing card tag ${id}`);
  return tag;
}

/** The label the filter stored, without a trailing "(92%)" or "(1.2/3)". */
export function reasonLabel(reason: string): string {
  return reason.trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Maps a hide reason onto a tag. A bot-style reply still says "AI slop" in the
 * reason; the flag selects the bot-reply accent. Anything the user wrote
 * themselves, and any label added later, uses the custom accent.
 */
export function tagForReason(reason: string, options?: { botReply?: boolean }): CardTag {
  const label = reasonLabel(reason).toLowerCase();
  if (options?.botReply && (label === 'ai slop' || label === 'bot reply')) return tagById('botReply');
  if (label.startsWith('auto-hidden')) return tagById('repeat');
  return TAG_BY_REASON.get(label) ?? tagById('custom');
}

export interface CardCopy {
  chip: string;
  /** The part that is not already the chip: a score, or the full custom reason. */
  detail: string;
}

export function cardCopy(reason: string, tag: CardTag): CardCopy {
  const full = reason.trim();
  const label = reasonLabel(full);
  const paren = full.match(/\(([^)]+)\)\s*$/)?.[1] ?? '';
  if (tag.id === 'custom' || tag.id === 'repeat') return { chip: tag.label, detail: full };
  if (paren && label.toLowerCase() === tag.label.toLowerCase()) return { chip: tag.label, detail: paren };
  if (paren) return { chip: tag.label, detail: paren };
  return { chip: tag.label, detail: '' };
}

export interface CardChrome {
  tag: CardTagId;
  chip: string;
  detail: string;
  theme: FeedTheme;
  style: CardStyle;
  textSize: CardTextSize;
  colorCoding: boolean;
  /** Null when color coding is off. The card stays grayscale. */
  accent: string | null;
  /** Ink on a filled chip. Null when the chip is only an outline. */
  chipInk: string | null;
}

export function cardChrome(input: {
  reason: string;
  botReply?: boolean;
  appearance: CardAppearance;
  theme: FeedTheme;
}): CardChrome {
  const appearance = normalizeCardAppearance(input.appearance);
  const tag = tagForReason(input.reason, { botReply: input.botReply });
  const copy = cardCopy(input.reason, tag);
  const accent = appearance.colorCoding ? appearance.colors[tag.id] : null;
  return {
    tag: tag.id,
    chip: copy.chip,
    detail: copy.detail,
    theme: input.theme,
    style: appearance.style,
    textSize: appearance.textSize,
    colorCoding: appearance.colorCoding,
    accent,
    chipInk: accent && appearance.style === 'solid' ? chipInk(accent) : null,
  };
}

/** Dark text on a light accent, light text on a dark one. */
export function chipInk(color: string): '#111111' | '#f5f5f5' {
  const rgb = parseCssColor(color);
  if (!rgb) return '#111111';
  const y = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return y > 0.62 ? '#111111' : '#f5f5f5';
}

export function normalizeCardAppearance(raw: unknown): CardAppearance {
  const source = raw && typeof raw === 'object' ? (raw as Partial<CardAppearance>) : {};
  const colors: Partial<Record<CardTagId, string>> =
    source.colors && typeof source.colors === 'object' ? source.colors : {};
  const next = {} as Record<CardTagId, string>;
  for (const tag of CARD_TAGS) {
    next[tag.id] = normalizeHex(colors[tag.id]) ?? DEFAULT_TAG_COLORS[tag.id];
  }
  return {
    colorCoding: typeof source.colorCoding === 'boolean' ? source.colorCoding : DEFAULT_CARD_APPEARANCE.colorCoding,
    style: source.style === 'subtle' || source.style === 'solid' ? source.style : DEFAULT_CARD_APPEARANCE.style,
    textSize:
      source.textSize === 'small' || source.textSize === 'medium' || source.textSize === 'large'
        ? source.textSize
        : DEFAULT_CARD_APPEARANCE.textSize,
    hideAnimation: normalizeHideAnimation(source.hideAnimation),
    animatedBorder: typeof source.animatedBorder === 'boolean' ? source.animatedBorder : DEFAULT_CARD_APPEARANCE.animatedBorder,
    colors: next,
  };
}

export function feedThemeFromBackground(cssColor: string): FeedTheme {
  const rgb = parseCssColor(cssColor);
  if (!rgb) return 'dark';
  const y = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  if (y > 0.72) return 'light';
  if (rgb.b > rgb.r + 8 && rgb.g > rgb.r && y < 0.25) return 'dim';
  return 'dark';
}

/** The glass overlay uses one light treatment and one dark treatment. Dim follows dark. */
export function meterGlassTheme(theme: FeedTheme): 'light' | 'dark' {
  return theme === 'light' ? 'light' : 'dark';
}

export function readFeedTheme(doc: Document): FeedTheme {
  const view = doc.defaultView;
  if (!view) return 'dark';
  const body = doc.body ? view.getComputedStyle(doc.body).backgroundColor : '';
  const root = view.getComputedStyle(doc.documentElement).backgroundColor;
  const chosen = opaque(body) ? body : root;
  return feedThemeFromBackground(opaque(chosen) ? chosen : body || root);
}

function opaque(color: string): boolean {
  const rgb = parseCssColor(color);
  return !!rgb && rgb.a > 0.05;
}

export function normalizeHideAnimation(value: unknown): HideAnimation {
  return value === 'particles' || value === 'blur' || value === 'off' ? value : 'particles';
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  const short = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (!short) return null;
  return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseCssColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = normalizeHex(text);
  if (hex) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
      a: 1,
    };
  }
  const match = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] === undefined ? 1 : Number(match[4]);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
}
