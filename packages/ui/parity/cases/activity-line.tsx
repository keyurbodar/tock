import { cases } from "../case"
import { ActivityLine, ActivityLiveStatus, ActivityStatus, WorkGroup } from "../../src/chat/activity-line"
import { Step } from "../../src/chat/step"

const closed = () => null

export default cases("ActivityLine", [
  [
    "0l_jns6qrS#9",
    "done, expanded, one work group",
    () => (
      <ActivityLine status={<ActivityStatus label="Worked" duration="21s" />} defaultOpen>
        <WorkGroup>
          <Step state="live" label="Searched tools for xeffect" />
          <Step state="live" label="Ran xeffect profile get" duration="1s">{closed()}</Step>
        </WorkGroup>
      </ActivityLine>
    ),
  ],
  [
    "0l_jns6qrS#5",
    "live, expanded, thinking",
    () => (
      <ActivityLine status={<ActivityLiveStatus label="Working" duration="5s" rolling />} defaultOpen>
        <WorkGroup>
          <Step kind="thought" state="live" label="Thinking" duration="5s" rolling>{closed()}</Step>
        </WorkGroup>
      </ActivityLine>
    ),
  ],
])
