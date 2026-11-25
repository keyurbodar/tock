import { Link } from "@tanstack/solid-router"
import { For, Show } from "solid-js"
import type { FixtureConversation } from "../fixtures/types"
import { Button } from "@tock/ui-solid/button"
import { ChatIcon, FilesIcon, PlusIcon, RecipesIcon, SearchIcon, SettingsIcon } from "./icons"

type SidebarContentProps = {
  conversations: FixtureConversation[]
  activeId?: string
  onNavigate?: () => void
}

function railIcon(item: "chat" | "files" | "recipes") {
  return item === "files" ? <FilesIcon /> : item === "recipes" ? <RecipesIcon /> : <ChatIcon />
}

export function RailLinks() {
  const items = [
    ["chat", "/", "Chats"],
    ["files", "/files", "Files"],
    ["recipes", "/recipes", "Recipes"],
  ] as const
  return (
    <>
      <For each={items}>
        {(item) => (
          <Link aria-label={item[2]} class="rail-link" title={item[2]} to={item[1]} activeProps={{ "data-active": "true" }}>
            {railIcon(item[0])}
          </Link>
        )}
      </For>
      <div class="shell-rail-spacer" />
      <Link aria-label="Settings" class="rail-link" title="Settings" to="/settings" activeProps={{ "data-active": "true" }}>
        <SettingsIcon />
      </Link>
    </>
  )
}

export function SidebarContent(props: SidebarContentProps) {
  return (
    <>
      <div class="shell-panel-header">
        <h2 class="panel-title">Chats</h2>
        <div class="header-actions">
          <Button aria-label="Search chats" class="tui-button--icon" type="button">
            <SearchIcon />
          </Button>
          <Button aria-label="New chat" class="tui-button--icon" type="button">
            <PlusIcon />
          </Button>
        </div>
      </div>
      <div class="panel-list">
        <Show when={props.conversations.length} fallback={<div class="conversation-preview">No chats yet</div>}>
          <For each={props.conversations}>
            {(conversation) => (
              <Link
                class="conversation-link"
                data-active={props.activeId === conversation.id ? "true" : undefined}
                onClick={props.onNavigate}
                params={{ conversationId: conversation.id }}
                to="/chat/$conversationId"
              >
                <span class="conversation-title">{conversation.title}</span>
                <span class="conversation-preview">{conversation.preview}</span>
              </Link>
            )}
          </For>
        </Show>
      </div>
    </>
  )
}
