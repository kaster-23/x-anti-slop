/** Tooltip bubble. Anchored under the mark, left-aligned, never wider than this. */
export const TIP_MAX_WIDTH = 320;

/**
 * Horizontal shift, in px, that keeps a left-aligned bubble inside the viewport.
 * Negative pulls it left when it would pass the right edge.
 */
export function clampTipShift(
  left: number,
  width: number,
  viewportWidth: number,
  margin = 8,
): number {
  if (!(viewportWidth > 0) || !(width > 0)) return 0;
  const rightLimit = viewportWidth - margin;
  let shift = 0;
  if (left + width > rightLimit) shift = rightLimit - (left + width);
  if (left + shift < margin) shift = margin - left;
  return shift;
}
