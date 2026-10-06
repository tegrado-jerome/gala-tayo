// Prerendered pages start the app once they have painted, so on slow networks the HTML, CSS and hero
// photo get the connection to themselves instead of sharing it with ~250 KB of JavaScript. Links in the
// prerendered HTML work before then; main.tsx swaps in the live page when it is ready.
// scripts/prerender.mjs puts this file in place of the module script and its modulepreload links.
(function () {
  var script = document.currentScript
  var entry = script.getAttribute('data-entry')
  var preloads = (script.getAttribute('data-preload') || '').split(' ').filter(Boolean)

  var started = false
  function start() {
    if (started) return
    started = true
    preloads.forEach(function (href) {
      var link = document.createElement('link')
      link.rel = 'modulepreload'
      link.crossOrigin = ''
      link.href = href
      document.head.appendChild(link)
    })
    var app = document.createElement('script')
    app.type = 'module'
    app.crossOrigin = ''
    app.src = entry
    document.head.appendChild(app)
  }

  // Start two frames after the load event (the page and its hero photo are on screen by
  // then), or after 2.5 s on a slow connection, whichever is first.
  function afterNextFrame() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(start, 0)
      })
    })
  }
  if (document.readyState === 'complete') afterNextFrame()
  else window.addEventListener('load', afterNextFrame)
  setTimeout(start, 2500)
})()
