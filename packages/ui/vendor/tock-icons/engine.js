/* eslint-disable */
// Tock icons 1.1 engine, vendored unchanged apart from this header and the export below. Phosphor Icons fork (MIT).
/*! Tock icons 1.1. 1,513 icons forked from Phosphor (MIT), recoloured, layered and animated for Tock.
 *
 *   TockIcons.svg(name, options)          an SVG string
 *   <tock-icon name="heart"></tock-icon>    the same, as an element (attributes = options)
 *   <tock-icon name="heart" interactive>    moves on hover, fills when clicked
 *   TockIcons.play(el, 'hover' | 'press' | 'select' | 'deselect')
 *   TockIcons.configure(config)           defaults, palette, styles, colour picks and motion
 *
 * Options: variant ('duet' | 'line' | 'glass'), size (px), weight ('thin' | 'light' | 'regular' | 'bold'),
 *          color ('auto' | palette key | hex), mirrored, label, motion (a preset name, overrides the icon's pick)
 *
 * Element attributes on top of the options:
 *   interactive            hover plays the icon's motion; click selects it
 *   interactive="toggle"   a second click deselects
 *   selected               the selected state (duet fills in; glass parts its layers and glows)
 *   group="nav"            selecting one icon deselects the others in the same group
 * The element listens on its closest button, link or [data-tock-target], so hovering the whole row counts.
 */
