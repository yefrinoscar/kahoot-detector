# kahoot-detector

Detecta si un Excel (`.xlsx`) es un reporte detallado de Kahoot o un consolidado de hackatón y, si es Kahoot, calcula los aciertos de cada jugador.

Extraído del portal de laboratorios de IA, donde se usa para importar los resultados de Kahoot a la clasificación.

## Requisitos

- Node.js 20 o superior
- Dependencias: [`fflate`](https://github.com/101arrowz/fflate) para descomprimir el `.xlsx` y [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) para leer su XML

```bash
npm install
```

## Uso desde la terminal

```bash
node bin/kahoot-detector.js reporte.xlsx
```

Acepta varios archivos a la vez. Por cada uno imprime un JSON. Si un archivo no se puede leer, muestra el error y termina con código 1.

```json
{
  "file": "reporte.xlsx",
  "kind": "kahoot",
  "title": "Quiz Día 2",
  "playedOn": "30 Oct 2026",
  "total": 10,
  "excludedUncertain": 1,
  "players": [
    {"nickname": "ana", "correct": 9, "answered": 10, "total": 10}
  ]
}
```

Para un consolidado de hackatón solo imprime `{"file": "...", "kind": "hackathon"}`.

## Uso como librería

```js
import {readFileSync} from 'node:fs';
import {detectScoreUpload, parseKahoot} from 'kahoot-detector';

const bytes = new Uint8Array(readFileSync('reporte.xlsx'));
if (detectScoreUpload(bytes) === 'kahoot') {
  const {title, total, players} = parseKahoot(bytes);
}
```

Las dos funciones reciben los bytes del archivo como `Uint8Array`. Funcionan en Node y en entornos como Cloudflare Workers, porque no leen del disco.

## Cómo funciona

### 1. Detección: `detectScoreUpload(bytes)` en `src/detect.js`

Abre solo `xl/workbook.xml`, la lista de hojas del Excel, sin leer ninguna celda:

| Hojas del archivo | Resultado |
| --- | --- |
| Alguna hoja como `1 Quiz` o `3 Multiple-select Quiz` | `'kahoot'` |
| Una hoja llamada `GENERAL` (sin distinguir mayúsculas) | `'hackathon'` |
| Hojas de ambos tipos | Error: hay que subir cada reporte por separado |
| Ninguna de las anteriores | Error: reporte no reconocido |

Se detecta por el contenido, así que el nombre del archivo da igual.

### 2. Lectura del Kahoot: `parseKahoot(bytes)` en `src/kahoot.js`

Lee el reporte detallado que exporta Kahoot, que trae una hoja por pregunta. En cada hoja busca tres filas por su texto en la columna A:

- `Answer options`: las opciones de la pregunta
- `Is answer correct?`: `Yes` en las opciones correctas
- `Player` / `Answer`: cabecera; debajo va una fila por jugador con su respuesta

Reglas de puntuación:

- **«No sé» no cuenta como acierto.** Las opciones del estilo «No sé», «No se» o «No estoy seguro», aunque Kahoot las marque como correctas, se quitan de la clave. `excludedUncertain` indica cuántas se quitaron. Si una pregunta se queda sin respuesta válida, se lanza un error.
- **Selección múltiple:** solo hay acierto si el jugador marca exactamente todas las opciones correctas, sin ninguna de más. Kahoot da puntos parciales en estas preguntas; aquí no.
- **Comparación de respuestas:** no distingue mayúsculas, tildes ni espacios repetidos.
- **Totales:** `total` es el número de preguntas y `answered` las que el jugador contestó. Los jugadores se ordenan por aciertos y luego por apodo.
- **Título y fecha:** salen de la hoja `Overview` (primera celda y fila `Played on`). Sin esa hoja, el título es la primera celda de la primera hoja.

### Límites y seguridad

- Archivo de hasta 5 MB y contenido descomprimido de hasta 20 MB.
- Hasta 250 hojas, 200 preguntas y 500 jugadores.
- Solo lee valores de celdas: no ejecuta fórmulas, macros ni relaciones externas.
- Rechaza el XML con `<!DOCTYPE` o `<!ENTITY>`, para evitar ataques de expansión de entidades.
- Rechaza los apodos repetidos dentro de una pregunta y los de más de 100 caracteres.

## Pruebas

```bash
npm test
```

Las pruebas arman Excel mínimos en memoria (`test/helpers.js`), así que no hace falta guardar reportes reales en el repositorio.
