/**
 * NightSky — original atmospheric hero background.
 *
 * A canvas flow-field of slow, wind-like curves drifting around a faint
 * architectural silhouette, with a few distant points of light. The drawing
 * logic lives in src/entrypoints/client.tsx (initNightSky) and honours
 * prefers-reduced-motion (draws a single still frame instead).
 */
export function NightSky({ className }: { className?: string }) {
  return <canvas className={className} data-night-sky="" aria-hidden="true"></canvas>;
}
