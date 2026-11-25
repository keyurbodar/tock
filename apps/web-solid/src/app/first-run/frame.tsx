import type { ParentProps } from "solid-js"

export function FirstRunFrame(props: ParentProps) {
  return (
    <main class="onboarding-page">
      <section class="onboarding-card">{props.children}</section>
    </main>
  )
}
