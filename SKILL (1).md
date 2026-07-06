---
name: minimalist-ui
description: Interfaces de estilo editorial limpio. Paleta monocromática cálida, contraste tipográfico, grids bento planos, pasteles apagados. Sin degradados, sin sombras pesadas.
---

# Protocolo: Arquitecto de UI Minimalista Utilitario Premium

## 1. Resumen del Protocolo
Nombre: Minimalismo Utilitario Premium & UI Editorial
Descripción: Una directiva avanzada de ingeniería frontend para generar interfaces web ultra-minimalistas, altamente refinadas y de "estilo documento", análogas a las plataformas de workspace de primer nivel. Este protocolo aplica estrictamente una paleta monocromática cálida de alto contraste, jerarquías tipográficas a medida, macro-espaciado estructural meticuloso, layouts de tipo bento-grid y una arquitectura de componentes ultra-plana con acentos pastel apagados deliberados. Rechaza activamente las tendencias genéricas de diseño SaaS.

## 2. Restricciones Negativas Absolutas (Elementos Prohibidos)
La IA debe evitar estrictamente los siguientes defaults genéricos de desarrollo web:
- NO uses las tipografías "Inter", "Roboto" ni "Open Sans".
- NO uses librerías de iconos genéricas de línea fina como "Lucide", "Feather" o los "Heroicons" estándar.
- NO uses las sombras por defecto pesadas de Tailwind (ej: `shadow-md`, `shadow-lg`, `shadow-xl`). Las sombras deben ser prácticamente inexistentes o estar fuertemente personalizadas para ser ultra-difusas y de baja opacidad (< 0.05).
- NO uses fondos de colores primarios en elementos o secciones grandes (ej: sin secciones hero azul brillante, verde o rojo).
- NO uses degradados, colores neón ni glassmorphism 3D (más allá de blurs sutiles en la navbar).
- NO uses `rounded-full` (formas tipo píldora) en contenedores grandes, tarjetas o botones primarios.
- NO uses emojis en ningún lugar: código, markup, texto, headings ni alt text. Reemplázalos con iconos apropiados o primitivas SVG limpias.
- NO uses nombres genéricos de relleno como "John Doe", "Acme Corp" o "Lorem Ipsum". Usa contenido realista y contextual.
- NO uses clichés de copywriting de IA: "Eleva", "Seamless", "Libera", "Próxima generación", "Revolucionario", "Sumérgete". Escribe en lenguaje llano y específico.

## 3. Arquitectura Tipográfica
La interfaz debe apoyarse en un contraste tipográfico extremo y una selección de fuentes premium para establecer una sensación editorial.
- Sans-Serif Principal (Cuerpo, UI, Botones): Usa fuentes limpias, geométricas o nativas del sistema con carácter. Objetivo: `font-family: 'SF Pro Display', 'Geist Sans', 'Helvetica Neue', 'Switzer', sans-serif`.
- Serif Editorial (Titulares hero y citas): Objetivo: `font-family: 'Lyon Text', 'Newsreader', 'Playfair Display', 'Instrument Serif', serif`. Aplica tracking ajustado (`letter-spacing: -0.02em` a `-0.04em`) e interlineado ajustado (`1.1`).
- Monospace (Código, atajos de teclado, metadatos): Objetivo: `font-family: 'Geist Mono', 'SF Mono', 'JetBrains Mono', monospace`.
- Colores de texto: El texto de cuerpo nunca debe ser negro absoluto (`#000000`). Usa off-black/carbón (`#111111` o `#2F3437`) con un `line-height` generoso de `1.6` para legibilidad. El texto secundario debe ser gris apagado (`#787774`).

## 4. Paleta de Color (Monocromo Cálido + Acentos Pastel)
El color es un recurso escaso, utilizado solo para significado semántico o acentos sutiles.
- Lienzo / Fondo: Blanco puro `#FFFFFF` o Hueso cálido/Off-White `#F7F6F3` / `#FBFBFA`.
- Superficie primaria (Tarjetas): `#FFFFFF` o `#F9F9F8`.
- Bordes estructurales / Divisores: Gris ultra-claro `#EAEAEA` o `rgba(0,0,0,0.06)`.
- Colores de acento: Usa exclusivamente pasteles altamente desaturados y lavados para tags, fondos de código inline o fondos sutiles de iconos.
  - Rojo pálido: `#FDEBEC` (Texto: `#9F2F2D`)
  - Azul pálido: `#E1F3FE` (Texto: `#1F6C9F`)
  - Verde pálido: `#EDF3EC` (Texto: `#346538`)
  - Amarillo pálido: `#FBF3DB` (Texto: `#956400`)

## 5. Especificaciones de Componentes
- Bento Box Feature Grids:
  - Utiliza layouts asimétricos de CSS Grid.
  - Las tarjetas deben tener exactamente `border: 1px solid #EAEAEA`.
  - El border-radius debe ser nítido: `8px` o `12px` como máximo.
  - El padding interno debe ser generoso (ej: `24px` a `40px`).
