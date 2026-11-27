import { createRouter, intentPreload } from "@solidjs/router"
import { Home, Thread } from "./chat/thread"
import MotionDemo from "./dev/motion-demo"
import { subscribe } from "./state/app"

export const Router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/t/:id", component: Thread, preload: ({ params }) => queueMicrotask(() => void subscribe(String(params.id))) },
    ...(import.meta.env.DEV ? [{ path: "/__motion", component: MotionDemo }] : []),
  ],
  preloadLinks: intentPreload({ delay: 0 }),
})
