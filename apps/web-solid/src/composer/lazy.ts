let loading: Promise<typeof import("./rich/editor")> | undefined

export function loadComposerEditor() {
  loading ??= import("./rich/editor")
  return loading
}

export function scheduleComposerPreload() {
  window.setTimeout(() => void loadComposerEditor(), 50)
}
