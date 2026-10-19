# localhost-core (copia del kit)

Copia sin modificar de `localhost-kit/packages/core/src` (kit LocalHost, repositorio
LocalHost 18a35e0). Es el núcleo del modo «Comunidad sin servidor». No se edita aquí:
cualquier cambio del núcleo debe pasar de nuevo los tests y el simulador del kit
(`localhost-kit`: `npm ci && npm test && npm run test:sim`).

La app lo carga bajo demanda desde `src/composables/useLocalLeague.js`. Para revertir
todo el modo sin servidor basta volver a la etiqueta `pre-localhost-v4.2.6`
(o a la rama `backup/pre-localhost-v4.2.6`): el sistema Firebase no se ha tocado.
