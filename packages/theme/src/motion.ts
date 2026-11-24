export const motion = {
  collapse: { min: 150, max: 300, perPixel: 1 / 8, closeRatio: 0.7, closeMin: 120 },
  tail: { fade: 24, threshold: 0.5 },
  stagger: 50,
  zoom: {
    min: 0.25,
    max: 4,
    step: 1.25,
    wheel: { line: 16, pinch: 0.01, scroll: 0.002, clamp: 0.2 },
    drag: 3,
    tap: { slop: 10, double: 300, radius: 24 },
    swipe: { far: 60, near: 24, speed: 0.5, ratio: 2 },
  },
  strip: { thumb: 48, pitch: 54, overscan: 4, gap: 6 },
  toast: { width: 382, swap: 400 },
  reveal: { steps: 24, duration: 160, merge: 0.25, fresh: 64, curve: 2.4 },
} as const
