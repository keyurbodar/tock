import { cases } from "../case"
import { AttachmentStrip, AttachmentTile } from "../../src/chat/attachments"

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
])
