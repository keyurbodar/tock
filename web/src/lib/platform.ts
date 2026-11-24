export const APPLE = /mac|iphone|ipad/i.test(navigator.platform)
export const MOD = APPLE ? "⌘" : "Ctrl"
export const chord = (key: string) => (APPLE ? `⌘${key}` : `Ctrl+${key}`)
