---
name: clima
description: Obtiene el clima actual y el pronóstico de los próximos días para Lima, Perú (por defecto) o para otra ciudad indicada. Úsalo cuando el usuario pregunte por el clima, la temperatura, si va a llover o el pronóstico.
argument-hint: "[ciudad opcional]"
allowed-tools: Bash(curl *)
---

# Clima local

Consulta el clima con [wttr.in](https://wttr.in), sin API key.

## Pasos

1. Determina la ubicación:
   - Si el usuario pasó una ciudad en `$ARGUMENTS`, úsala (reemplaza espacios por `+`, por ejemplo `Buenos+Aires`).
   - Si no, usa por defecto `Lima,Peru`.

2. Ejecuta la consulta (JSON, en español):

   ```bash
   curl -s --max-time 10 "https://wttr.in/<ubicacion>?format=j1&lang=es"
   ```

   Por defecto queda `https://wttr.in/Lima,Peru?format=j1&lang=es`.

3. Si el comando falla o devuelve algo que no es JSON, informa que no hubo conexión o que la ubicación no se encontró. No inventes datos.

4. Del JSON toma:
   - `nearest_area[0]`: `areaName[0].value` y `country[0].value` (ubicación detectada).
   - `current_condition[0]`: `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `winddir16Point`, `precipMM`, `lang_es[0].value` (descripción; si falta, usa `weatherDesc[0].value`).
   - `weather[0..2]`: `date`, `mintempC`, `maxtempC` y, de `hourly`, la mayor `chanceofrain`.

5. Responde en español, breve, con este formato:

   ```
   📍 <Ciudad, País>
   Ahora: <temp>°C (sensación <FeelsLike>°C), <descripción>
   Humedad <h>% · Viento <v> km/h <dir> · Precipitación <mm> mm

   Próximos días:
   - <fecha>: <min>°C – <max>°C, lluvia hasta <prob>%
   ```

## Notas

- Unidades: °C, km/h y mm.
- Indica siempre la ubicación usada.
- Si el usuario pide algo extra (¿llevo paraguas?, ¿hace frío?), responde con base en los datos obtenidos.
