/** @type {import('tailwindcss').Config} */

/**
 * Paleta de Skippify, rehecha sobre el lenguaje visual de Spotify.
 *
 * La decisión de fondo: en vez de repasar a mano los cientos de literales de
 * color repartidos por las vistas (`text-slate-400`, `bg-slate-900/55`…), se
 * REDEFINEN aquí las familias que la app ya usaba. Así el cambio de aspecto
 * llega a cada pantalla de golpe y sin tocar una sola plantilla, que es
 * exactamente lo que se pedía: cambia la apariencia, no el comportamiento.
 *
 * Contraste: es el motivo principal de que las rampas no sean las de Tailwind.
 * Sobre el negro de Spotify (#121212), el `slate-500` original (#64748b) se
 * quedaba en 4,0:1 y el `slate-600` (#475569) en 2,6:1 — texto secundario
 * ilegible. Las rampas de abajo son NEUTRAS y están corridas hacia arriba: el
 * paso 400 es el gris secundario de Spotify (#b3b3b3, 9,7:1) y hasta el 600
 * (#7c7c7c) mantiene 4,6:1. Ninguna combinación de texto baja de AA.
 */

/** Gris neutro de Spotify. Sustituye a `slate` en toda la app. */
const neutral = {
  50: '#ffffff',
  100: '#f7f7f7',
  200: '#e4e4e4',
  300: '#cfcfcf',
  400: '#b3b3b3', // texto secundario de Spotify
  500: '#9a9a9a',
  600: '#7c7c7c', // el tono más apagado que sigue siendo legible (4,6:1)
  700: '#535353', // bordes fuertes y pistas deshabilitadas
  800: '#2a2a2a', // bordes y separadores
  900: '#181818', // superficie de tarjeta
  950: '#121212' // lienzo
}

/** Verde de Spotify. `brand-400` es el verde vivo (#1ed760) del botón. */
const brand = {
  50: '#eafaf0',
  100: '#c8f4d9',
  200: '#96eab8',
  300: '#5ce194',
  400: '#1ed760',
  500: '#1db954',
  600: '#17a247',
  700: '#12833a',
  800: '#0e662d',
  900: '#0a4a21'
}

export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand,

        /**
         * Escala de superficies, de la más honda a la más elevada. Spotify no
         * usa transparencias para elevar: usa grises sólidos, que es lo que
         * hace que las listas largas no se emborronen unas sobre otras.
         */
        ink: {
          900: '#000000', // barra lateral y fondos a sangre
          850: '#0a0a0a',
          800: '#121212', // lienzo de la aplicación
          700: '#181818', // tarjeta en reposo
          600: '#1f1f1f',
          500: '#242424', // tarjeta al pasar por encima
          400: '#2a2a2a',
          300: '#333333' // control pulsado / relleno de pista
        },

        // Las familias de acento se redefinen para que mantengan viveza y
        // contraste sobre negro. Las de Tailwind están pensadas para fondo
        // claro y sobre #121212 se apagan.
        slate: neutral,
        gray: neutral,
        zinc: neutral,

        amber: {
          50: '#fff8e6',
          100: '#ffeec2',
          200: '#ffdf8f',
          300: '#ffcf57',
          400: '#f7c948',
          500: '#eab308',
          600: '#c69207',
          700: '#9c7305',
          800: '#6f5204',
          900: '#4a3703'
        },
        orange: {
          100: '#ffe4cc',
          200: '#ffc899',
          300: '#ffa761',
          400: '#ff8c3a',
          500: '#f97316',
          600: '#d15c0c',
          700: '#a34708',
          800: '#753306',
          900: '#4d2303'
        },
        rose: {
          50: '#fff1f4',
          100: '#ffdbe3',
          200: '#ffb5c5',
          300: '#ff8da6',
          400: '#ff6b88',
          500: '#f4436a',
          600: '#d92a53',
          700: '#ad1f41',
          800: '#7d1630',
          900: '#520e1f'
        },
        red: {
          50: '#fff1f1',
          100: '#ffdada',
          200: '#ffb3b3',
          300: '#ff8a8a',
          400: '#ff6b6b',
          500: '#ef4444',
          600: '#d32f2f',
          700: '#a52222',
          800: '#771818',
          900: '#4d0f0f'
        },
        violet: {
          50: '#f6f2ff',
          100: '#e9dfff',
          200: '#d6c4ff',
          300: '#bda4ff',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7440e0',
          700: '#5c30b4',
          800: '#442285',
          900: '#2d1657'
        },
        indigo: {
          100: '#e0e2ff',
          200: '#c3c7ff',
          300: '#a3a8ff',
          400: '#8b90fb',
          500: '#6c70f0',
          600: '#5155d0',
          700: '#3d40a4',
          800: '#2c2e78',
          900: '#1d1f4f'
        },
        sky: {
          50: '#eef9ff',
          100: '#d2efff',
          200: '#a9e0ff',
          300: '#7bcdfb',
          400: '#56bdf7',
          500: '#2ea3e8',
          600: '#1c86c6',
          700: '#15689a',
          800: '#104b6f',
          900: '#0a3149'
        },
        // El teal sólo aparece como segundo color de algunos degradados: se
        // lleva a la familia verde para que esos degradados sean de Spotify y
        // no un arcoíris.
        teal: {
          100: '#d6f9e5',
          200: '#a8f0c6',
          300: '#74e5a3',
          400: '#3ed77f',
          500: '#1db954',
          600: '#17a247',
          700: '#12833a',
          800: '#0e662d',
          900: '#0a4a21'
        }
      },

      // Tailwind sólo trae la escala de 5 en 5: estos pasos intermedios los usan
      // los tintes de las tarjetas, donde 10 se queda corto y 20 ya pesa.
      opacity: {
        12: '0.12',
        14: '0.14',
        16: '0.16',
        18: '0.18',
        22: '0.22'
      },

      /**
       * Spotify compone en Circular, que no es redistribuible. La pila busca lo
       * más parecido que ya esté en el dispositivo —geométrica, de caja alta y
       * ancha— sin depender de descargar nada: una fuente remota en una APK
       * implica esperar a la red para pintar el primer texto.
       */
      fontFamily: {
        sans: [
          'Montserrat',
          'Gotham',
          'Segoe UI Variable Display',
          'Segoe UI',
          'Inter',
          'system-ui',
          '-apple-system',
          'Roboto',
          'Helvetica Neue',
          'sans-serif'
        ]
      },

      letterSpacing: {
        tightest: '-0.035em'
      },

      borderRadius: {
        card: '12px',
        shelf: '16px'
      },

      boxShadow: {
        // Spotify no dibuja bordes en las tarjetas: las separa con sombra dura
        // y un gris ligeramente distinto al del lienzo.
        card: '0 8px 24px rgba(0, 0, 0, 0.5)',
        lift: '0 16px 40px rgba(0, 0, 0, 0.65)',
        glow: '0 8px 28px -10px rgba(30, 215, 96, 0.55)',
        header: '0 6px 18px rgba(0, 0, 0, 0.45)'
      },

      keyframes: {
        'sk-rise': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'sk-pulse-ring': {
          '0%': { opacity: '0.55', transform: 'scale(0.9)' },
          '100%': { opacity: '0', transform: 'scale(1.35)' }
        }
      },

      animation: {
        'sk-rise': 'sk-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sk-pulse-ring': 'sk-pulse-ring 2.4s ease-out infinite'
      }
    }
  },
  plugins: []
}
