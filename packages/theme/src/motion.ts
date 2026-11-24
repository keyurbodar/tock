export const motion = {
  collapse: { min: 150, max: 300, perPixel: 1 / 8, closeRatio: 0.7, closeMin: 120 },
  tail: { fade: 24, threshold: 0.5 },
  stagger: 50,
  reveal: { steps: 24, duration: 160, merge: 0.25, fresh: 64, curve: 2.4 },
} as const
