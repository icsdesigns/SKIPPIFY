/**
 * Guardado de archivos en Documentos/Skippify/… sin fallos por solapamiento.
 *
 * Qué fallaba: `Filesystem.mkdir` rechaza con «Directory exists» cuando la
 * carpeta ya está creada, incluso con `recursive: true` en algunas versiones del
 * plugin. La primera exportación la creaba y la segunda fallaba con
 * «No se pudo exportar el respaldo: directory exists».
 *
 * Aquí una carpeta que ya existe es un éxito, y un archivo que ya existe no se
 * pisa: se guarda al lado con un sufijo numérico (-2, -3…).
 *
 * Es lógica pura: recibe el plugin (`fs`) y la carpeta base (`directory`), de
 * modo que se prueba con un `Filesystem` simulado (scripts/pruebas-ajustes.mjs).
 */

/** ¿El error dice que lo que se quería crear ya existe? */
export function esErrorYaExiste (error) {
  const texto = `${error?.message || ''} ${error?.code || ''} ${typeof error === 'string' ? error : ''}`
  return /exist|ya existe|already/i.test(texto)
}

async function existe (fs, ruta, directory) {
  try {
    await fs.stat({ path: ruta, directory })
    return true
  } catch {
    return false
  }
}

/** Crea la carpeta (y las intermedias). Que ya exista no es un error. */
export async function asegurarCarpeta (fs, carpeta, directory) {
  try {
    await fs.mkdir({ path: carpeta, directory, recursive: true })
  } catch (error) {
    if (esErrorYaExiste(error)) return
    // Otros mensajes (según plugin y Android): si la carpeta está ahí, vale.
    if (await existe(fs, carpeta, directory)) return
    throw error
  }
}

/** `nombre.ext` → `nombre-2.ext`, `nombre-3.ext`… hasta dar con uno libre. */
export async function nombreLibre (fs, carpeta, nombre, directory, maximo = 99) {
  if (!(await existe(fs, `${carpeta}/${nombre}`, directory))) return nombre
  const punto = nombre.lastIndexOf('.')
  const base = punto > 0 ? nombre.slice(0, punto) : nombre
  const ext = punto > 0 ? nombre.slice(punto) : ''
  for (let n = 2; n <= maximo; n += 1) {
    const candidato = `${base}-${n}${ext}`
    if (!(await existe(fs, `${carpeta}/${candidato}`, directory))) return candidato
  }
  // Todo ocupado (no debería pasar): marca de tiempo, que no se repite.
  return `${base}-${Date.now()}${ext}`
}

/**
 * Guarda `data` en `carpeta/nombre` dentro de `directory`.
 * Devuelve `{ nombre, ruta }`: el nombre puede llevar sufijo si ya había uno igual.
 * `opciones.encoding` sólo se pasa para texto; el binario (base64) va sin él.
 */
export async function guardarArchivo (fs, { directory, carpeta, nombre, data, encoding }) {
  await asegurarCarpeta(fs, carpeta, directory)
  const libre = await nombreLibre(fs, carpeta, nombre, directory)
  const ruta = `${carpeta}/${libre}`
  const peticion = { path: ruta, data, directory }
  if (encoding) peticion.encoding = encoding
  await fs.writeFile(peticion)
  return { nombre: libre, ruta }
}
