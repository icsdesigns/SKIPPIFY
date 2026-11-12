/**
 * Política de privacidad: vive en el repo (PRIVACIDAD.md) para que tenga una
 * URL pública y estable, que es la que se indica también en Google Play.
 */
export const URL_POLITICA_PRIVACIDAD = 'https://github.com/icsdesigns/SKIPPIFY/blob/main/PRIVACIDAD.md'

/** Abre la política en el navegador del sistema (o en otra pestaña en web). */
export async function abrirPoliticaPrivacidad () {
  const NL = window.Capacitor?.Plugins?.NotifListener
  if (window.Capacitor?.isNativePlatform?.() && NL?.openExternalUrl) {
    try {
      const r = await NL.openExternalUrl({ url: URL_POLITICA_PRIVACIDAD })
      if (r?.opened) return true
    } catch { /* se intenta abajo */ }
  }
  try {
    return !!window.open(URL_POLITICA_PRIVACIDAD, '_blank', 'noopener')
  } catch {
    return false
  }
}
