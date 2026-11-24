import { withTheme, withWallpaper, type Mode } from "@tock/theme/apply"
import { EFFECTS, type WallpaperAppearance } from "@tock/theme/effects"
import { WALLPAPER_THEMES } from "@tock/theme/themes"
import { COLOR_THEMES, type Tokens } from "@tock/theme/tokens"
import { Card, Page, Section, SettingsRow } from "@tock/ui/card"
import { Slider } from "@tock/ui/slider"
import { Switch } from "@tock/ui/switch"
import type { CSSProperties, ReactNode } from "react"
import { titleCase } from "../lib/format"
import { Segmented } from "../shell/form-dialog"
import { setAppearance, useAppearance } from "../state/appearance"

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const LOOK: readonly { key: keyof WallpaperAppearance; label: string; max: number }[] = [
  { key: "brightness", label: "Brightness", max: 150 },
  { key: "blur", label: "Blur", max: 40 },
  { key: "fade", label: "Fade", max: 100 },
  { key: "opacity", label: "Opacity", max: 100 },
  { key: "overlay", label: "Overlay", max: 100 },
  { key: "inputOpacity", label: "Input opacity", max: 100 },
]

const GRID = "grid grid-cols-3 gap-4 p-4 @md:grid-cols-4 @2xl:grid-cols-6"
const SWATCH =
  "relative block aspect-[3/2] w-full overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 group-focus-visible:outline-ring-inset group-aria-checked:border-primary"

const tokenStyle = (tokens: Tokens) =>
  Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, value])) as CSSProperties

function Preview({ mode, theme, tokens }: { mode: "light" | "dark"; theme: string; tokens?: Tokens }) {
  return (
    <span
      aria-hidden="true"
      data-color-theme={theme}
      data-theme-preview={mode}
      style={tokens ? tokenStyle(tokens) : undefined}
      className={`${mode === "dark" ? "dark " : ""}relative flex h-full w-full bg-(--bg)`}
    >
      <span className="flex w-[22%] shrink-0 flex-col gap-[8%] px-[3.5%] pt-[9%]">
        <span className="h-[9%] w-full rounded-sm bg-(--secondary)" />
        <span className="h-[9%] w-[70%] rounded-sm bg-(--secondary)" />
      </span>
      <span className="my-[5%] mr-[4%] flex min-w-0 flex-1 flex-col justify-between rounded border-[0.5px] border-(--border-1) bg-(--panel) p-[6%]">
        <span className="flex flex-col gap-0.5">
          <span className="h-0.5 w-[60%] rounded-sm bg-(--fg) opacity-60" />
          <span className="h-0.5 w-[40%] rounded-sm bg-(--fg) opacity-30" />
        </span>
        <span className="flex h-[26%] items-center justify-end rounded border-[0.5px] border-(--border-2) bg-(--card) pr-[4%]">
          <span className="size-1 rounded-full bg-(--primary)" />
        </span>
      </span>
    </span>
  )
}

function Choice({
  label,
  checked,
  onSelect,
  children,
}: {
  label: string
  checked: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      onClick={onSelect}
      className="group flex min-w-0 cursor-pointer flex-col items-center gap-2 outline-none disabled:pointer-events-none disabled:opacity-55"
    >
      <span className={SWATCH}>{children}</span>
      <span className="max-w-full truncate text-xs text-muted-foreground-1 group-aria-checked:font-medium group-aria-checked:text-foreground">
        {label}
      </span>
    </button>
  )
}

export function Appearance() {
  const appearance = useAppearance()
  const dark = document.documentElement.classList.contains("dark")
  return (
    <Page title="Appearance">
      <Section>
        <Card>
          <div data-slot="settings-row" className="group/row flex items-center gap-6 p-4">
            <div className="shrink-0 text-sm font-medium text-foreground">Mode</div>
            <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2">
              <div role="group" aria-label="Mode" className="flex min-w-0 gap-4">
                {MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-label={mode.label}
                    aria-pressed={appearance.mode === mode.value}
                    onClick={() => setAppearance((current) => ({ ...current, mode: mode.value }))}
                    className="relative block aspect-[4/3] w-20 min-w-0 shrink cursor-pointer overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 outline-none focus-visible:outline-ring-inset aria-pressed:border-primary"
                  >
                    {mode.value === "system" ? (
                      <>
                        <span className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
                          <Preview mode="light" theme="tock" />
                        </span>
                        <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
                          <Preview mode="dark" theme="tock" />
                        </span>
                      </>
                    ) : (
                      <Preview mode={mode.value} theme="tock" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SettingsRow title="Match theme to wallpaper" description="Picking a wallpaper also applies its colors">
            <Switch
              aria-label="Match theme to wallpaper"
              checked={appearance.linked}
              onCheckedChange={(linked) => setAppearance((current) => ({ ...current, linked }))}
            />
          </SettingsRow>
        </Card>
      </Section>
      <Section title="Wallpaper" description="Shown behind the home screen">
        <Card className="@container">
          <div role="radiogroup" aria-label="Wallpaper" className={GRID}>
            <Choice
              label="None"
              checked={appearance.wallpaper === null}
              onSelect={() => setAppearance((current) => withWallpaper(current, null))}
            >
              <span className="block h-full w-full bg-panel" />
            </Choice>
            {WALLPAPER_THEMES.filter((theme) => theme.wallpaper !== null).map((theme) => (
              <Choice
                key={theme.id}
                label={theme.name}
                checked={appearance.wallpaper === theme.id}
                onSelect={() => setAppearance((current) => withWallpaper(current, theme.id))}
              >
                <img alt="" loading="lazy" src={theme.wallpaper ?? undefined} className="absolute inset-0 size-full object-cover" />
              </Choice>
            ))}
          </div>
          <SettingsRow title="Effect">
            <Segmented
              label="Effect"
              value={appearance.effect}
              options={EFFECTS.map((effect) => ({ value: effect, label: titleCase(effect) }))}
              onChange={(effect) => setAppearance((current) => ({ ...current, effect }))}
            />
          </SettingsRow>
          {LOOK.map((control) => (
            <SettingsRow key={control.key} title={control.label}>
              <span className="w-8 text-right text-xs text-muted-foreground-2 tabular-nums">{appearance.look[control.key]}</span>
              <Slider
                label={control.label}
                max={control.max}
                value={appearance.look[control.key]}
                onChange={(value) =>
                  setAppearance((current) => ({ ...current, look: { ...current.look, [control.key]: value } }))
                }
              />
            </SettingsRow>
          ))}
        </Card>
      </Section>
      <Section title="Theme">
        <Card className="@container">
          <div role="radiogroup" aria-label="Theme" className={GRID}>
            {WALLPAPER_THEMES.map((theme) => (
              <Choice
                key={theme.id}
                label={theme.name}
                checked={appearance.theme === theme.id}
                onSelect={() => setAppearance((current) => withTheme(current, theme.id))}
              >
                <Preview mode={theme.mode} theme="custom" tokens={theme.tokens} />
              </Choice>
            ))}
            {Object.keys(COLOR_THEMES)
              .filter((name) => name !== "tock")
              .map((name) => (
                <Choice
                  key={name}
                  label={titleCase(name)}
                  checked={appearance.theme === name}
                  onSelect={() => setAppearance((current) => withTheme(current, name))}
                >
                  <Preview mode={dark ? "dark" : "light"} theme={name} />
                </Choice>
              ))}
          </div>
        </Card>
      </Section>
    </Page>
  )
}
