let loading: Promise<unknown> | undefined

export function preloadComposerEditor() {
  loading ??= Promise.all([import("@tiptap/core"), import("@tiptap/extensions"), import("@tiptap/pm/model")])
  return loading
}

export function scheduleComposerPreload() {
  window.setTimeout(() => void preloadComposerEditor(), 50)
}
