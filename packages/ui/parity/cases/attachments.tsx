import { cases } from "../case"
import { AttachmentStrip, AttachmentTile, SentAttachment } from "../../src/chat/attachments"

const noop = () => {}

export default cases("AttachmentStrip", [
  [
    "cY2sEsDwge|div.flex.flex-wrap.items-center.pt-2|0",
    "ready file, ready image, uploading 42%, preparing, finishing, failed",
    () => (
      <AttachmentStrip>
        <AttachmentTile name="trace-export.json" mediaType="application/json" size="47 KB" status={{ phase: "ready" }} onRemove={noop} />
        <AttachmentTile
          name="screenshot.png"
          mediaType="image/png"
          size="47 KB"
          status={{ phase: "ready" }}
          previewUrl="https://doop.design/a/pJdOfPLu-x.svg"
          onPreview={noop}
          onRemove={noop}
        />
        <AttachmentTile name="session-recording.mov" mediaType="video/quicktime" size="174 MB" status={{ phase: "uploading", progress: 42 }} onRemove={noop} />
        <AttachmentTile name="app.slack.com2.har" mediaType="application/json" size="25 MB" status={{ phase: "uploading" }} onRemove={noop} />
        <AttachmentTile name="app.slack.com2.har" mediaType="application/json" size="25 MB" status={{ phase: "uploading", progress: 100 }} onRemove={noop} />
        <AttachmentTile
          name="big-dataset.parquet"
          mediaType="application/octet-stream"
          size="286 MB"
          status={{ phase: "failed", message: "Over the 250 MB file limit" }}
          onRemove={noop}
        />
      </AttachmentStrip>
    ),
  ],
  [
    "9kSoR-Dh7N|button[aria-label='Open kiko-design-system-kds (1).zip']|0",
    "sent file card under a user message",
    () => <SentAttachment name="kiko-design-system-kds (1).zip" mediaType="application/zip" size="8.3 MB" onOpen={noop} />,
  ],
  [
    "9kSoR-Dh7N|span[data-slot=context-menu-trigger]:has(> button[aria-label='Preview screenshot.png'])|1",
    "sent image card while its thumbnail loads",
    () => (
      <SentAttachment
        name="screenshot.png"
        mediaType="image/png"
        size="881 KB"
        previewUrl="/api/files/file_01M7FW0VKR6Y54TCTY9H6RAYJC.preview"
        onOpen={noop}
      />
    ),
  ],
])
