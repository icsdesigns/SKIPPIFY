/**
 * Punto de entrada del WebView oculto del servicio en segundo plano.
 *
 * Sin Vue ni interfaz: sólo sincroniza los grupos del modo LocalHost. El ritmo
 * lo marca el código nativo (LocalHostBackground.java), que llama a __lhTick y
 * recibe por `schedule` cuándo volver a hacerlo. Al volver la app a primer
 * plano pide __lhStop y espera a que `stopped` confirme que ya no escribe.
 */
import { backgroundTick, backgroundRelease } from '@/composables/useLocalLeague'

const native = () => window.SkippifyLh
let parado = true
let enCurso = null

async function tanda () {
  if (parado || enCurso) return
  enCurso = (async () => {
    let siguiente = 300_000
    try {
      siguiente = await backgroundTick()
    } catch { /* se reintenta en la siguiente */ }
    return siguiente
  })()
  const siguiente = await enCurso
  enCurso = null
  if (!parado) native()?.schedule?.(siguiente)
}

window.__lhStart = () => {
  parado = false
  void tanda()
}
window.__lhTick = () => { void tanda() }
window.__lhStop = async () => {
  parado = true
  try { await enCurso } catch { /* nada */ }
  backgroundRelease()
  native()?.stopped?.()
}

native()?.ready?.()
