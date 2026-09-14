var show_sidebar_aside = document.getElementById('show-sidebar-col')
var sidebar = document.getElementsByClassName('td-sidebar')[0]
var show_toolbar_aside = document.getElementById('show-toolbar-col')
var toolbar = document.getElementsByClassName('td-sidebar-toc')[0]
var content_panel = document.getElementById('content-panel')
var cur_width = 2 / 3 * 100
var width_change = (1 / 6 - 0.1) * 100
var links = document.getElementsByTagName('link')
var prism_css

for (var i = 0; i < links.length; i++) {
  if (links[i].href.includes('prism.css')) {
    prism_css = links[i]
    break
  }
}

function hideSidebar() {
  sidebar.style.display = 'none'
  show_sidebar_aside.style.display = 'flex'
  cur_width += width_change
  content_panel.style.width = cur_width + '%'
}

function showSidebar() {
  sidebar.style.display = 'block'
  show_sidebar_aside.style.display = 'none'
  cur_width -= width_change
  content_panel.style.width = cur_width + '%'
  sidebar.style.visibility = 'visible'
}

function hideToolbar() {
  toolbar.setAttribute('style', 'display: none !important;')
  show_toolbar_aside.style.display = 'flex'
  cur_width += width_change
  content_panel.style.width = cur_width + '%'
}

function showToolbar() {
  toolbar.style.display = 'block'
  show_toolbar_aside.style.display = 'none'
  cur_width -= width_change
  content_panel.style.width = cur_width + '%'
  toolbar.style.visibility = 'visible'
}

// Tracks whether the SVG colors are currently inverted. On every page load the
// SVGs render in their raw (light-oriented) state, so this always starts false —
// which is why a refresh in dark mode must re-flip them.
var svgFlipped = false

// Flip SVG colors only when the target mode disagrees with the current SVG state.
// `flipColors()` is its own inverse, so calling it once per crossing is enough.
function syncSvgColors(targetMode) {
  const shouldFlip = targetMode === 'dark'
  if (shouldFlip !== svgFlipped) {
    flipColors()
    svgFlipped = shouldFlip
  }
}

function removeCurrentTheme() {
  document.body.classList.remove('light-mode', 'eyecare-mode', 'dark-mode')
}

// Convert a hex color (#rgb or #rrggbb) to an [r, g, b] array
function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  const num = parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

// Parse any CSS color string to [r, g, b] in 0–255, or null when unparseable.
// Handles: hex (#rgb/#rrggbb), rgb()/rgba(), and CSS Color 4 color(srgb r g b / a)
// where r/g/b are 0..1 floats. Returning null lets callers leave the value
// alone instead of falling back to black, which would mis-invert variables
// like `var(--border-strong)` that resolve to a translucent color() form.
function parseRgbColor(colorString) {
  if (!colorString) return null
  const s = colorString.trim()
  if (s.startsWith('#')) {
    return hexToRgb(s)
  }
  // CSS Color 4: color(srgb 0.04 0.04 0.04 / 0.2)
  if (s.startsWith('color(')) {
    const m = s.match(/-?\d+\.?\d*/g)
    if (!m || m.length < 3) return null
    return [m[0], m[1], m[2]].map((n) => Math.round(parseFloat(n) * 255))
  }
  if (s.startsWith('rgb')) {
    const m = s.match(/-?\d+\.?\d*/g)
    if (!m || m.length < 3) return null
    return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])]
  }
  // Named colors: resolve via the browser. Cheap because canvas paints
  // a single pixel.
  if (/^[a-z]+$/i.test(s)) {
    try {
      const ctx = parseRgbColor._ctx ||
        (parseRgbColor._ctx = document.createElement('canvas').getContext('2d'))
      ctx.fillStyle = '#000'
      ctx.fillStyle = s
      const resolved = ctx.fillStyle // e.g. "#ba7517"
      if (resolved.startsWith('#')) return hexToRgb(resolved)
      return parseRgbColor(resolved)
    } catch (_) {
      return null
    }
  }
  return null
}

