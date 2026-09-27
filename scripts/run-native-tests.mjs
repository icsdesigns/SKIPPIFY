/**
 * Compila y ejecuta las pruebas del motor de macros en segundo plano.
 *
 * El motor nativo está partido a propósito en dos mitades: `MacroRunner` y
 * `SpotifyBackend` no importan nada de Android, así que se compilan con javac a
 * secas y se prueban contra un Spotify de mentira sin emulador ni SDK. Lo que sí
 * depende de Android —SharedPreferences, org.json, el servicio— vive en
 * `MacroBackground` y queda fuera de aquí.
 *
 * Uso: npm run test:nativo   (necesita un JDK en el PATH)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FUENTES = [
  join(raiz, 'android-src', 'MacroRunner.java'),
  join(raiz, 'android-src', 'SpotifyBackend.java'),
  join(raiz, 'scripts', 'native-tests', 'PruebasMacros.java'),
  // El temporizador de escucha aparta igual su decisión en una clase sin Android.
  join(raiz, 'android-src', 'SleepTimerDecision.java'),
  join(raiz, 'scripts', 'native-tests', 'PruebasTemporizador.java'),
  // Y la subida de escuchas de Comunidad: la parte que decide, sin Android.
  join(raiz, 'android-src', 'EscuchasNube.java'),
  join(raiz, 'scripts', 'native-tests', 'PruebasLiga.java')
]

for (const f of FUENTES) {
  if (!existsSync(f)) {
    console.error(`No se encuentra ${f}`)
    process.exit(1)
  }
}

function hayJdk () {
  try {
    execFileSync('javac', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!hayJdk()) {
  // No es un fallo del código: en una máquina sin JDK simplemente no se pueden
  // correr, y hacer fallar la tanda entera por eso sería ruido.
  console.log('Motor nativo: sin javac en el PATH, se omiten estas pruebas.')
  console.log('  (el build de la APK ya usa un JDK; instala uno para correrlas en local)')
  process.exit(0)
}

const salida = mkdtempSync(join(tmpdir(), 'skippify-nativo-'))
try {
  execFileSync('javac', ['-nowarn', '-d', salida, ...FUENTES], { stdio: 'inherit' })
  execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', salida, 'com.skippify.app.PruebasMacros'], { stdio: 'inherit' })
  execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', salida, 'com.skippify.app.PruebasTemporizador'], { stdio: 'inherit' })
  execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', salida, 'com.skippify.app.PruebasLiga'], { stdio: 'inherit' })
} finally {
  rmSync(salida, { recursive: true, force: true })
}
