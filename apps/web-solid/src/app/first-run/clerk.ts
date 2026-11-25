const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

export async function openClerkSignIn() {
  if (!publishableKey) return false
  const { Clerk } = await import("@clerk/clerk-js")
  const clerk = new Clerk(publishableKey)
  await clerk.load()
  clerk.openSignIn({
    appearance: {
      variables: {
        colorBackground: "var(--bg-card)",
        colorInputBackground: "var(--bg-input)",
        colorPrimary: "var(--button-accent-bg)",
        colorText: "var(--text-primary)",
      },
    },
  })
  return true
}
