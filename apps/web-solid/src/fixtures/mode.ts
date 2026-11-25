export function isFixtureMode(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get("fixtures") === "1"
}
