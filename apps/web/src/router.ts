import { createRouter, intentPreload } from "@solidjs/router"
import { Home, Thread } from "./chat/thread"
import { subscribe } from "./state/app"

export const Router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/t/:id", component: Thread, preload: ({ params }) => void subscribe(String(params.id)) },
  ],
  preloadLinks: intentPreload({ delay: 0 }),
})