// Return the inverted color, or null when the color should be left untouched
// (none / fully transparent / unparseable / paint server reference)
function getInvertColor(color) {
  if (!color || color === 'none' || color === 'transparent') {
    return null
  }
  if (color.includes('url(') || color.startsWith('var(')) {
    return null
  }
  // Skip fully transparent colors (e.g. rgba(0, 0, 0, 0))
  const alphaMatch = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/)
  if (alphaMatch && parseFloat(alphaMatch[1]) === 0) {
    return null
  }
  const rgb = parseRgbColor(color)
  if (!rgb) return null
  return `rgb(${255 - rgb[0]}, ${255 - rgb[1]}, ${255 - rgb[2]})`
}

// A color counts as "neutral" when its three channels are close together AND
// close to either black or white. Neutral strokes/fills get forced to the
// theme's foreground (white in dark mode, black in light) so they always read
// as outlines; chromatic strokes (e.g. #534AB7, #BA7517) are inverted so they
// keep their semantic hue across modes.
function isNeutralRgb(rgb) {
  if (!rgb) return false
  const [r, g, b] = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min > 24) return false // chromatic
  const avg = (r + g + b) / 3
  return avg < 64 || avg > 200 // near-black or near-white
}

function flipColors() {
  const curMode = localStorage.getItem('display-mode')
  const strokeTarget = curMode === 'dark' ? 'white' : 'black'

  // Elements inside <mask>, <clipPath>, <pattern>, or <marker> are paint-server
  // *definitions*, not painted artwork. Their colors are structural:
  //   - In a luminance <mask>, white = visible / black = hidden. Inverting it
  //     swaps which regions show, so masked artwork (e.g. lines using
  //     `mask="url(#imagine-text-gaps-…)"`) gets clipped to almost nothing.
  //   - <marker> children inherit `context-stroke` and shouldn't be re-tinted.
  // Walking up to <svg> and bailing on the first definitional ancestor keeps
  // us out of those subtrees regardless of how the SVG is authored.
  function isInsideDefinition(el) {
    for (let n = el.parentNode; n && n.nodeType === 1 && n.tagName !== 'svg'; n = n.parentNode) {
      const tag = n.tagName
      if (tag === 'mask' || tag === 'clipPath' || tag === 'pattern' || tag === 'marker' || tag === 'defs') {
        // <defs> alone isn't disqualifying — gradient <stop>s live there and we
        // *do* want to flip them — but mask/clipPath/pattern/marker are.
        if (tag !== 'defs') return true
      }
    }
    return false
  }

  // SVG shapes AND text. `text`/`tspan` were previously missing, which left
  // Graphviz text (e.g. cmp_instruction.svg) black and invisible in dark mode.
  const shapes = document.querySelectorAll(
    '.svg-container rect, .svg-container path, .svg-container ellipse, .svg-container circle, .svg-container polygon, .svg-container polyline, .svg-container line, .svg-container text, .svg-container tspan'
  )

  // drawio renders labels as HTML inside <foreignObject>, with hardcoded inline
  // colors (e.g. color: #000000) that no selector touched before.
  const htmlText = document.querySelectorAll(
    '.svg-container foreignObject div, .svg-container foreignObject span, .svg-container foreignObject font, .svg-container foreignObject p'
  )

  // Gradient/pattern definitions. We skip url(...) fills above (inverting the
  // reference would drop the gradient), so instead invert each gradient <stop>
  // here. This is generic: it preserves the gradient's direction, opacity and
  // layering while flipping its colors to suit the target mode.
  const stops = document.querySelectorAll('.svg-container linearGradient stop, .svg-container radialGradient stop')

  // Read first, then apply. SVG `fill` and CSS `color` are inherited, so mutating
  // while iterating would double-invert nested/inheriting nodes.
  const fillUpdates = []
  const strokeUpdates = []
  const colorUpdates = []
  const stopUpdates = []

  shapes.forEach((element) => {
    // Skip mask/clipPath/pattern/marker children — their fills/strokes are
    // structural (e.g. mask rects authored as white-on-black) and inverting
    // them hides the artwork that references the paint server.
    if (isInsideDefinition(element)) return

    const computed = window.getComputedStyle(element)
    // Skip paint-server fills (gradients/patterns), e.g. fill="url(#headerGrad)".
    // getComputedStyle resolves url() to a flat rgb(), so inverting it would
    // replace the gradient reference with a solid (white) color. Check the
    // element's OWN fill declaration, not the computed value.
    const ownFill = element.style.fill || element.getAttribute('fill') || ''
    if (!ownFill.includes('url(')) {
      const invertedFill = getInvertColor(computed.fill)
      if (invertedFill) {
        fillUpdates.push([element, invertedFill])
      }
    }
    // Stroke handling has to cover three cases that show up across our SVGs:
    //   1. Authored colored strokes (e.g. <line stroke="#534AB7" ...>) —
    //      LEAVE the hue alone. These are semantic (purple = ack, amber =
    //      retransmit, red = loss) and were picked to read on both themes;
    //      inverting them swaps amber↔blue and breaks the legend.
    //   2. Neutral black/white outlines (drawio, Graphviz, hand-authored
    //      <line stroke="black">) — force to the theme foreground so they
    //      always read as borders.
    //   3. Variable/unparseable strokes (e.g. var(--border-strong),
    //      color(srgb 0.04 0.04 0.04 / 0.2)) — these are authored as neutral
    //      dividers, force to the theme foreground too.
    //
    // We look at the element's OWN stroke first (attribute or inline style),
    // never the computed value — the dark-mode CSS rule
    // `.dark-mode .svg-container rect { stroke: white }` would otherwise make
    // every stroke="none" element sprout a white border. Inline style wins
    // over the attribute in CSS, so it has priority here too; that also
    // means re-flips read the value WE wrote last time, keeping the loop
    // idempotent.
    const inlineStroke = element.style.stroke
    const attrStroke = element.getAttribute('stroke')
    const ownStroke = inlineStroke || attrStroke
    if (ownStroke && ownStroke !== 'none') {
      const rgb = parseRgbColor(ownStroke)
      let nextStroke = null
      if (!rgb) {
        // Variable / unparseable — treat as neutral divider.
        nextStroke = strokeTarget
      } else if (isNeutralRgb(rgb)) {
        nextStroke = strokeTarget
      }
      // Chromatic strokes fall through with nextStroke == null → no change.
      if (nextStroke !== null) {
        strokeUpdates.push([element, nextStroke, inlineStroke, attrStroke])
      }
    }
  })

  htmlText.forEach((element) => {
    // Only flip elements with their OWN inline color. Falling back to
    // getComputedStyle() would re-read colors that the dark-mode CSS rules
    // (e.g. `.dark-mode .svg-container font { color: white }`) already set,
    // then invert them back to black — breaking the very text we want light.
    const color = element.style.color
    if (!color) {
      return
    }
    const invertedColor = getInvertColor(color)
    if (invertedColor) {
      colorUpdates.push([element, invertedColor])
    }
  })

  // Invert gradient stops. stop-color may live in inline style or as an
  // attribute; getComputedStyle resolves either to a usable color string.
  stops.forEach((stop) => {
    const stopColor = stop.style.stopColor || window.getComputedStyle(stop).stopColor
    const inverted = getInvertColor(stopColor)
    if (inverted) {
      stopUpdates.push([stop, inverted])
    }
  })

  // Set both the attribute and the inline style. drawio rects carry an inline
  // `style="fill: rgb(...)"` that overrides the `fill` attribute, so updating the
  // attribute alone left their backgrounds hardcoded.
  fillUpdates.forEach(([element, color]) => {
    element.setAttribute('fill', color)
    element.style.fill = color
  })
  // Apply each stroke update. We always set `element.style.stroke` so the
  // inline style wins over a stale `stroke="..."` attribute, and we also
  // rewrite the attribute when it was the source — both being in sync makes
  // re-flips (light→dark→light) idempotent.
  strokeUpdates.forEach(([element, color, inlineStroke, attrStroke]) => {
    element.style.stroke = color
    if (attrStroke && !inlineStroke) {
      element.setAttribute('stroke', color)
    }
  })
  colorUpdates.forEach(([element, color]) => { element.style.color = color })
  // Setting stopColor updates the gradient definition; every shape referencing
  // it via url(#id) repaints automatically.
  stopUpdates.forEach(([stop, color]) => {
    stop.setAttribute('stop-color', color)
    stop.style.stopColor = color
  })
}