var TockIcons = (function () {
  var D = (typeof window !== 'undefined' && window.TOCK_ICON_DATA) || {};
  var C = {
    defaults: { variant: 'duet', size: 24, weight: 'thin', color: 'auto', mirrored: false },
    palette: {
      neutral: { base: '#ECE9E4', glass: '#8E8E93' },
      rose: { base: '#E58AAE', glass: '#E0558F' },
      plum: { base: '#C27BB0', glass: '#B04C98' },
      lilac: { base: '#A995DE', glass: '#7C5CE0' },
      sky: { base: '#86ADD8', glass: '#3E86D6' },
      slate: { base: '#8E9FBA', glass: '#5E78A6' },
      teal: { base: '#67B3AA', glass: '#1F9E92' },
      moss: { base: '#86B47C', glass: '#4FA34A' },
      sage: { base: '#9CB58F', glass: '#6E9A62' },
      sand: { base: '#D6BE92', glass: '#C9A66B' },
      ochre: { base: '#E2A84F', glass: '#E39A2B' },
      bronze: { base: '#C98F5A', glass: '#B7773A' },
      clay: { base: '#D9785C', glass: '#D8613E' },
      coral: { base: '#E8806A', glass: '#E86A4F' }
    },
    styles: {
      duet: { line: { toward: '#D8D4CF', keep: .42 }, fill: { toward: '#050505', keep: .42 }, neutral: { line: '#ECE9E4', fill: .17 } },
      line: { line: { toward: '#D8D4CF', keep: .42 }, neutral: { line: '#ECE9E4' } },
      glass: { blur: 10, rim: 7, shadow: .35, frost: .26 }
    },
    icons: {},
    // Motion. Units: x and y in icon units (the icon is 256 wide), r in degrees, s/sx/sy as scale, o as opacity.
    motion: {
      enabled: true,
      speed: 1,        // 2 is twice as fast
      intensity: 1,    // scales distance, turn and stretch of every preset
      press: { dur: 340, ease: 'cubic-bezier(.3,0,.2,1)', k: [{}, { s: .84 }, { s: 1.07 }, {}] },
      fill: { in: 380, out: 200, ease: 'cubic-bezier(.34,1.5,.5,1)' },   // duet: the region floods in on select
      glass: { part: 16, lift: 8, glow: .7, shine: 620, ease: 'cubic-bezier(.2,.8,.2,1)', clap: 420 },
      // origin: where it turns from. dur in ms. k: keyframes, evenly spaced, from rest back to rest.
      presets: {
        pop:      { origin: '50% 50%', dur: 340, k: [{}, { s: 1.1 }, {}] },
        beat:     { origin: '50% 55%', dur: 520, k: [{}, { s: 1.14 }, {}, { s: 1.08 }, {}] },
        swing:    { origin: '50% 6%', dur: 620, k: [{}, { r: 16 }, { r: -12 }, { r: 7 }, { r: -3 }, {}] },
        ring:     { origin: '50% 12%', dur: 480, k: [{}, { r: 11 }, { r: -11 }, { r: 9 }, { r: -7 }, { r: 4 }, {}] },
        spin:     { origin: '50% 50%', dur: 620, ease: 'cubic-bezier(.5,0,.2,1)', k: [{}, { r: 180 }] , end: { r: 0 } },
        'spin-ccw': { origin: '50% 50%', dur: 620, ease: 'cubic-bezier(.5,0,.2,1)', k: [{}, { r: -180 }], end: { r: 0 } },
        turn:     { origin: '50% 50%', dur: 480, k: [{}, { r: 30 }, { r: -6 }, {}] },
        'nudge-r':  { dur: 380, k: [{}, { x: 22 }, { x: -4 }, {}] },
        'nudge-l':  { dur: 380, k: [{}, { x: -22 }, { x: 4 }, {}] },
        'nudge-u':  { dur: 380, k: [{}, { y: -22 }, { y: 4 }, {}] },
        'nudge-d':  { dur: 380, k: [{}, { y: 22 }, { y: -4 }, {}] },
        'nudge-ur': { dur: 380, k: [{}, { x: 16, y: -16 }, { x: -3, y: 3 }, {}] },
        'nudge-ul': { dur: 380, k: [{}, { x: -16, y: -16 }, { x: 3, y: 3 }, {}] },
        'nudge-dr': { dur: 380, k: [{}, { x: 16, y: 16 }, { x: -3, y: -3 }, {}] },
        'nudge-dl': { dur: 380, k: [{}, { x: -16, y: 16 }, { x: 3, y: -3 }, {}] },
        send:     { origin: '50% 50%', dur: 560, k: [{}, { x: 70, y: -70, o: 0, s: .7 }, { x: -50, y: 50, o: 0, s: .7 }, { x: -6, y: 6 }, {}] },
        launch:   { origin: '50% 50%', dur: 560, k: [{}, { x: 4, y: 6 }, { x: 40, y: -60, o: 0 }, { x: -30, y: 46, o: 0 }, {}] },
        bounce:   { origin: '50% 100%', dur: 460, k: [{}, { y: -26, sy: 1.04, sx: .97 }, { sy: .9, sx: 1.06 }, { y: -6 }, {}] },
        lift:     { origin: '50% 100%', dur: 420, k: [{}, { y: -18, s: 1.04 }, { y: 2 }, {}] },
        float:    { origin: '50% 50%', dur: 640, k: [{}, { x: 8, y: -12 }, { x: -6, y: -4 }, {}] },
        tilt:     { origin: '25% 80%', dur: 440, k: [{}, { r: -14 }, { r: 4 }, {}] },
        scribble: { origin: '20% 85%', dur: 520, k: [{}, { r: -10, x: -6 }, { r: 6, x: 8 }, { r: -4, x: -4 }, {}] },
        wiggle:   { origin: '50% 90%', dur: 460, k: [{}, { r: -8 }, { r: 7 }, { r: -4 }, {}] },
        wave:     { origin: '70% 90%', dur: 640, k: [{}, { r: 16 }, { r: -10 }, { r: 14 }, { r: -4 }, {}] },
        twinkle:  { origin: '50% 50%', dur: 520, k: [{}, { s: 1.18, r: 20 }, { s: .94, r: -6 }, {}] },
        blink:    { origin: '50% 50%', dur: 300, k: [{}, { sy: .12 }, {}] },
        grow:     { origin: '50% 100%', dur: 480, k: [{}, { sy: 1.14, sx: .95 }, { sy: .97 }, {}] },
        tick:     { origin: '50% 50%', dur: 520, k: [{}, { r: 10 }, { r: -8 }, { r: 4 }, {}] },
        flip:     { origin: '50% 50%', dur: 560, k: [{}, { sx: -1 }, {}] },
        hourglass:{ origin: '50% 50%', dur: 620, ease: 'cubic-bezier(.6,0,.2,1)', k: [{}, { r: 180 }], end: { r: 0 } },
        shake:    { origin: '50% 50%', dur: 420, k: [{}, { x: -12 }, { x: 11 }, { x: -7 }, { x: 4 }, {}] },
        squash:   { origin: '50% 100%', dur: 420, k: [{}, { sx: 1.12, sy: .86 }, { sx: .95, sy: 1.07 }, {}] },
        pulse:    { origin: '50% 70%', dur: 520, k: [{}, { s: 1.08, o: .65 }, {}, { s: 1.04, o: .8 }, {}] },
        drip:     { origin: '50% 100%', dur: 480, k: [{}, { y: 12, sy: .88, sx: 1.08 }, { y: -8, sy: 1.06 }, {}] },
        search:   { origin: '50% 50%', dur: 560, k: [{}, { x: -12, y: -10 }, { x: 12, y: -6 }, { x: -4, y: 4 }, {}] },
        shrink:   { origin: '50% 50%', dur: 360, k: [{}, { s: .86 }, { s: 1.04 }, {}] },
        expand:   { origin: '50% 50%', dur: 360, k: [{}, { s: 1.14 }, { s: .98 }, {}] }
      },
      icons: {} // per-icon motion picks, e.g. { bell: 'swing' }; beats the built-in pick
    }
  };
  var uid = 0, pre = 't' + Math.random().toString(36).slice(2, 6);
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { var x = hex(a), y = hex(b); return '#' + x.map(function (v, i) { return ('0' + Math.round(v * t + y[i] * (1 - t)).toString(16)).slice(-2); }).join(''); }
  function paths(ds, attrs) { return ds.map(function (d) { return '<path d="' + d + '"' + (attrs || '') + '/>'; }).join(''); }
  function merge(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; }
  function pick(n) { return C.icons[n] || (D[n] && D[n].k) || 'neutral'; }
  function motionOf(n) { return C.motion.icons[n] || (D[n] && D[n].a) || 'pop'; }
  function colour(n, c) {
    if (!c || c === 'auto') c = pick(n);
    if (c.charAt(0) === '#') return { key: 'custom', base: c, glass: c };
    var p = C.palette[c] || C.palette.neutral; return { key: c, base: p.base, glass: p.glass };
  }
  function open(n, z, vb, o, v) {
    return '<svg class="tock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + z + '" height="' + z + '"' +
      (o.label ? ' role="img" aria-label="' + o.label + '"' : ' aria-hidden="true"') + (o.mirrored ? ' style="transform:scaleX(-1)"' : '') + ' data-icon="' + n + '" data-variant="' + v + '">';
  }
  // Duet and line share one structure, so an icon can morph between them:
  //   .ti-p (press) > .ti-m (the icon's motion) > .ti-f (the filled region) + .ti-l (the line)
  function duet(n, d, o, col, withFill) {
    var S = C.styles.duet, neutral = col.key === 'neutral';
    var line = neutral ? S.neutral.line : mix(col.base, S.line.toward, S.line.keep);
    var fill = neutral ? mix(S.neutral.line, '#050505', S.neutral.fill) : mix(col.base, S.fill.toward, d.fk || S.fill.keep);
    var w = d.w[o.weight] || d.w.thin;
    return open(n, o.size, '0 0 256 256', o, withFill ? 'duet' : 'line') + '<g class="ti-p"><g class="ti-m">' +
      (d.u.length ? '<g class="ti-f"' + (withFill ? '' : ' style="opacity:0"') + ' fill="' + fill + '">' + paths(d.u) + '</g>' : '') +
      (d.x ? '<g class="ti-l" fill="none" stroke="' + line + '" stroke-linejoin="round">' + d.x[o.weight] + '</g>' : '<g class="ti-l" fill="' + line + '">' + paths(w) + '</g>') + '</g></g></svg>';
  }
  // Glass groups, picked per icon when the library is built:
  //  accent    the whole shape solid behind; the body frosted in front, so knobs, tabs and clappers stay solid
  //  inverted  the body frosted; the marked band (a calendar header) solid on top
  //  single    simple shapes: a solid copy up and to the left, the frosted copy in front
  //  lit       glyphs (arrows, text tools, signs): one solid shape with a sheen, from Phosphor Bold
  //  hand-tuned icons carry their own split in d.o: s solid behind, f frosted, t solid on top
  // Structure, so the layers can move apart:
  //   .ti-p (press) > .tg-glow + .tg-back (solid layer) + .tg-fw (front, parts on hover) > .ti-m (motion) > frost, rim, top, .tg-shine
  function glass(n, d, o, col) {
    var S = C.styles.glass, c = col.glass, k = pre + (++uid), m = d.m, f = d.f === 'bold' ? d.w.bold : d.f;
    var dark = mix(c, '#000000', .62), light = mix(c, '#ffffff', S.frost);
    var defs = '<defs>' +
      '<linearGradient id="' + k + 's" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="236"><stop offset="0" stop-color="' + mix(c, '#ffffff', .82) + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient>' +
      '<linearGradient id="' + k + 'f" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="236"><stop offset="0" stop-color="#ffffff" stop-opacity=".92"/><stop offset=".5" stop-color="' + light + '" stop-opacity=".82"/><stop offset="1" stop-color="' + mix(c, '#ffffff', .42) + '" stop-opacity=".8"/></linearGradient>' +
      '<linearGradient id="' + k + 'r" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="236"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".25"/><stop offset="1" stop-color="#ffffff" stop-opacity=".1"/></linearGradient>' +
      '<linearGradient id="' + k + 'h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="' + k + 'g"><stop offset="0" stop-color="' + c + '" stop-opacity=".9"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + k + 'b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + S.blur + '"/></filter>' +
      '<filter id="' + k + 'd" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="' + mix(c, '#000000', .3) + '" flood-opacity="' + S.shadow + '"/></filter>';
    var solid = function (ds, tf) { return '<g fill="url(#' + k + 's)"' + (tf ? ' transform="' + tf + '"' : '') + '>' + paths(ds) + '</g>'; };
    var shine = '<g class="tg-shine" clip-path="url(#' + k + 'c)" style="opacity:0"><rect x="-60" y="-40" width="110" height="340" fill="url(#' + k + 'h)" transform="rotate(20 128 128)"/></g>';
    var back = '', front;
    function frost(ds, behind, grow, tf) {
      var t = tf ? ' transform="' + tf + '"' : '';
      defs += '<mask id="' + k + 'm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="296" height="296"><g fill="#fff"' + t + (grow ? ' stroke="#fff" stroke-width="' + grow + '" stroke-linejoin="round"' : '') + '>' + paths(ds) + '</g></mask>' +
        '<clipPath id="' + k + 'c"><g' + t + '>' + paths(ds) + '</g></clipPath>';
      back = behind;
      return '<g mask="url(#' + k + 'm)">' + (behind ? '<g filter="url(#' + k + 'b)">' + behind + '</g>' : '') + '<rect x="-20" y="-20" width="296" height="296" fill="url(#' + k + 'f)"/></g>' +
        '<g clip-path="url(#' + k + 'c)"><g' + t + ' fill="none" stroke="url(#' + k + 'r)" stroke-width="' + S.rim + '">' + paths(ds) + '</g></g>';
    }
    if (d.o) front = frost(d.o.f, solid(d.o.s, d.o.st), 0, d.o.ft) + (d.o.t ? solid(d.o.t) : '');
    else if (m === 'accent') front = frost(d.u, solid(f), 20);
    else if (m === 'inverted') front = frost(f, '', 0) + solid(d.u);
    else if (m === 'lit') { defs += '<clipPath id="' + k + 'c">' + paths(f) + '</clipPath>'; front = solid(f) + '<g fill="url(#' + k + 'r)" opacity=".35">' + paths(f) + '</g>'; }
    else front = frost(f, solid(f, 'translate(-14 -14)'), 0, 'translate(8 8) scale(.94)');
    return open(n, o.size, '-20 -20 296 296', o, 'glass') + defs + '</defs><g class="ti-p" filter="url(#' + k + 'd)">' +
      '<ellipse class="tg-glow" cx="128" cy="150" rx="140" ry="124" fill="url(#' + k + 'g)" style="opacity:0"/>' +
      '<g class="tg-back">' + back + '</g><g class="tg-fw"><g class="ti-m">' + front + shine + '</g></g></g></svg>';
  }
  function svg(n, opts) {
    var d = D[n]; if (!d) return '';
    var o = merge(merge({}, C.defaults), opts || {}); if (o.style && !(opts || {}).variant) o.variant = o.style;
    var col = colour(n, o.color);
    if (o.variant === 'glass') return glass(n, d, o, col);
    return duet(n, d, o, col, o.variant !== 'line');
  }

  // ---- motion ----
  var reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)');
  function tf(f, I) {
    var x = (f.x || 0) * I, y = (f.y || 0) * I, r = (f.r || 0) * (Math.abs(f.r || 0) >= 90 ? 1 : I);
    var s = 1 + ((f.s || 1) - 1) * I, sx = f.sx === -1 ? -1 : 1 + ((f.sx || 1) - 1) * I, sy = 1 + ((f.sy || 1) - 1) * I;
    return 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg) scale(' + s * sx + ',' + s * sy + ')';
  }
  function run(el, spec, extra) {
    if (!el || !el.animate) return null;
    var M = C.motion, I = M.intensity * ((extra && extra.boost) || 1);
    el.style.transformBox = 'fill-box'; el.style.transformOrigin = spec.origin || '50% 50%';
    var frames = spec.k.map(function (f) { var o = { transform: tf(f, I) }; if (f.o != null) o.opacity = f.o; else o.opacity = 1; return o; });
    var a = el.animate(frames, { duration: (spec.dur || 400) / M.speed, easing: spec.ease || 'cubic-bezier(.3,.7,.3,1)' });
    if (spec.end) a.onfinish = function () { el.style.transform = ''; };
    return a;
  }
  function parts(root) { var s = root.querySelector ? root.querySelector('svg.tock-icon') || root : root; return { svg: s, p: s.querySelector('.ti-p'), m: s.querySelector('.ti-m'), f: s.querySelector('.ti-f'), back: s.querySelector('.tg-back'), fw: s.querySelector('.tg-fw'), glow: s.querySelector('.tg-glow'), shine: s.querySelector('.tg-shine'), glass: s.getAttribute && s.getAttribute('data-variant') === 'glass' }; }
  function shineSweep(P) {
    if (!P.shine || !P.shine.animate) return;
    var r = P.shine.firstChild, M = C.motion.glass;
    P.shine.style.opacity = 1;
    r.animate([{ transform: 'translateX(-60px)' }, { transform: 'translateX(330px)' }], { duration: M.shine / C.motion.speed, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = function () { P.shine.style.opacity = 0; };
  }
  function play(el, kind, name) {
    var M = C.motion; if (!M.enabled) return;
    var P = parts(el); if (!P.svg || !P.m) return;
    name = name || (el.getAttribute && el.getAttribute('motion')) || motionOf(P.svg.getAttribute('data-icon'));
    var spec = M.presets[name] || M.presets.pop, still = reduce && reduce.matches;
    if (kind === 'hover') {
      if (!still) run(P.m, spec);
      if (P.glass) shineSweep(P);
    } else if (kind === 'press') {
      if (!still) { run(P.p, { origin: '50% 50%', dur: M.press.dur, ease: M.press.ease, k: M.press.k }); run(P.m, spec, { boost: 1.25 }); }
      if (P.glass && P.back && !still) {
        var G = M.glass;
        // the layers clap: the solid layer snaps in under the front, then springs back out past rest
        P.back.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(' + G.part * .5 + 'px,' + G.part * .5 + 'px)' }, { transform: 'translate(' + -G.part * 1.3 + 'px,' + -G.part * 1.3 + 'px)' }, { transform: 'translate(0,0)' }], { duration: G.clap / M.speed, easing: 'cubic-bezier(.3,0,.2,1)', composite: 'add' });
        shineSweep(P);
      }
    } else if (kind === 'select') {
      if (P.glass) { if (P.glow && P.glow.animate && !still) P.glow.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: M.glass.glow * 1.5, transform: 'scale(1.1)' }, { opacity: M.glass.glow, transform: 'scale(1)' }], { duration: 520 / M.speed, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      else if (P.f) {
        P.f.style.transformBox = 'fill-box'; P.f.style.transformOrigin = '50% 50%'; P.f.style.opacity = 1;
        if (!still) P.f.animate([{ opacity: 0, transform: 'scale(.45)' }, { opacity: 1, transform: 'scale(1.08)', offset: .6 }, { opacity: 1, transform: 'scale(1)' }], { duration: M.fill.in / M.speed, easing: M.fill.ease });
      }
    } else if (kind === 'deselect') {
      if (P.f && !P.glass) { var a = P.f.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)' }], { duration: M.fill.out / M.speed, easing: 'cubic-bezier(.4,0,1,1)' }); P.f.style.opacity = 0; }
    }
  }
  // Glass rests, parts on hover, and stays parted and lit while selected. These are steady states, so CSS carries them.
  var CSS = 'tock-icon{display:inline-flex;vertical-align:middle;-webkit-tap-highlight-color:transparent}' +
    'tock-icon[interactive]{cursor:pointer}' +
    'tock-icon .tock-icon{overflow:visible;display:block}' +
    'tock-icon .tg-back,tock-icon .tg-fw{transition:transform var(--tg-t,280ms) var(--tg-e,cubic-bezier(.2,.8,.2,1))}' +
    'tock-icon .tg-glow{transition:opacity 320ms ease;transform-box:fill-box;transform-origin:50% 50%}' +
    'tock-icon[data-h] .tg-back{transform:translate(calc(var(--tg-part,9px) * -1),calc(var(--tg-part,9px) * -1))}' +
    'tock-icon[data-h] .tg-fw{transform:translate(calc(var(--tg-lift,5px) * .4),calc(var(--tg-lift,5px) * -1))}' +
    'tock-icon[selected] .tg-back{transform:translate(calc(var(--tg-part,9px) * -.8),calc(var(--tg-part,9px) * -.8))}' +
    'tock-icon[selected] .tg-glow{opacity:var(--tg-glow,.55)!important}' +
    '@media (prefers-reduced-motion:reduce){tock-icon .tg-back,tock-icon .tg-fw{transition:none}}';
  function injectCSS() { if (typeof document === 'undefined' || document.getElementById('tock-icons-css')) return; var s = document.createElement('style'); s.id = 'tock-icons-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  if (typeof window !== 'undefined' && window.customElements && !customElements.get('tock-icon')) {
    customElements.define('tock-icon', class extends HTMLElement {
      static get observedAttributes() { return ['name', 'variant', 'size', 'weight', 'color', 'mirrored', 'label', 'selected']; }
      connectedCallback() { injectCSS(); this.render(); this.wire(); }
      disconnectedCallback() { if (this._off) this._off(); }
      attributeChangedCallback(k, a, b) {
        if (!this.isConnected || this._quiet) return;
        if (k === 'selected') { var on = b !== null; this.sync(); play(this, on ? 'select' : 'deselect'); return; }
        this.render();
      }
      sync() { var G = C.motion.glass; this.style.setProperty('--tg-part', G.part + 'px'); this.style.setProperty('--tg-lift', G.lift + 'px'); this.style.setProperty('--tg-glow', G.glow); var f = this.querySelector('.ti-f'); if (f && this.hasAttribute('interactive')) f.style.opacity = this.hasAttribute('selected') ? 1 : 0; }
      render() {
        var o = {}, a = this;
        ['variant', 'weight', 'color', 'label'].forEach(function (k) { if (a.hasAttribute(k)) o[k] = a.getAttribute(k); });
        if (a.hasAttribute('size')) o.size = +a.getAttribute('size');
        if (a.hasAttribute('mirrored')) o.mirrored = true;
        // an interactive duet icon rests as line and fills in when selected
        this.innerHTML = svg(a.getAttribute('name'), o); this.sync();
      }
      wire() {
        var self = this; if (this._off || !this.hasAttribute('interactive')) return;
        var t = this.closest('button,a,[role=button],[data-tock-target]') || this;
        function enter() { self.setAttribute('data-h', ''); play(self, 'hover'); }
        function leave() { self.removeAttribute('data-h'); }
        function down() { play(self, 'press'); }
        function click() {
          var tog = self.getAttribute('interactive') === 'toggle', on = self.hasAttribute('selected');
          if (on && !tog) return;
          var g = self.getAttribute('group');
          if (!on && g) document.querySelectorAll('tock-icon[group="' + g + '"][selected]').forEach(function (x) { if (x !== self) x.removeAttribute('selected'); });
          if (on) self.removeAttribute('selected'); else self.setAttribute('selected', '');
          self.dispatchEvent(new CustomEvent('tock-select', { bubbles: true, detail: { name: self.getAttribute('name'), selected: !on } }));
        }
        t.addEventListener('pointerenter', enter); t.addEventListener('pointerleave', leave); t.addEventListener('pointerdown', down); t.addEventListener('click', click);
        this._off = function () { t.removeEventListener('pointerenter', enter); t.removeEventListener('pointerleave', leave); t.removeEventListener('pointerdown', down); t.removeEventListener('click', click); self._off = null; };
      }
    });
  }
  return {
    svg: svg,
    play: play,
    configure: function (c) { merge(C, c || {}); return C; },
    config: C,
    colorOf: pick,
    motionOf: motionOf,
    names: function () { return Object.keys(D); },
    data: D
  };
})();
if (typeof module !== 'undefined') module.exports = TockIcons;

export default TockIcons;
