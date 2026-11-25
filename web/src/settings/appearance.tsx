import { withTheme, withWallpaper, type Mode } from "@tock/theme/apply"
import { EFFECTS, WALLPAPER_RANGE, type WallpaperAppearance } from "@tock/theme/effects"
import { WALLPAPER_THEMES } from "@tock/theme/themes"
import { COLOR_THEMES, type Tokens } from "@tock/theme/tokens"
import { Card, Page, Section, SettingsRow } from "@tock/ui/card"
import { MenuSelect } from "@tock/ui/menu-select"
import { Slider } from "@tock/ui/slider"
import { Switch } from "@tock/ui/switch"
import { ModeButton, SplitPreview, SwatchChoice, SWATCH_GRID, ThemePreview } from "@tock/ui/theme-swatch"
import type { CSSProperties } from "react"
import { titleCase } from "../lib/format"
import { setAppearance, useAppearance } from "../state/appearance"

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const LOOK: readonly { key: keyof WallpaperAppearance; label: string; unit: string }[] = [
  { key: "brightness", label: "Brightness", unit: "%" },
  { key: "blur", label: "Blur", unit: "px" },
  { key: "opacity", label: "Image opacity", unit: "%" },
  { key: "fade", label: "Bottom fade", unit: "%" },
  { key: "overlay", label: "Overlay opacity", unit: "%" },
  { key: "inputOpacity", label: "Input opacity", unit: "%" },
]

const EFFECT_OPTIONS = EFFECTS.map((effect) => ({ value: effect, label: titleCase(effect) }))

const tokenStyle = (tokens: Tokens) =>
  Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, value])) as CSSProperties

export function Appearance() {
  const appearance = useAppearance()
  const dark = document.documentElement.classList.contains("dark")
  return (
    <Page title="Appearance">
      <Section>
        <Card>
          <SettingsRow id="theme" title="Mode" fill>
            <div role="group" aria-label="Mode" className="flex min-w-0 gap-4">
              {MODES.map((mode) => (
                <ModeButton
                  key={mode.value}
                  label={mode.label}
                  pressed={appearance.mode === mode.value}
                  onSelect={() => setAppearance((current) => ({ ...current, mode: mode.value }))}
                >
                  {mode.value === "system" ? (
                    <SplitPreview light={<ThemePreview mode="light" theme="tock" />} dark={<ThemePreview mode="dark" theme="tock" />} />
                  ) : (
                    <ThemePreview mode={mode.value} theme="tock" />
                  )}
                </ModeButton>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow title="Match theme to wallpaper" description="Picking a wallpaper also applies its colors">
            <Switch
              aria-label="Match theme to wallpaper"
              checked={appearance.linked}
              onCheckedChange={(linked) => setAppearance((current) => ({ ...current, linked }))}
            />
          </SettingsRow>
        </Card>
      </Section>
      <Section title="Theme">
        <Card className="@container">
          <div role="radiogroup" aria-label="Theme" className={SWATCH_GRID}>
            {WALLPAPER_THEMES.map((theme) => (
              <SwatchChoice
                key={theme.id}
                label={theme.name}
                checked={appearance.theme === theme.id}
                onSelect={() => setAppearance((current) => withTheme(current, theme.id))}
              >
                <ThemePreview mode={theme.mode} theme="custom" style={tokenStyle(theme.tokens)} />
              </SwatchChoice>
            ))}
            {Object.keys(COLOR_THEMES)
              .filter((name) => name !== "tock")
              .map((name) => (
                <SwatchChoice
                  key={name}
                  label={titleCase(name)}
                  checked={appearance.theme === name}
                  onSelect={() => setAppearance((current) => withTheme(current, name))}
                >
                  <ThemePreview mode={dark ? "dark" : "light"} theme={name} />
                </SwatchChoice>
              ))}
          </div>
        </Card>
      </Section>
      <Section title="Background">
        <Card className="@container">
          <div role="radiogroup" aria-label="Wallpaper" className={SWATCH_GRID}>
            <SwatchChoice
              label="None"
              checked={appearance.wallpaper === null}
              onSelect={() => setAppearance((current) => withWallpaper(current, null))}
            >
              <span className="block h-full w-full bg-panel" />
            </SwatchChoice>
            {WALLPAPER_THEMES.filter((theme) => theme.wallpaper !== null).map((theme) => (
              <SwatchChoice
                key={theme.id}
                label={theme.name}
                checked={appearance.wallpaper === theme.id}
                onSelect={() => setAppearance((current) => withWallpaper(current, theme.id))}
              >
                <img alt="" loading="lazy" src={theme.wallpaper ?? undefined} className="absolute inset-0 size-full object-cover" />
              </SwatchChoice>
            ))}
          </div>
          <SettingsRow id="background-effect" title="Background effect">
            <MenuSelect
              className="w-32"
              value={appearance.effect}
              options={EFFECT_OPTIONS}
              onChange={(effect) => setAppearance((current) => ({ ...current, effect }))}
            />
          </SettingsRow>
          {LOOK.map((control) => (
            <SettingsRow key={control.key} title={control.label}>
              <Slider
                label={control.label}
                max={WALLPAPER_RANGE[control.key]}
                value={appearance.look[control.key]}
                valueText={`${appearance.look[control.key]}${control.unit}`}
                onChange={(value) =>
                  setAppearance((current) => ({ ...current, look: { ...current.look, [control.key]: value } }))
                }
              />
            </SettingsRow>
          ))}
        </Card>
      </Section>
    </Page>
  )
}
