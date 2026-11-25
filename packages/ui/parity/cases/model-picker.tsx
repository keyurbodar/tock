import { cases } from "../case"
import { PickerCardHead, PickerRow, PickerSection, type PickerGroup } from "../../src/model-picker"
import { StepSlider } from "../../src/step-slider"

const noop = () => {}
const label = (step: string) => step.slice(0, 1).toUpperCase() + step.slice(1)
const steps = ["low", "medium", "high"] as const
const model = (key: string, name: string, price: string) => ({ key, name, price, stats: [], steps })
const anthropic: PickerGroup<(typeof steps)[number]> = {
  id: "anthropic",
  name: "Anthropic",
  models: [
    model("claude-fable-5-2", "Claude Fable 5.2", "$8 / $40"),
    model("claude-opus-5-5", "Claude Opus 5.5", "$4 / $20"),
    model("claude-sonnet-5-5", "Claude Sonnet 5.5", "$2 / $10"),
    model("claude-haiku-5-5", "Claude Haiku 5.5", "$0.10 / $0.50"),
  ],
}
const fable = model("claude-fable-5-2", "Claude Fable 5.2", "$8 / $40")
const opus = {
  ...model("claude-opus-5-5", "Claude Opus 5.5", "$4 / $20"),
  stats: [
    ["Context", "1M"],
    ["Input per 1M", "$4"],
    ["Output per 1M", "$20"],
  ] as const,
}

export default cases("ModelPicker", [
  [
    "QxcNt6VxLM|[data-slot=picker-lab-card] [role=slider]|0",
    "reasoning slider at the middle step",
    () => <StepSlider steps={steps} value="medium" label="Reasoning" valueText={label} onChange={noop} />,
  ],
  [
    "QxcNt6VxLM|[role=listbox][aria-label=Models] > [data-anchor=anthropic]|0",
    "provider section with priced rows",
    () => (
      <PickerSection group={anthropic}>
        {anthropic.models.map((item) => (
          <PickerRow key={item.key} nav={`m:lab:anthropic/${item.key}`} group={anthropic} model={item} selected={false} />
        ))}
      </PickerSection>
    ),
  ],
  [
    "Hp9T9TWcIL|[data-slot=drawer-content] [data-anchor=anthropic] [role=option]|0",
    "priced row in the touch drawer, with its settings button",
    () => <PickerRow nav="m:lab:anthropic/claude-fable-5-2" group={anthropic} model={fable} selected={false} onMore={noop} />,
  ],
  [
    "cY2sEsDwge|[data-slot=picker-lab-card] > div > div.relative.-mx-1|0",
    "detail card header and stats",
    () => <PickerCardHead group={anthropic} model={opus} />,
  ],
])
