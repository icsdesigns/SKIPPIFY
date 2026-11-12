# Política de privacidad de Skippify

Última actualización: 12 de noviembre de 2026

Skippify es una app para Android que mejora la escucha en Spotify: salta
canciones repetidas, ejecuta macros y te enseña estadísticas de lo que escuchas.
Esta página explica qué datos usa, dónde se guardan y con quién se comparten.

**Resumen:** Skippify no tiene servidores propios, no muestra publicidad, no
incluye analítica ni rastreadores, y no vende ni cede datos a nadie. Casi todo se
queda en tu teléfono. Lo único que sale de él es lo que tú decides compartir con
un grupo, y viaja cifrado.

## 1. Qué datos usa la app y para qué

### Notificaciones de Spotify (acceso a notificaciones)

Con tu permiso, Skippify lee **solo las notificaciones de la app de Spotify**
(`com.spotify.music`): título de la canción, artista, álbum, duración y si está
sonando o en pausa. Ignora las notificaciones de cualquier otra app.

Las usa para:

- saber qué suena y saltar las canciones repetidas o silenciar anuncios;
- guardar tu historial de escuchas y calcular tus estadísticas (Inicio, Wrapped,
  widgets);
- ejecutar las macros que tú configures.

Ese historial se guarda **solo en tu teléfono**.

### Cuenta de Spotify (opcional)

Si vinculas tu cuenta, la app inicia sesión directamente con Spotify (OAuth con
PKCE) usando **tu propio Client ID**. El token de acceso se guarda en el
teléfono y las llamadas van directamente de tu teléfono a `api.spotify.com`.

Permisos que se piden: perfil básico, playlists (leer y modificar), biblioteca
(leer y modificar), canciones escuchadas recientemente, canción actual y estado
de reproducción (leer y controlar) y tus artistas y canciones más escuchados. No
se pide tu correo electrónico.

### Grupos (opcional)

Si creas un grupo o te unes a uno, compartes con sus miembros:

- el nombre que elijas para el grupo;
- tus escuchas (canción, artista y hora) y la puntuación semanal derivada de ellas;
- tu presencia (si la app está activa) y, si los activas, tu registro de
  funcionalidad y las macros que decidas compartir.

Estos datos se **firman y cifran en tu teléfono** antes de salir, con una clave
que solo tienen los miembros del grupo. Se transmiten a través de relés públicos
del protocolo Nostr (por defecto `relay.damus.io`, `nos.lol`, `relay.primal.net`,
`nostr.mom` y `offchain.pub`), que solo ven datos cifrados, una clave pública
anónima y, como cualquier servidor de internet, tu dirección IP. Esos relés no
son de Skippify y tienen sus propias políticas.

Antes de crear o unirte a un grupo la app te pide confirmar que entiendes qué se
comparte. Al salir de un grupo, la app retira tus registros de él y avisa al
resto; los miembros que ya los hubiesen recibido pueden conservar una copia.

### Comprobación de actualizaciones (solo la versión distribuida por GitHub)

La versión que se descarga desde GitHub consulta de vez en cuando
`api.github.com` para saber si hay una versión nueva, y la descarga desde
`github.com`. GitHub recibe tu dirección IP como en cualquier visita web. La
versión de Google Play no hace esta comprobación: la actualiza la tienda.

## 2. Qué no hace

- No tiene servidor propio: no hay ninguna copia de tus datos fuera de tu
  teléfono, salvo lo compartido cifrado con tus grupos.
- No incluye anuncios, SDK de analítica, informes de errores a terceros ni
  rastreadores.
- No lee notificaciones de otras apps, mensajes, contactos, fotos ni ubicación.
- No hace copia de seguridad en la nube de Google ni pasa los datos a otro
  teléfono al cambiar de dispositivo, para que las claves de tus grupos y tu
  sesión de Spotify no salgan del teléfono.

## 3. Permisos de Android

- **Acceso a notificaciones**: leer qué suena en Spotify (ver arriba).
- **Notificaciones**: la notificación persistente del servicio y los avisos.
- **Servicio en primer plano**: que los saltos y las macros funcionen con la
  pantalla apagada.
- **Internet**: hablar con Spotify, con los relés de los grupos y, en la versión
  de GitHub, comprobar actualizaciones.
- **Iniciar al arrancar el teléfono**: volver a poner en marcha el servicio.
- **Alarmas**: temporizador de escucha, avisos de grupos y comprobación de
  actualizaciones.
- **Instalar apps desconocidas** (solo versión de GitHub): instalar las
  actualizaciones que descarga la propia app.

## 4. Cuánto tiempo se guardan y cómo borrarlos

Los datos se guardan en tu teléfono mientras tengas la app instalada. Puedes:

- desvincular tu cuenta de Spotify desde la app y revocar el acceso en
  <https://www.spotify.com/account/apps/>;
- salir de cualquier grupo desde la pestaña **Grupos**;
- borrarlo todo desinstalando la app o con **Ajustes de Android → Aplicaciones →
  Skippify → Almacenamiento → Borrar datos**.

## 5. Menores

Skippify no está dirigida a menores de 13 años.

## 6. Cambios y contacto

Si esta política cambia, se actualizará esta página y la fecha de arriba.

Para cualquier pregunta sobre privacidad: abre una incidencia en
<https://github.com/icsdesigns/SKIPPIFY/issues>.
