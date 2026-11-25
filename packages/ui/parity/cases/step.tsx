import type { CSSProperties } from "react"
import { cases } from "../case"
import { Step, StepBody, StepCard, StepCardFooter, StepCommand, StepList, StepListItem, StepOutput } from "../../src/chat/step"

const closed = () => null
const COMMAND: ReadonlyArray<readonly [string, string, string]> = [["#6C40BC", "#B392F0", "mkdir"], ["#1E1E1E", "#F5F5F5", " "], ["#00665F", "#5AB7AE", "-p"], ["#1E1E1E", "#F5F5F5", " "], ["#032F62", "#9ECBFF", "~/.tock/work/kiki-ui-test"], ["#1E1E1E", "#F5F5F5", " && "], ["#6C40BC", "#B392F0", "sleep"], ["#1E1E1E", "#F5F5F5", " "], ["#00665F", "#5AB7AE", "8"]]
const OUTPUT = "{\n  \"t\": {\n    \"title\": \"Research 0xReactive article: project, narrative, hackathon tracks, ideas\",\n    \"id\": \"jam_01M7FXHNT4QM5MXSWD88R8QB4M\",\n    \"code\": \"HOME-3\"\n  },\n  \"iss\": {\n    \"text\": \"AMA-11 created \u00b7 In progress \u00b7 @HOME-3\\nThreads: HOME-3 (owner), HOME-2\"\n  }\n}"

export default cases("Step", [
  ["Xbmo0gIumz#4", "tool closed with duration", () => <Step label="Checked GitHub access and repos" duration="1s">{closed()}</Step>],
  ["Xbmo0gIumz#5", "plain closed", () => <Step kind="plain" label="Output">{closed()}</Step>],
  ["Xbmo0gIumz#67", "thinking live, not expandable", () => <Step kind="thought" state="live" label="Thinking" />],
  ["Xbmo0gIumz#72", "thinking live with rolling duration", () => <Step kind="thought" state="live" label="Thinking" duration="7s" rolling>{closed()}</Step>],
  ["Xbmo0gIumz#44", "tool failed", () => <Step state="live" label="Couldn't report back" failed>{closed()}</Step>],
  ["5ltLc1BRJ7|[data-slot=collapsible]:not(:has([role=button]))|1", "tool cancelled, not expandable", () => <Step label="Cancelled operation Running the full capture against capy.ai" outcome="cancelled" />],
  ["Xbmo0gIumz#71", "summary closed with duration", () => <Step kind="summary" label="Ran 3 commands" duration="2s">{closed()}</Step>],
  [
    "Xbmo0gIumz#113",
    "summary open with nested steps",
    () => (
      <Step kind="summary" label="Ran 3 commands" duration="2s" defaultOpen>
        <StepList>
          <StepListItem>
            <Step label="Captured bosun thread (background)" duration="1s">{closed()}</Step>
          </StepListItem>
          <StepListItem>
            <Step label="Captured atlas thread (background)" duration="3m 51s">{closed()}</Step>
          </StepListItem>
          <StepListItem>
            <Step label="Captured kiki1-live thread (background)" duration="0.3s">{closed()}</Step>
          </StepListItem>
          <Step kind="plain" label="Output">{closed()}</Step>
        </StepList>
      </Step>
    ),
  ],
  [
    "Xbmo0gIumz#97",
    "tool open with command card",
    () => (
      <Step state="rest" label="Created scratch folder" defaultOpen>
        <StepBody>
          <StepCard footer={<StepCardFooter status="exit 0" duration="10.5s" />}>
            <StepCommand>
              {COMMAND.map(([light, dark, text], index) => (
                <span key={index} style={{ "--shiki-light": light, "--shiki-dark": dark } as CSSProperties}>
                  {text}
                </span>
              ))}
            </StepCommand>
          </StepCard>
        </StepBody>
      </Step>
    ),
  ],
  [
    "Xbmo0gIumz#120",
    "plain open with output card",
    () => (
      <Step kind="plain" label="Output" defaultOpen>
        <StepBody>
          <StepCard>
            <StepOutput>{OUTPUT}</StepOutput>
          </StepCard>
        </StepBody>
      </Step>
    ),
  ],
])
