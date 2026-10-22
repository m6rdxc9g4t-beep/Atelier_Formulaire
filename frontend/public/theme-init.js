// Applique le thème avant le premier rendu (évite un flash clair → sombre).
// Suite Atelier : en sombre, data-theme="dark" ET la classe « dark » sur <html> ; préférence Clair, Sombre ou Système.
;(function () {
  var root = document.documentElement
  var preference = 'system'
  try {
    var saved = localStorage.getItem('atelier-formulaire:theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved
  } catch (error) {}
  var dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.themePreference = preference
  root.dataset.theme = dark ? 'dark' : 'light'
  root.classList.toggle('dark', dark)
})()