// Load light mode
function loadLightMode() {
  removeCurrentTheme()
  document.body.classList.add('light-mode')
  localStorage.setItem('display-mode', 'light')
  prism_css.href = "/css/prism.css"
  syncSvgColors('light')
}

// Load dark mode
function loadDarkMode() {
  removeCurrentTheme()
  document.body.classList.add('dark-mode')
  localStorage.setItem('display-mode', 'dark')
  prism_css.href = "/css/prism-dark.css"
  syncSvgColors('dark')
}

// Load eyecare mode
function loadEyecareMode() {
  removeCurrentTheme()
  document.body.classList.add('eyecare-mode')
  localStorage.setItem('display-mode', 'eyecare')
  prism_css.href = "/css/prism-eyecare.css"
  syncSvgColors('eyecare')
}

// Initialize sidebar, toolbar, mode
(function() {
  if (localStorage.getItem('sidebar_hidden') == 1) {
    hideSidebar()
  } else {
    sidebar.style.visibility = 'visible'
  }
  if (localStorage.getItem('toolbar_hidden') == 1) {
    hideToolbar()
  } else {
    toolbar.style.visibility = 'visible'
  }
  
  // Set eyecare as default for new users
  if (!localStorage.getItem('display-mode')) {
    localStorage.setItem('display-mode', 'eyecare')
  }
  
  const displayMode = localStorage.getItem('display-mode');
  if (displayMode === 'eyecare') {
    loadEyecareMode()
  } else if (displayMode === 'dark') {
    loadDarkMode()
  } else {
    loadLightMode()
  }
})()

