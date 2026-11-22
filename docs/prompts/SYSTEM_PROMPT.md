# System Prompts Activos — CashMet IA y Bear's Reserve

CashMet ya **no utiliza Genkit** ni el prompt genérico inicial. La inteligencia artificial corre directamente contra la API REST de Gemini (`v1beta/models/{modelo}:generateContent` con `responseMimeType: 'application/json'`) mediante dos asistentes especializados y un conjunto de prompts auxiliares de dominio.

---

## 1. Lucía — Contadora personal de CashMet

- **Fuente real**: constante `SISTEMA` en `src/ai/gemini.ts` (invocada desde `interpretarConGemini`).
- **Modelo por defecto**: `gemini-3.1-flash-lite` (configurable con `VITE_GEMINI_MODEL`), con fallback a `gemini-3.5-flash-lite` y `gemini-3.8-flash` (timeout 20 s). Si no hay clave o falla la red, el orquestador (`src/features/chat/interpretar.ts`) degrada al motor NL local (`src/ai/parser/nl.ts` + `src/features/chat/engine.ts`).
- **Contexto inyectado en cada turno**: fecha actual en zona local (`America/Bogota`), lista de cuentas, snapshot financiero en vivo (`src/features/chat/snapshot.ts`: saldos con `[id: ...]`, resumen del mes, deudas, recurrentes, impuestos pendientes con `[id: ...]`, vehículos con `[id: ...]`, patrimonio, nómina, vencimientos y tasas de cambio del día) e historial reciente de conversación.

### Contrato de respuesta y reglas principales
- Responde siempre con un único JSON válido:
  ```json
  {"mensaje": "...", "acciones": [{"accion": "...", "params": {}}]}
  ```
- **Identidad y tono**: contadora colombiana cercana, cálida y práctica; tutea, usa frases claras sin sintaxis Markdown visible (`**`, `#`, etc.) y nunca inventa montos, fechas ni IDs.
- **Múltiples acciones por mensaje**: detecta todas las transacciones de un mensaje y las devuelve como entradas separadas en `acciones`.
- **Multidivisa**: conserva el monto en su moneda original y reporta el código ISO en `moneda` (`USD`, `EUR`, etc.); la app convierte a COP con la tasa vigente (`src/lib/fx.ts`).
- **Acciones soportadas**:
  - `registrar_movimiento` (genera tarjeta de confirmación editable antes de guardar)
  - `transferir` (traslado atómico entre cuentas usando IDs exactos del snapshot; se ejecuta al instante)
  - `consulta_saldos`, `busqueda_movimientos`, `resumen_mes`, `generar_calendario`
  - `pago_deuda`, `pago_nomina`, `pagar_impuesto`
  - `crear_recurrente`, `crear_evento`
  - `investigar_vehiculo`, `crear_vehiculo`, `obtener_vehiculo_completo`, `renovar_soat`, `renovar_tecnomecanica`, `registrar_mantenimiento`
  - `ayuda`
- **Reglas críticas**:
  - Distingue estrictamente `renovar_soat` (seguro obligatorio) vs. `renovar_tecnomecanica` (revisión técnico-mecánica).
  - En análisis financieros ("¿cómo voy?", "analiza mi estado"), responde únicamente en `mensaje` con `acciones: []`.
  - Si faltan cuentas, monto o hay ambigüedad entre varios vehículos/impuestos, pregunta antes de emitir acciones.

### Prompt auxiliar de Lucía: Perito automotriz Colombia
- **Fuente real**: `investigarVehiculoConGeminiAI` en `src/ai/gemini.ts`.
- **Uso**: consulta ficha técnica (tanque en litros y galones, combustible `diesel`/`corriente`/`extra`, rendimiento en montaña colombiana km/gal y nota técnica) usando Google Search Grounding (`llamarGeminiConBusqueda`, con enfriamiento temporal de 5 min ante HTTP 429) y validación numérica estricta de rangos.

---

## 2. GEMA — Oficial de operaciones de Bear's Reserve

- **Fuente real**: constante `SISTEMA_GEMA` y prompts especializados en `src/features/bearsReserve/gemaAI.ts`.
- **Base operativa**: Finca El Guadual, Vereda San Peregrino, Manizales, Caldas (iniciativa comunitaria sin ánimo de lucro).
- **Contexto inyectado en vivo** (`construirSnapshotGema`): guardia actual y turnos del día, personal con horas acumuladas/restricciones, flota habilitada (oculta `[id: ...]` en vehículos no habilitados para evitar tanqueos indebidos), precios vigentes y saldo de tarjeta de combustible, rutas habituales, radar de contingencias vigente, misiones activas y últimas crónicas.

### Contrato de Radio Conversacional (`conversarConGemaAI`)
- Responde siempre con un único JSON válido:
  ```json
  {"respuesta": "...", "acciones": []}
  ```
- **Acciones ejecutables permitidas** (solo bajo petición explícita y validadas contra vehículos habilitados):
  - `{"tipo": "rotar_turnos"}`
  - `{"tipo": "tanquear_vehiculo", "vehiculoId": "ID_EXACTO"}`
  - `{"tipo": "escanear_radar"}`
  - `{"tipo": "actualizar_precios"}`

### Prompts especializados de GEMA (`src/features/bearsReserve/gemaAI.ts`)
1. **Curador de emergencias Colombia (`buscarNoticiasFuentesAbiertasColombia` / `buscarNoticiasVialesRealesAI`)**: filtra noticias reales (<48 h) desde Google Search Grounding o 6 feeds RSS colombianos (La Patria, El Tiempo CO/Regiones/Antioquia/Valle, Caracol Radio), aprobando únicamente emergencias donde Bear's Reserve puede aportar apoyo logístico/humanitario y descartando política, orden público armado, accidentes urbanos menores o notas antiguas.
2. **Precios de combustible (`consultarPreciosCombustibleRealesAI`)**: consulta precios vigentes por galón en COP (corriente, ACPM/diésel, extra) en Manizales/Caldas (CREG / MinMinas) en pipeline de 2 pasos con grounding o fallback limpio JSON.
3. **Generación de llamadas comunitarias veredales (`generarLlamadasComunitariasIA`)**: genera solicitudes rurales realistas en Caldas evitando repetir veredas, temáticas y títulos ya activos en el radar.
4. **Selección táctica de vehículo o convoy (`seleccionarConvoyMisionConIA`)**: compara autonomía real, tipo de vehículo, tracción, desgaste de llantas y personal disponible para asignar de 1 a 3 vehículos con roles complementarios.
5. **Resolución narrativa de misiones (`resolverMisionConIA`)**: cierra la bitácora con resultado (`exito`, `parcial`, `fallida_dificultad`), factor de distancia real acotado por código y crónica humana.
