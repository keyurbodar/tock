import type { Clerk } from "@clerk/clerk-js"

type Options = NonNullable<Parameters<Clerk["load"]>[0]>
type ClerkUI = Awaited<NonNullable<NonNullable<Options["ui"]>["ClerkUI"]>>

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) || undefined
const uiVersion = "1"
const blocked = "Could not load the sign-in form. Check your connection or content blocker, then try again."

function frontendHost(key: string): string {
  return atob(key.split("_").slice(2).join("_")).replace(/\$$/, "")
}

function loadUi(key: string): Promise<ClerkUI> {
  const host = window as unknown as { __internal_ClerkUICtor?: ClerkUI }
  return new Promise((resolve, reject) => {
    if (host.__internal_ClerkUICtor) return resolve(host.__internal_ClerkUICtor)
    const script = document.createElement("script")
    script.src = `https://${frontendHost(key)}/npm/@clerk/ui@${uiVersion}/dist/ui.browser.js`
    script.async = true
    script.crossOrigin = "anonymous"
    script.setAttribute("data-clerk-publishable-key", key)
    script.addEventListener("error", () => reject(new Error(blocked)))
    script.addEventListener("load", () => {
      const ctor = host.__internal_ClerkUICtor
      if (ctor) resolve(ctor)
      else reject(new Error(blocked))
    })
    document.head.append(script)
  })
}

const appearance = {
  elements: {
    formButtonPrimary: { boxShadow: "none" },
    formFieldInput: { boxShadow: "none", outline: "none" },
    socialButtonsBlockButton: { boxShadow: "none" },
  },
  variables: {
    colorPrimary: "var(--text-primary)",
    colorPrimaryForeground: "var(--bg-elevated)",
    colorDanger: "var(--text-danger)",
    colorSuccess: "var(--text-success)",
    colorWarning: "var(--text-warning)",
    colorNeutral: "var(--text-primary)",
    colorForeground: "var(--text-primary)",
    colorMuted: "color-mix(in srgb, var(--bg-elevated) 98%, var(--text-primary))",
    colorMutedForeground: "var(--text-secondary)",
    colorBackground: "var(--bg-elevated)",
    colorInputForeground: "var(--text-primary)",
    colorInput: "var(--stroke-secondary)",
    colorRing: "transparent",
  },
}

type Loaded = {
  clerk: Clerk
  ui: Promise<ClerkUI>
}

let loading: Promise<Loaded> | undefined

function load(): Promise<Loaded> {
  if (!publishableKey) return Promise.reject(new Error("Sign-in is not configured for this deployment"))
  const key = publishableKey
  loading ??= (async () => {
    const ui = loadUi(key)
    ui.catch(() => {})
    const { Clerk } = await import("@clerk/clerk-js")
    const clerk = new Clerk(key)
    await clerk.load({ ui: { ClerkUI: ui }, appearance }).catch(() => {
      throw new Error(blocked)
    })
    return { clerk, ui }
  })()
  loading.catch(() => {
    loading = undefined
  })
  return loading
}

export function loadClerk(): Promise<Clerk> {
  return load().then(({ clerk }) => clerk)
}

export async function clerkToken(fresh = false): Promise<string | null> {
  const { session } = await loadClerk()
  return session ? session.getToken(fresh ? { skipCache: true } : undefined) : null
}

export async function openClerkSignIn(): Promise<void> {
  const { clerk, ui } = await load()
  await ui
  const href = location.href
  clerk.openSignIn({ withSignUp: true, forceRedirectUrl: href, signUpForceRedirectUrl: href })
}
