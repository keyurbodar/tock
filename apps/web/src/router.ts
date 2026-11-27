import { lazy } from "solid-js"
import { createRouter, intentPreload } from "@solidjs/router"
import { Home, Thread } from "./chat/thread"
import { preload } from "./state/app"

export const Router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/t/:id", component: Thread, preload: ({ params }) => queueMicrotask(() => void preload(String(params.id))) },
    ...(import.meta.env.DEV ? [{ path: "/__motion", component: lazy(() => import("./dev/motion-demo")) }] : []),
  ],
  preloadLinks: intentPreload({ delay: 0 }),
})
