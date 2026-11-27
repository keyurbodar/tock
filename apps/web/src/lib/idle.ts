/** requestIdleCallback where the browser has it. Safari has none, and calling it there threw and halted the app, so fall back to a timer. */
export const whenIdle = (fn: () => void): number =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(fn) : window.setTimeout(fn)

export const cancelIdle = (id: number) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id))
