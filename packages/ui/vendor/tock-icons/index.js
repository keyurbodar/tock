/* eslint-disable */
// The Tock icons config as shipped (tock-icons.config.js), with weight defaulting to light: only light is vendored.
import "./data.js";
import TockIcons from "./engine.js";
TockIcons.configure({
  // What an icon gets when you pass nothing
  defaults: { variant: 'duet', size: 24, weight: 'light', color: 'auto', mirrored: false },

  // The palette. base drives duet and line, glass is the brighter tone glass needs.
  palette: {
    neutral: { base: '#ECE9E4', glass: '#8E8E93' },
    rose:    { base: '#E58AAE', glass: '#E0558F' },
    plum:    { base: '#C27BB0', glass: '#B04C98' },
    lilac:   { base: '#A995DE', glass: '#7C5CE0' },
    sky:     { base: '#86ADD8', glass: '#3E86D6' },
    slate:   { base: '#8E9FBA', glass: '#5E78A6' },
    teal:    { base: '#67B3AA', glass: '#1F9E92' },
    moss:    { base: '#86B47C', glass: '#4FA34A' },
    sage:    { base: '#9CB58F', glass: '#6E9A62' },
    sand:    { base: '#D6BE92', glass: '#C9A66B' },
    ochre:   { base: '#E2A84F', glass: '#E39A2B' },
    bronze:  { base: '#C98F5A', glass: '#B7773A' },
    clay:    { base: '#D9785C', glass: '#D8613E' },
    coral:   { base: '#E8806A', glass: '#E86A4F' }
  },

  // How each variant mixes its colours
  styles: {
    duet:  { line: { toward: '#D8D4CF', keep: 0.42 }, fill: { toward: '#050505', keep: 0.42 }, neutral: { line: '#ECE9E4', fill: 0.17 } },
    line:  { line: { toward: '#D8D4CF', keep: 0.42 }, neutral: { line: '#ECE9E4' } },
    glass: { blur: 10, rim: 7, shadow: 0.35, frost: 0.26 }
  },

  // Re-pick any icon's colour. Every icon's built-in pick is in tock-icons.picks.json.
  icons: {
    // 'chat-circle': 'rose'
  },

  // Motion. Every icon has a built-in motion pick (also in tock-icons.picks.json).
  motion: {
    enabled: true,
    speed: 1,       // 2 is twice as fast
    intensity: 1,   // scales how far, how much and how hard every preset moves
    press: { dur: 340 },                       // the squeeze on click, both variants
    fill:  { in: 380, out: 200 },              // duet: the region floods in on select, drains on deselect
    glass: { part: 16, lift: 8, glow: 0.7, shine: 620, clap: 420 },  // glass: how far the layers part, the glow, the sweep
    // Retune a preset, or add your own: { origin, dur, ease, k: [keyframes] } with x, y, r, s, sx, sy, o
    presets: {
      // ring: { origin: '50% 12%', dur: 480, k: [{}, { r: 11 }, { r: -11 }, { r: 9 }, { r: -7 }, { r: 4 }, {}] }
    },
    // Re-pick any icon's motion
    icons: {
      // 'chat-circle': 'bounce'
    }
  }
});
export default TockIcons;
