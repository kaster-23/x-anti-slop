import { ToggleRow } from '@/components/LabeledSlider';
import {
  CARD_TAGS,
  DEFAULT_TAG_COLORS,
  type CardAppearance as CardAppearanceSettings,
  type CardStyle,
  type CardTagId,
  type CardTextSize,
  type HideAnimation,
} from '@/lib/card-style';

const STYLES: Array<{ id: CardStyle; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'subtle', label: 'Subtle' },
];

const SIZES: Array<{ id: CardTextSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

const MOTIONS: Array<{ id: HideAnimation; label: string }> = [
  { id: 'particles', label: 'Particles' },
  { id: 'blur', label: 'Blur' },
  { id: 'off', label: 'Off' },
];

export default function CardAppearance({
  cards,
  onChange,
}: {
  cards: CardAppearanceSettings;
  onChange: (cards: CardAppearanceSettings) => void;
}) {
  function setColor(id: CardTagId, color: string) {
    onChange({ ...cards, colors: { ...cards.colors, [id]: color } });
  }

  return (
    <div className="field">
      <div className="field-label">
        <span id="card-style-label">Hidden posts</span>
      </div>
      <ToggleRow
        id="card-colors"
        label="Color-code tags"
        checked={cards.colorCoding}
        onChange={(colorCoding) => onChange({ ...cards, colorCoding })}
        explanation="Each hide reason gets its own accent on the card."
        example="Off keeps the same cards in grayscale."
        tipKey="card-colors"
      />
      <div className="seg mt-14" role="group" aria-labelledby="card-style-label">
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            aria-pressed={cards.style === style.id}
            onClick={() => onChange({ ...cards, style: style.id })}
          >
            {style.label}
          </button>
        ))}
      </div>
      <p className="hint mt-8">Solid fills the tag chip. Subtle leaves it as an outline.</p>
      <div className="field-label mt-14">
        <span id="hide-animation-label">Hide animation</span>
      </div>
      <div className="seg" role="group" aria-labelledby="hide-animation-label">
        {MOTIONS.map((motion) => (
          <button
            key={motion.id}
            type="button"
            aria-pressed={cards.hideAnimation === motion.id}
            onClick={() => onChange({ ...cards, hideAnimation: motion.id })}
          >
            {motion.label}
          </button>
        ))}
      </div>
      <p className="hint mt-8">
        Particles and blur are separate. Either plays only for a post already on screen. Reduced motion hides it at once.
      </p>
      <div className="field-label mt-14">
        <span id="card-text-size-label">Text size</span>
      </div>
      <div className="seg" role="group" aria-labelledby="card-text-size-label">
        {SIZES.map((size) => (
          <button
            key={size.id}
            type="button"
            aria-pressed={cards.textSize === size.id}
            onClick={() => onChange({ ...cards, textSize: size.id })}
          >
            {size.label}
          </button>
        ))}
      </div>
      <div className="tag-colors mt-14">
        {CARD_TAGS.map((tag) => {
          const color = cards.colors[tag.id];
          const base = DEFAULT_TAG_COLORS[tag.id];
          return (
            <div key={tag.id} className="tag-color">
              <label htmlFor={`tag-${tag.id}`}>{tag.label}</label>
              <input
                id={`tag-${tag.id}`}
                type="color"
                value={color}
                aria-label={`${tag.label} color`}
                onChange={(event) => setColor(tag.id, event.target.value)}
              />
              <button
                type="button"
                className="text-btn"
                disabled={color === base}
                onClick={() => setColor(tag.id, base)}
              >
                Reset
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
