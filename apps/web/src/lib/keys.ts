/** A control Space activates natively, so global Space and type-to-focus shortcuts must leave it alone. Sidebar rows are links that Space peeks, so they are not counted. */
export const pressable = (el: EventTarget | Element | null) =>
  el instanceof Element && el.closest("button, a[href]:not(.tds-row), summary, select, [role=button], [role=menuitem], [role=option], [role=tab], [role=checkbox], [role=switch], [role=link]") !== null
