(() => {
  const S = (window.__stream = { frames: 0, shells: 0, order: 0, shrink: 0, drop: 0, notes: [] })
  const note = (text) => S.notes.length < 6 && S.notes.push(text)
  const heights = new WeakMap()
  let lastTexts = []
  let lastScroll = 0
  const step = () => {
    S.frames++
    const col = document.querySelector(".tds-column")
    if (!col) return
    const bubbles = [...col.querySelectorAll(".tds-bubble[data-side='agent']")].filter((b) => !b.closest("[data-side='me']"))
    for (const b of bubbles) {
      const cs = getComputedStyle(b)
      if (cs.visibility === "hidden" || +cs.opacity === 0) continue
      const waiting = [...b.querySelectorAll(".tds-word-wait")].map((w) => w.textContent).join("").replace(/\s/g, "")
      if (waiting && waiting.length === b.textContent.replace(/\s/g, "").length) (S.shells++, note("shell: " + b.textContent.slice(0, 30)))
      const h = b.getBoundingClientRect().height
      const was = heights.get(b)
      if (was !== undefined && h < was - 0.5) (S.shrink++, note("shrink " + Math.round(was) + "→" + Math.round(h) + ": " + b.textContent.slice(0, 30)))
      heights.set(b, h)
    }
    let seenHidden = false
    for (const el of col.querySelectorAll(".tds-bubble[data-side='agent'] *")) {
      if (el.children.length) continue
      if (el.classList.contains("tds-word-wait")) seenHidden = true
      else if (seenHidden && el.classList.contains("tds-word") && el.textContent.trim()) {
        S.order++
        note("order: " + el.textContent)
        break
      }
    }
    const sh = col.scrollHeight
    if (sh < lastScroll - 1) (S.drop++, note("column shrank " + lastScroll + "→" + sh))
    lastScroll = sh
    const texts = bubbles.map((b) => b.textContent.slice(0, 20))
    if (texts.length < lastTexts.length) (S.drop++, note("bubbles " + JSON.stringify(lastTexts) + " → " + JSON.stringify(texts)))
    lastTexts = texts
  }
  const tick = () => {
    try {
      step()
    } catch (e) {
      note("error " + e.message)
    }
    if (!S.stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
