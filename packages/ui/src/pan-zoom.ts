import { motion } from "@tock/theme/motion"
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

const { zoom: Z } = motion

export interface Point {
  readonly x: number
  readonly y: number
}

export interface TouchGestures {
  readonly key: string
  readonly onSwipe: (direction: 1 | -1) => void
  readonly onTap: (x: number, y: number, double: boolean) => void
}

interface Touch {
  x: number
  y: number
  readonly startX: number
  readonly startY: number
  readonly time: number
}

const ORIGIN: Point = { x: 0, y: 0 }

export const clampZoom = (value: number, max: number = Z.max, min: number = Z.min) => Math.min(max, Math.max(min, value))

export function usePanZoom(limit: number = Z.max, touch?: TouchGestures, minZoom: number = Z.min) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [view, setView] = useState<{ readonly zoom: number; readonly pan: Point }>({ zoom: 1, pan: ORIGIN })
  const { zoom, pan } = view
  const [nativeZoom, setNativeZoom] = useState<number>()
  const maxZoom = Math.max(limit, (nativeZoom ?? 1) * 2)
  const [panning, setPanning] = useState(false)
  const dragging = useRef(false)
  const dragged = useRef(false)
  const drag = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 })
  const touches = useRef(new Map<number, Touch>())
  const gesture = useRef({ zoom: 1, startZoom: 1, distance: 0, pan: ORIGIN, pinched: false, moved: false, swipe: false })
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null)

  const setZoom = (next: number | ((zoom: number) => number)) =>
    setView((current) => ({ ...current, zoom: typeof next === "function" ? next(current.zoom) : next }))
  const setPan = (next: Point | ((pan: Point) => Point)) =>
    setView((current) => ({ ...current, pan: typeof next === "function" ? next(current.pan) : next }))

  useLayoutEffect(() => {
    setView((current) => ({ ...current, zoom: clampZoom(current.zoom, maxZoom, minZoom) }))
  }, [maxZoom, minZoom])

  const measurePinch = () => {
    const [first, second] = [...touches.current.values()]
    gesture.current.startZoom = gesture.current.zoom
    gesture.current.distance = first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0
  }

  useLayoutEffect(() => {
    touches.current.clear()
    lastTap.current = null
    setPanning(false)
  }, [touch?.key])

  const toggleZoom = (x: number, y: number) => {
    const next = zoom > 1 ? 1 : clampZoom(2, maxZoom, minZoom)
    const rect = stage?.getBoundingClientRect()
    setZoom(next)
    setPan(
      next === 1 || !rect
        ? ORIGIN
        : { x: -(x - rect.left - rect.width / 2) * (next / zoom - 1), y: -(y - rect.top - rect.height / 2) * (next / zoom - 1) },
    )
  }

  useEffect(() => {
    if (!stage) return
    const measure = () => {
      const image = stage.querySelector("img")
      setNativeZoom(image && image.naturalWidth > 0 && image.offsetWidth > 0 ? image.naturalWidth / image.offsetWidth : undefined)
    }
    const observer = new ResizeObserver(measure)
    const track = () => {
      measure()
      const image = stage.querySelector("img")
      if (image) observer.observe(image)
    }
    track()
    stage.addEventListener("load", track, true)
    return () => {
      observer.disconnect()
      stage.removeEventListener("load", track, true)
    }
  }, [stage, touch?.key])

  useEffect(() => {
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return
      const unit = event.deltaMode === 1 ? Z.wheel.line : event.deltaMode === 2 ? stage.clientHeight : 1
      const delta = event.deltaY * unit * (event.ctrlKey ? Z.wheel.pinch : Z.wheel.scroll)
      const factor = Math.exp(-Math.max(-Z.wheel.clamp, Math.min(Z.wheel.clamp, delta)))
      const rect = stage.getBoundingClientRect()
      const x = event.clientX - rect.left - rect.width / 2
      const y = event.clientY - rect.top - rect.height / 2
      setView((current) => {
        const next = clampZoom(current.zoom * factor, maxZoom, minZoom)
        const ratio = next / current.zoom
        return {
          zoom: next,
          pan: next === minZoom ? ORIGIN : { x: x - (x - current.pan.x) * ratio, y: y - (y - current.pan.y) * ratio },
        }
      })
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [stage, maxZoom, minZoom])

  const onKeyDown = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault()
      setView((current) => {
        const next = clampZoom(current.zoom * (event.key === "-" ? 1 / Z.step : Z.step), maxZoom, minZoom)
        const ratio = next / current.zoom
        return { zoom: next, pan: next === minZoom ? ORIGIN : { x: current.pan.x * ratio, y: current.pan.y * ratio } }
      })
    } else if (event.key === "0" || event.key === "1" || event.key === "2") {
      event.preventDefault()
      setView({ zoom: event.key === "0" ? 1 : clampZoom(Number(event.key) * (nativeZoom ?? 1), maxZoom, minZoom), pan: ORIGIN })
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (touch && event.pointerType === "touch") {
      if (touches.current.size === 0) {
        gesture.current = { zoom, startZoom: zoom, distance: 0, pan, pinched: false, moved: false, swipe: zoom <= 1 && pan.x === 0 && pan.y === 0 }
      }
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        time: event.timeStamp,
      })
      if (touches.current.size > 1) {
        gesture.current.pinched = true
        lastTap.current = null
      }
      measurePinch()
    } else {
      drag.current = { pointerX: event.clientX, pointerY: event.clientY, panX: pan.x, panY: pan.y }
      dragging.current = true
      dragged.current = false
    }
    setPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (touch && event.pointerType === "touch") {
      const point = touches.current.get(event.pointerId)
      if (!point) return
      const before = [...touches.current.values()].slice(0, 2).map(({ x, y }) => ({ x, y }))
      const dx = event.clientX - point.x
      const dy = event.clientY - point.y
      point.x = event.clientX
      point.y = event.clientY
      const state = gesture.current
      const previous = state.pan
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > Z.tap.slop) {
        state.moved = true
        lastTap.current = null
      }
      const [first, second] = [...touches.current.values()]
      if (first && second && before[0] && before[1]) {
        if (state.distance === 0) return measurePinch()
        const next = clampZoom((state.startZoom * Math.hypot(second.x - first.x, second.y - first.y)) / state.distance, maxZoom, minZoom)
        const ratio = next / state.zoom
        const rect = event.currentTarget.getBoundingClientRect()
        const midX = (before[0].x + before[1].x) / 2
        const midY = (before[0].y + before[1].y) / 2
        state.pan = {
          x: ratio * state.pan.x + (1 - ratio) * (midX - rect.left - rect.width / 2) + (first.x + second.x) / 2 - midX,
          y: ratio * state.pan.y + (1 - ratio) * (midY - rect.top - rect.height / 2) + (first.y + second.y) / 2 - midY,
        }
        state.zoom = next
        setZoom(next)
      } else if (state.zoom > 1 || state.pan.x !== 0 || state.pan.y !== 0) {
        state.pan = { x: state.pan.x + dx, y: state.pan.y + dy }
      }
      if (state.pan.x !== previous.x || state.pan.y !== previous.y) setPan(state.pan)
      return
    }
    if (!dragging.current) return
    const start = drag.current
    const dx = event.clientX - start.pointerX
    const dy = event.clientY - start.pointerY
    if (Math.abs(dx) > Z.drag || Math.abs(dy) > Z.drag) dragged.current = true
    setPan({ x: start.panX + dx, y: start.panY + dy })
  }

  const release = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!(touch && event.pointerType === "touch")) {
      dragging.current = false
      setPanning(false)
      return release(event)
    }
    const point = touches.current.get(event.pointerId)
    if (!point) return
    touches.current.delete(event.pointerId)
    release(event)
    if (event.type !== "pointerup") {
      touches.current.clear()
      lastTap.current = null
      return setPanning(false)
    }
    if (touches.current.size > 0) return measurePinch()
    setPanning(false)
    const state = gesture.current
    if (state.pinched) return
    const dx = event.clientX - point.startX
    const dy = event.clientY - point.startY
    const far = Math.abs(dx) >= Z.swipe.far
    const fast = Math.abs(dx) >= Z.swipe.near && Math.abs(dx) / Math.max(1, event.timeStamp - point.time) >= Z.swipe.speed
    if (state.swipe && Math.abs(dx) >= Z.swipe.ratio * Math.abs(dy) && (far || fast)) {
      lastTap.current = null
      touch.onSwipe(dx < 0 ? 1 : -1)
    } else if (!state.moved && Math.hypot(dx, dy) <= Z.tap.slop) {
      const last = lastTap.current
      const double =
        last !== null && event.timeStamp - last.time <= Z.tap.double && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= Z.tap.radius
      lastTap.current = double ? null : { x: event.clientX, y: event.clientY, time: event.timeStamp }
      touch.onTap(event.clientX, event.clientY, double)
    }
  }

  return {
    stage,
    setStage,
    zoom,
    setZoom,
    maxZoom,
    minZoom,
    nativeZoom,
    pan,
    setPan,
    toggleZoom,
    panning,
    dragged: () => dragged.current,
    setDragged: (value: boolean) => {
      dragged.current = value
    },
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  }
}

export type PanZoom = ReturnType<typeof usePanZoom>
