import { Button } from "@tock/ui-solid/button"
import { Textarea } from "@tock/ui-solid/textarea"
import { AttachIcon, MicIcon } from "../shell/icons"
import { scheduleComposerPreload } from "./lazy"

export function ComposerPlaceholder() {
  return (
    <footer class="composer-footer">
      <div class="composer-frame">
        <div class="composer-capsule">
          <Textarea
            aria-label="Message"
            autoResize
            name="message"
            onFocus={scheduleComposerPreload}
            onMouseEnter={scheduleComposerPreload}
            onTouchStart={scheduleComposerPreload}
            placeholder="Message the agent…"
            rows={1}
          />
        </div>
        <Button aria-label="Attach file" class="tui-button--icon tui-button--composer" type="button">
          <AttachIcon />
        </Button>
        <Button aria-label="Dictate message" class="tui-button--icon tui-button--composer" type="button">
          <MicIcon />
        </Button>
      </div>
    </footer>
  )
}
