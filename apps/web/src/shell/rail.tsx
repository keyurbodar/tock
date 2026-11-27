import { Icon, type IconName } from "@tock/ui/icon"

const items: { icon: IconName; label: string; on?: boolean }[] = [
  { icon: "chat-circle", label: "Chats", on: true },
  { icon: "terminal-window", label: "Sessions" },
  { icon: "code", label: "Code" },
  { icon: "globe", label: "Web" },
]

export function Rail(props: { unread: number }) {
  return (
    <nav class="relative z-rail flex w-rail flex-none flex-col items-center gap-6 bg-rail pt-20 pb-18" aria-label="Spaces">
      {items.map((item) => (
        <button
          type="button"
          aria-label={item.label}
          aria-current={item.on ? "page" : undefined}
          data-on={item.on ? "" : undefined}
          class="tds-press relative grid size-rail-button place-items-center rounded-row text-muted tds-hoverfill hover:bg-hover hover:text-tx2 data-on:bg-glass-on data-on:text-tx data-on:shadow-glass"
        >
          <Icon name={item.on ? "chat-circle:fill" : item.icon} size="rail" />
          {item.on && props.unread > 0 && (
            <span class="absolute top-4 right-3 grid h-badge min-w-badge place-items-center rounded-pill bg-rose px-5 text-badge text-on-rose shadow-ring-badge num">
              {props.unread}
            </span>
          )}
        </button>
      ))}
      <span class="flex-1" />
      <button type="button" aria-label="Settings" class="tds-press grid size-rail-button place-items-center rounded-row text-muted hover:bg-hover hover:text-tx2">
        <Icon name="gear-six" size="rail" />
      </button>
    </nav>
  )
}
