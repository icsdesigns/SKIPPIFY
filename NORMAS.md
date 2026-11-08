# Normas básicas del proyecto

Estas normas valen para todo el trabajo en Skippify, salvo que Iván indique expresamente lo contrario.

## Cómo se trabaja

1. Las tareas las hace un agente **Sonnet 5.5 implementador**. Al terminar, otro agente **Sonnet 5.5 verificador**:
   1. comprueba primero que el implementador ha completado **todas** las tareas (si falta alguna, se le pide de nuevo al implementador que la complete);
   2. cuando eso está verificado, revisa que las tareas están bien implementadas y que funcionan como deben.
2. Nada se sube a `main` sin el visto bueno escrito de Iván.
3. En commits, PR, README, manifiestos y cabeceras no figura Claude ni Anthropic como autor o coautor.

## Cómo se ve

4. **Estética y armonía.** Toda modificación de interfaz sigue la estética y la armonía de la interfaz existente (tarjetas de opción, tesela de icono a la izquierda y texto a la derecha, iconos SVG propios, sin emoji), salvo que se indique lo contrario.
5. **Cualquier proporción de ventana.** Toda modificación de interfaz se ve correctamente en cualquier tamaño de ventana, sin cortes ni desbordamientos (se comprueba como mínimo a 320, 375, 768 y 1280 px de ancho).
6. **Tarjetas de opción acotadas.** Una tarjeta de opción no es más alta que la tarjeta «Personalizado» de Funciones: título de dos líneas como máximo y cuatro de descripción. Lo que no cabe va fuera de la tarjeta.
7. **Imágenes para compartir (Wrapped y similares).** Siempre siguen la apariencia de la app: mismos colores, tipografía, iconos y tarjetas. Son estéticas y se pueden exportar para compartir en otras apps (formato vertical).