- Call-To-Action Primario (Botones):
  - Fondo sólido `#111111`, texto `#FFFFFF`.
  - Border-radius leve (`4px` a `6px`). Sin box-shadow.
  - El estado hover debe ser un cambio sutil de color a `#333333` o un micro-`transform: scale(0.98)`.
- Tags y Badges de estado:
  - Forma de píldora (`border-radius: 9999px`), tipografía muy pequeña (`text-xs`), en mayúsculas con tracking amplio (`letter-spacing: 0.05em`).
  - El fondo debe usar los pasteles apagados definidos.
- Acordeones (FAQ):
  - Elimina todas las cajas contenedoras. Separa los ítems únicamente con un `border-bottom: 1px solid #EAEAEA`.
  - Usa un icono limpio y nítido de `+` y `-` para el estado toggle.
- Micro-UIs de atajos de teclado:
  - Renderiza los atajos como teclas físicas usando etiquetas `<kbd>`: `border: 1px solid #EAEAEA`, `border-radius: 4px`, `background: #F7F6F3`, usando la fuente monospace.
- Faux-OS Window Chrome:
  - Cuando maquetes software, envuélvelo en un contenedor minimalista con una barra superior blanca que contenga tres círculos pequeños de color gris claro (replicando los controles de ventana de macOS).

## 6. Directivas de Iconografía e Imágenes
- Iconos del sistema: Usa "Phosphor Icons (pesos Bold o Fill)" o "Radix UI Icons" para una estética técnica, de trazo ligeramente más grueso. Estandariza el grosor del trazo en todos los iconos.
- Ilustraciones: Bocetos monocromáticos a tinta de línea continua rugosa sobre fondo blanco, con una única forma geométrica desplazada rellenada con un color pastel apagado.
- Fotografía: Usa imágenes de alta calidad, desaturadas y con tono cálido. Aplica overlays sutiles (`opacity: 0.04` grano cálido) para fundir las fotos en la paleta monocromática. Nunca uses fotos de stock sobresaturadas. Usa placeholders fiables como `https://picsum.photos/seed/{context}/1200/800` cuando no haya assets reales disponibles.
- Fondos de Hero y de sección: Las secciones no deben sentirse vacías ni planas. Usa imágenes de fondo sutiles a todo el ancho con muy baja opacidad, manchas radiales de luz suave (`radial-gradient` con tonos cálidos a `opacity: 0.03`) o patrones mínimos de líneas geométricas para añadir profundidad sin romper la estética limpia.

## 7. Movimiento Sutil y Micro-Animaciones
El movimiento debe sentirse invisible — presente pero nunca distractor. El objetivo es sofisticación silenciosa, no espectáculo.
- Entrada al hacer scroll: Los elementos aparecen suavemente con fade al entrar en el viewport. Usa `translateY(12px)` + `opacity: 0` resolviendo en `600ms` con `cubic-bezier(0.16, 1, 0.3, 1)`. Usa `IntersectionObserver`, nunca `window.addEventListener('scroll')`.
- Estados hover: Las tarjetas se elevan con un cambio de sombra ultra-sutil (`box-shadow` transicionando de `0 0 0` a `0 2px 8px rgba(0,0,0,0.04)` en `200ms`). Los botones responden con `scale(0.98)` en `:active`.
- Revelaciones escalonadas: Las listas y los ítems de grid entran con un retardo en cascada (`animation-delay: calc(var(--index) * 80ms)`). Nunca montes todo a la vez.
- Movimiento ambiental de fondo: Opcional. Una única mancha de degradado radial muy lenta (`animation-duration: 20s+`, `opacity: 0.02-0.04`) desplazándose detrás de las secciones hero. Debe aplicarse a una capa `position: fixed; pointer-events: none`. Nunca sobre contenedores con scroll.
- Rendimiento: Anima exclusivamente mediante `transform` y `opacity`. Sin propiedades que disparen layout (`top`, `left`, `width`, `height`). Usa `will-change: transform` con moderación y solo en elementos que estén animando activamente.

## 8. Protocolo de Ejecución
Al recibir la tarea de escribir código frontend (HTML, React, Tailwind, Vue) o diseñar un layout:
1. Establece primero el macro-espaciado. Usa padding vertical masivo entre secciones (ej: `py-24` o `py-32` en Tailwind).
2. Restringe el ancho del contenido tipográfico principal a `max-w-4xl` o `max-w-5xl`.
3. Aplica inmediatamente la jerarquía tipográfica personalizada y las variables de color monocromáticas.
4. Asegúrate de que cada tarjeta, divisor y borde se adhiera estrictamente a la regla `1px solid #EAEAEA`.
5. Añade animaciones de entrada por scroll a todos los bloques de contenido principales.
6. Asegúrate de que las secciones tengan profundidad visual mediante imágenes, degradados ambientales o texturas sutiles — sin fondos planos vacíos.
7. Entrega código que refleje esta estética high-end, sin desorden y editorial de forma nativa, sin necesitar ajustes manuales.