document.addEventListener('DOMContentLoaded', () => {
  localStorage.setItem('current-href', window.location.href)
  
  document.getElementById('hide_sidebar').addEventListener('click', function() {
    hideSidebar()
    localStorage.setItem('sidebar_hidden', 1)
  })

  show_sidebar_aside.addEventListener('click', function() {
    showSidebar()
    localStorage.setItem('sidebar_hidden', 0)
  })

  document.getElementById('hide_toolbar').addEventListener('click', function() {
    hideToolbar()
    localStorage.setItem('toolbar_hidden', 1)
  })

  show_toolbar_aside.addEventListener('click', function() {
    showToolbar()
    localStorage.setItem('toolbar_hidden', 0)
  })

  document.getElementById('toggle_light_mode').addEventListener('click', function(event) {
    event.preventDefault()
    if (localStorage.getItem('display-mode') == 'light') {
      return
    }
    loadLightMode()
  })
  
  document.getElementById('toggle_eyecare_mode').addEventListener('click', function(event) {
    event.preventDefault()
    if (localStorage.getItem('display-mode') == 'eyecare') {
      return
    }
    loadEyecareMode()
  })
  
  document.getElementById('toggle_dark_mode').addEventListener('click', function(event) {
    event.preventDefault()
    if (localStorage.getItem('display-mode') == 'dark') {
      return
    }
    loadDarkMode()
  })
})
