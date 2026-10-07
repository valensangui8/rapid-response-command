# Rapid Response Command

Triage de emergencias con IA. Recibe reportes desordenados (911, 311, SMS, redes, sensores, radio, en cualquier idioma), los convierte en una cola de incidentes priorizada, propone qué recurso mandar y redacta alertas verificadas en varios idiomas. La IA propone y una persona aprueba.

## Arquitectura: dos tipos de IA, cada una para lo suyo

| Capa | Qué hace | Archivo |
|---|---|---|
| **Jev (TypeSafe System One)** | Toma **decisiones** rápidas, tipadas y con probabilidades calibradas: categoría (Choice), gravedad (Score de 0 a 4), riesgo de vida, persona vulnerable y credibilidad (Noul), si es un duplicado (Choice entre los incidentes abiertos) y **verifica las alertas** (Noul: "¿afirma algo que no está en los hechos?") | `src/lib/jev.ts` |
| **LLM (AI Gateway)** | **Genera** texto: extrae resumen, idioma y ubicación aproximada, redacta alertas en varios idiomas y el sitrep para el comandante | `src/lib/llm.ts` |
| **Reglas en código** | Fórmula de prioridad explicable, umbral de revisión humana y asignación greedy del recurso libre más cercano | `src/lib/incidents.ts` |
| **Escenario** | Categorías, ruteo, recursos y reportes de demo. **Es lo que se edita en cada ronda.** | `src/lib/scenario.ts` |

Jev y el LLM corren en paralelo para cada reporte. Si falta una key o una llamada falla, el sistema usa un fallback y la demo nunca se cae.

## Para correrlo
```bash
npm install
vercel env pull .env.local   # trae VERCEL_OIDC_TOKEN para el AI Gateway
echo "TYPESAFE_API_KEY=..." >> .env.local
npm run dev
```

## Cómo adaptarlo en 45 minutos
1. **Minutos 0 a 5:** leer el desafío y elegir el usuario y la decisión crítica.
2. **Minutos 5 a 15:** editar `scenario.ts`. Cambiar `name`/`briefing`, las `categories` (opciones de Jev), el `routing`, los `resources` y unos 15 `reports` de demo. Se le puede pedir a Claude que los genere.
3. Si cambia la pregunta central, editar las preguntas de Jev en `jev.ts`. Por ejemplo: "¿qué refugio le sirve a esta familia?" sería un Choice entre refugios, y "¿necesita intérprete?" un Noul.
4. Ajustar `WEIGHTS` en `incidents.ts` según lo que priorice el desafío.
5. Cambiar textos de la UI en `Dashboard.tsx` si hace falta y desplegar con `vercel deploy --prod`.

## Cómo contarlo (por qué Jev)
- **Probabilidades calibradas en vez de texto:** cada decisión trae su nivel de confianza. Si la confianza es baja, el caso se marca para **revisión humana** (en el mapa aparece con borde punteado y en la cola con la etiqueta *review*).
- **Política explícita:** los pesos de la prioridad están en el código y a la vista. Se pueden cambiar en vivo sin volver a correr el modelo.
- **Contra rumores:** la credibilidad baja la prioridad de un reporte sin borrarlo, y varios reportes que coinciden la suben.
- **Alertas verificadas:** Jev revisa cada alerta generada contra los hechos verificados antes de que salga, y marca ⚠ si encuentra afirmaciones sin respaldo.
