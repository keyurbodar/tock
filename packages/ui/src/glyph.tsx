const glyph = (paths: readonly string[], join = true) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {paths.map((d) => (
      <path key={d} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin={join ? "round" : undefined} />
    ))}
  </svg>
)

export const glyphs = {
  minus: glyph(["M7 12H17"], false),
  plus: glyph(["M12 4V12M12 12V20M12 12H4M12 12H20"], false),
  close: glyph(["M5 5L19 19M19 5L5 19"], false),
  reset: glyph([
    "M4.4834 14.6667C5.58163 17.7738 8.54493 20 12.0282 20C16.4465 20 20.0282 16.4183 20.0282 12C20.0282 7.58172 16.4465 4 12.0282 4C8.93224 4 6.99986 5.5 4.99986 8",
    "M5 4V8H9",
  ]),
  copy: glyph([
    "M9 9V5.25C9 4.00736 10.0074 3 11.25 3H18.75C19.9926 3 21 4.00736 21 5.25V12.75C21 13.9926 19.9926 15 18.75 15H15M12.75 9H5.25C4.00736 9 3 10.0074 3 11.25V18.75C3 19.9926 4.00736 21 5.25 21H12.75C13.9926 21 15 19.9926 15 18.75V11.25C15 10.0074 13.9926 9 12.75 9Z",
  ]),
  download: glyph(["M20 15V17C20 18.6569 18.6569 20 17 20H7C5.34315 20 4 18.6569 4 17V15M12 14.5V4M12 14.5L8.5 11M12 14.5L15.5 11"]),
  previous: glyph(["M10 6L4 12L10 18", "M5 12H20"]),
  next: glyph(["M14 6L20 12L14 18", "M19 12H4"]),
} as const
