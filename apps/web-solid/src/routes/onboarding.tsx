import { createFileRoute } from "@tanstack/solid-router"
import { FirstRunFrame } from "../app/first-run/frame"
import { ClerkStep } from "../app/first-run/clerk-step"
import { CloudflareStep } from "../app/first-run/cloudflare-step"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})

function OnboardingPage() {
  return (
    <FirstRunFrame>
      <ClerkStep />
      <CloudflareStep />
    </FirstRunFrame>
  )
}
