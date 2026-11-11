# Catálogo de pruebas — CashMet

- **Proyecto:** CashMet (`cashmet@0.1.0`)
- **Rama:** `auditoria/2026-11` (base `develop` @ `e8605f1`)
- **Fecha:** 11 de noviembre de 2026
- **Total de casos diseñados:** 238
- **Ejecución automatizada:** `npm run test` (Vitest 5 + jsdom, `TZ=America/Bogota`)

## Cómo leer este catálogo

Cada caso declara objetivo, prioridad (A = alta, M = media, B = baja), precondiciones/datos, pasos, resultado esperado y estado. **El criterio de aceptación** de todo caso es que se observe exactamente el resultado esperado **sin efectos colaterales** (saldos, documentos o eventos no previstos); cuando existe un criterio adicional se indica en la misma celda.

Estados:

| Estado | Significado |
|---|---|
| `PASS` | Verificado por prueba automatizada o inspección reproducible del código/rules. |
| `PASS (corregido)` | Falló en la línea base (`develop`) y hoy tiene prueba de regresión en verde. |
| `FAIL` | Se ejecutó y el comportamiento observado no cumple lo esperado (riesgo residual aceptado o pendiente). |
| `BLOCKED` | No ejecutable en este entorno: requiere Firebase/Auth real o navegador E2E autorizado. |
| `NOT TESTED` | Diseñado pero no ejecutado (manual, comportamiento no definido o sin arnés). |

> Los casos `BLOCKED` y `NOT TESTED` **no se reportan como aprobados**. Cuando el comportamiento esperado no está definido por el producto se indica `(indefinido)` y se documenta la incertidumbre en lugar de inventar una regla de negocio.

## Entorno y reproducibilidad

```bash
npm ci
npm run test        # 15 suites, 130 pruebas
npm run lint
npx tsc -b
npm run build
npm run coverage
```

- Firestore se sustituye por un doble en memoria (`tests/helpers/fakeFirestore.ts`) que soporta transacciones, lotes, `increment`, `deleteField`, rutas con punto y consultas.
- No se usan credenciales ni datos de producción.
- Los casos de UI, accesibilidad real, PWA y Auth quedan bloqueados por ausencia de navegador gestionado y proyecto Firebase de pruebas.

---

## 1. Autenticación y sesión (10 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| AUT-01 | Inicio de sesión con Google | A | Proyecto Firebase con OAuth habilitado; cuenta de prueba | Abrir app → “Continuar con Google” → elegir cuenta | Se crea sesión, se muestra el panel y no hay errores en consola. | BLOCKED |
| AUT-02 | Inicio de sesión con correo y contraseña válidos | A | Usuario registrado | Ingresar correo/contraseña → enviar | Sesión iniciada y datos del usuario visibles. | BLOCKED |
| AUT-03 | Rechazo de credenciales inválidas | A | Usuario existente | Ingresar contraseña incorrecta | Mensaje de error comprensible; no se crea sesión ni se escriben datos. | BLOCKED |
| AUT-04 | Registro de usuario nuevo | A | Correo no registrado | Completar registro | Se crea la cuenta y la sesión; no se duplican documentos. | BLOCKED |
| AUT-05 | Cierre de sesión | A | Sesión activa | Pulsar “Salir” | Se limpia la sesión y se vuelve a la pantalla de acceso; no quedan tokens en almacenamiento. | BLOCKED |
| AUT-06 | Persistencia de sesión tras recarga | M | Sesión activa | Recargar la pestaña | La sesión continúa sin pedir credenciales de nuevo. | BLOCKED |
| AUT-07 | Protección de rutas sin sesión | A | Sin sesión | Navegar a una ruta interna por URL | Redirección a acceso; no se renderizan datos financieros. | BLOCKED |
| AUT-08 | El token OAuth de Calendar no sobrevive a la recarga | A | Token solicitado en la sesión | Inspeccionar `localStorage` y recargar | No existe token en `localStorage`; tras recargar se debe reconectar Calendar. | PASS (corregido) |
| AUT-09 | Recuperación de contraseña | M | Correo registrado | Solicitar recuperación | Se envía el correo y se informa al usuario; no se revela si el correo existe. | NOT TESTED |
| AUT-10 | Aislamiento entre dos cuentas autenticadas | A | Dos usuarios en el mismo proyecto | Iniciar sesión con A y consultar datos creados por B | A no puede leer ni escribir datos de B. | BLOCKED |

**Trazabilidad:** AUT-08 → H-19. AUT-10 → H-22 (reglas globales; riesgo residual).

---

## 2. Cuentas bancarias (12 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| CTA-01 | Crear cuenta válida | A | Nombre “Ahorros”, saldo 0 | Formulario → Guardar | Documento creado con saldo numérico y aparece en el listado. | NOT TESTED |
| CTA-02 | Rechazar nombre vacío | M | Nombre `""` | Guardar | Validación visible; no se crea documento. | NOT TESTED |
| CTA-03 | Saldo inicial por defecto | M | Alta sin saldo | Guardar y consultar | Saldo = 0 (no `NaN`/`undefined`). | NOT TESTED |
| CTA-04 | Editar nombre sin alterar saldo | M | Cuenta con saldo 100.000 | Cambiar nombre → Guardar | Nombre actualizado y saldo intacto. | NOT TESTED |
| CTA-05 | Eliminar cuenta con movimientos | A | Cuenta con movimientos asociados | Eliminar cuenta | El sistema impide la eliminación o advierte el impacto; no quedan movimientos huérfanos. **(indefinido)** | NOT TESTED |
| CTA-06 | Saldo negativo | M | Cuenta con saldo 0 | Registrar gasto mayor al saldo | El sistema rechaza o advierte el sobregiro; no deja saldo negativo silencioso. **(indefinido)** | NOT TESTED |
| CTA-07 | Transferencia actualiza ambas cuentas | A | Origen 100.000, destino 0 | Transferir 40.000 | Origen 60.000, destino 40.000. | PASS |
| CTA-08 | Gasto descuenta saldo de forma atómica | A | Cuenta 100.000 | Registrar gasto 25.000 | Saldo 75.000 y movimiento creado; si falla uno, no persiste el otro. | PASS |
| CTA-09 | Eliminar movimiento revierte saldo | A | Cuenta 75.000 con gasto de 25.000 | Eliminar el gasto | Saldo vuelve a 100.000. | PASS |
| CTA-10 | Listar solo cuentas activas | B | Una cuenta activa y una inactiva | Abrir selector de cuentas | Solo aparece la activa. **(indefinido)** | NOT TESTED |
| CTA-11 | Formato monetario COP en la UI | B | Saldo 1234567 | Ver listado | Se muestra `$1.234.567` (es-CO), sin decimales. | BLOCKED |
| CTA-12 | Movimiento contra cuenta inexistente | A | ID de cuenta no existente | Crear movimiento | Se rechaza sin escribir movimiento ni saldo. | PASS (corregido) |

**Trazabilidad:** CTA-07/08/09/12 → H-01/H-02/H-08.

---

## 3. Movimientos (25 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| MOV-01 | Registrar gasto | A | Cuenta 100.000 | Gasto 30.000 categoría “comida” | Movimiento creado y saldo 70.000. | PASS |
| MOV-02 | Registrar ingreso | A | Cuenta 100.000 | Ingreso 50.000 | Movimiento creado y saldo 150.000. | PASS |
| MOV-03 | Rechazar monto cero | A | Monto 0 | Crear movimiento | Error de validación; sin escrituras. | PASS (corregido) |
| MOV-04 | Rechazar monto negativo | A | Monto −10.000 | Crear movimiento | Error de validación; sin escrituras. | PASS (corregido) |
| MOV-05 | Rechazar `NaN`/`Infinity` | A | Monto `NaN` e `Infinity` | Crear movimiento | Error de validación; sin escrituras. | PASS (corregido) |
| MOV-06 | Rechazar fecha inválida | A | Fecha `2026-13-40` | Crear movimiento | Error de validación; sin escrituras. | PASS (corregido) |
| MOV-07 | Rechazar concepto vacío | M | Concepto `"   "` | Crear movimiento | Error de validación; sin escrituras. | PASS (corregido) |
| MOV-08 | Rechazar cuenta inexistente | A | Cuenta `no-existe` | Crear movimiento | Error; no se crea movimiento ni se altera saldo. | PASS (corregido) |
| MOV-09 | Categoría desconocida | B | Categoría `"xyz"` | Crear movimiento | Se guarda como “otro” o se rechaza de forma explícita, nunca `undefined`. **(indefinido)** | NOT TESTED |
| MOV-10 | Editar monto reajusta saldo | A | Gasto 30.000 sobre cuenta 70.000 | Cambiar monto a 10.000 | Saldo 90.000; un solo movimiento. | PASS |
| MOV-11 | Cambiar de cuenta traslada el efecto | A | Gasto en cuenta A | Mover a cuenta B | A recupera el monto y B lo descuenta. | PASS |
| MOV-12 | Convertir transferencia en gasto | A | Transferencia A→B de 50.000 | Editar tipo a gasto | Ambos saldos quedan consistentes; no se pierde dinero. | PASS |
| MOV-13 | Edición con monto inválido | A | Movimiento existente | Editar a −1 | Error; saldo y movimiento intactos. | PASS (corregido) |
| MOV-14 | Eliminar gasto revierte saldo | A | Gasto de 30.000 | Eliminar | Saldo restaurado y documento eliminado. | PASS |
| MOV-15 | Eliminar ingreso revierte saldo | A | Ingreso de 50.000 | Eliminar | Saldo restaurado y documento eliminado. | PASS |
| MOV-16 | Eliminar transferencia revierte ambos lados | A | Transferencia A→B | Eliminar | Se descuenta de B y se devuelve a A. | PASS |
| MOV-17 | Listar últimos N movimientos | M | 30 movimientos | `listarTodosLosMovimientos(10)` | Exactamente 10, los más recientes primero. | PASS (corregido) |
| MOV-18 | Orden descendente por fecha | M | Fechas desordenadas | Listar | Orden `fecha` descendente. | PASS |
| MOV-19 | Filtrar por rango de fechas | M | Movimientos en octubre y noviembre | Filtrar 01–30 nov | Solo aparecen los de noviembre. | BLOCKED |
| MOV-20 | Filtrar por categoría | B | Varias categorías | Seleccionar “transporte” | Solo aparecen los de transporte. | BLOCKED |
| MOV-21 | Exportar CSV con fecha local | M | Movimiento del 10/11 23:30 en Bogotá | Exportar | La fecha exportada es `2026-11-10`, no la UTC siguiente. | PASS (corregido) |
| MOV-22 | CSV con comas/comillas en el concepto | B | Concepto `Pago "luz", casa` | Exportar | Campos escapados correctamente; el CSV sigue siendo válido. | NOT TESTED |
| MOV-23 | Confirmación antes de eliminar | M | Movimiento existente | Pulsar eliminar | Se pide confirmación y se puede cancelar sin cambios. | BLOCKED |
| MOV-24 | Fecha futura | B | Fecha +30 días | Crear movimiento | Se permite o se advierte de forma explícita. **(indefinido)** | NOT TESTED |
| MOV-25 | El resumen mensual excluye transferencias | A | Un gasto y una transferencia | Pedir resumen del mes | El gasto suma; la transferencia no infla “gastos”. | PASS (corregido) |

**Trazabilidad:** MOV-03…08 → H-07/H-08; MOV-13/17 → H-02/H-35; MOV-21 → H-17; MOV-25 → H-26.

---

## 4. Transferencias (10 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| TRF-01 | Transferencia básica | A | A 100.000, B 0 | Transferir 40.000 | A 60.000, B 40.000 y un solo movimiento. | PASS |
| TRF-02 | Rechazar origen = destino | A | A 100.000 | Transferir A→A | Error; saldos intactos. | PASS (corregido) |
| TRF-03 | Rechazar saldo insuficiente | A | A 10.000 | Transferir 50.000 | Error; A y B intactos. | PASS (corregido) |
| TRF-04 | Destino inexistente | A | Destino `no-existe` | Transferir | No se descuenta del origen (atomicidad). | PASS (corregido) |
| TRF-05 | Dos transferencias concurrentes | A | A 100.000; dos envíos de 80.000 | Ejecutar en paralelo | Solo una prospera; nunca saldo negativo. | PASS (corregido) |
| TRF-06 | Monto inválido | A | Monto 0 o negativo | Transferir | Error; sin escrituras. | PASS (corregido) |
| TRF-07 | No cuenta como gasto | M | Transferencia del mes | Ver resumen | No incrementa gastos ni ingresos. | PASS (corregido) |
| TRF-08 | Editar transferencia | M | Transferencia 40.000 | Cambiar monto a 30.000 | Origen 70.000, destino 30.000. | PASS |
| TRF-09 | Eliminar transferencia | A | Transferencia existente | Eliminar | Ambos saldos se revierten. | PASS |
| TRF-10 | Visualización origen/destino en UI | B | Transferencia existente | Abrir detalle | Se muestran ambas cuentas y el monto una sola vez. | BLOCKED |

**Trazabilidad:** TRF-02…06 → H-03; TRF-07 → H-26.

---

## 5. Deudas (14 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| DEU-01 | Pago descuenta deuda y cuenta | A | Deuda 500.000; cuenta 300.000; cuota 100.000 | Registrar pago | Deuda 400.000, cuenta 200.000, movimiento creado. | PASS (corregido) |
| DEU-02 | Cerrar deuda al llegar a cero | A | Deuda 100.000; cuenta 200.000 | Pagar 100.000 | Deuda con saldo 0 y `estado = pagada`. | PASS (corregido) |
| DEU-03 | Rechazar sobrepago | A | Deuda 100.000 | Pagar 150.000 | Error; deuda y cuenta intactas. | PASS (corregido) |
| DEU-04 | Rechazar pago sin fondos | A | Cuenta 10.000; cuota 50.000 | Pagar | Error; sin movimientos ni cambios. | PASS (corregido) |
| DEU-05 | Rechazar cuenta inexistente | A | Cuenta `no-existe` | Pagar | Error; deuda intacta. | PASS (corregido) |
| DEU-06 | Rechazar monto inválido | A | Monto 0/−1/`NaN` | Pagar | Error; sin escrituras. | PASS (corregido) |
| DEU-07 | Deuda inexistente o ya pagada | A | ID inválido / estado pagada | Pagar | Error; no se crea movimiento. | PASS (corregido) |
| DEU-08 | Pagos concurrentes | A | Deuda 100.000; dos pagos de 80.000 | Ejecutar en paralelo | Solo uno prospera; nunca saldo negativo. | PASS (corregido) |
| DEU-09 | Mensaje al cerrar deuda en el chat | M | Deuda que queda en 0 | Pagar desde el chat | El chat informa cierre y saldo 0, no un saldo viejo. | PASS (corregido) |
| DEU-10 | Mensaje de pago parcial | M | Deuda que queda en 400.000 | Pagar 100.000 | El chat informa el saldo restante real (400.000) y el resultado `ok`. | PASS (corregido) |
| DEU-11 | Última cuota mayor al saldo | M | Saldo 30.000; cuota programada 50.000 | Ejecutar automatización | Se paga solo el saldo o se rechaza con mensaje claro; nunca sobrepago. **(indefinido)** | NOT TESTED |
| DEU-12 | Crear deuda valida monto y fecha | M | Monto negativo / fecha inexistente | Guardar | Validación visible; sin documento. | NOT TESTED |
| DEU-13 | Editar deuda no altera pagos históricos | M | Deuda con pagos | Cambiar cuota | Los movimientos históricos no se modifican. | NOT TESTED |
| DEU-14 | Eliminar deuda con pagos | B | Deuda con pagos | Eliminar | Se advierte y los movimientos se conservan. **(indefinido)** | NOT TESTED |

**Trazabilidad:** DEU-01…08 → H-04; DEU-09/10 → H-10/H-27.

---

## 6. Nómina (14 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| NOM-01 | Pago de base + adicional | A | Base 2.000.000, adicional 200.000, cuenta 3.000.000 | Pagar | Cuenta 800.000 y un movimiento por 2.200.000. | PASS |
| NOM-02 | Rechazar pago sin fondos | A | Cuenta 100.000 | Pagar 2.200.000 | Error; cuenta y nómina intactas. | PASS |
| NOM-03 | Pagos concurrentes | A | Cuenta 3.000.000; dos pagos simultáneos | Ejecutar en paralelo | Solo uno descuenta; nunca doble pago. | PASS (corregido) |
| NOM-04 | Actualización parcial | A | Nómina con base y adicional | Actualizar solo `cargo` | Se conservan base, adicional y total; no se pone el salario en 0. | PASS (corregido) |
| NOM-05 | Recalcular total al cambiar base | A | Base 2.000.000, adicional 200.000 | Cambiar base a 2.500.000 | Total 2.700.000. | PASS (corregido) |
| NOM-06 | Rechazar salario negativo | A | Base −1 | Guardar | Error; sin cambios. | PASS (corregido) |
| NOM-07 | Salario base cero | M | Base 0 | Guardar/pagar | Se rechaza el pago; el guardado se define explícitamente. **(indefinido)** | NOT TESTED |
| NOM-08 | No pagar dos veces el mismo periodo | A | Nómina ya pagada en el mes | Pagar de nuevo desde el chat (segunda invocación manual) | No se descuenta dos veces; se informa que ya fue pagado. La ruta automática sí lo evita; el repo y el chat no. | FAIL (riesgo residual) |
| NOM-09 | Evento de calendario con día 31 | M | Día de pago 31 | Generar eventos de febrero | Evento el 28/29 de febrero, no el 3 de marzo. | PASS (corregido) |
| NOM-10 | 29 de febrero en año bisiesto | M | Día 29, año 2024 | Generar evento | Evento el 29/02/2024. | PASS |
| NOM-11 | No generar eventos pasados del mes actual | M | Día de pago 5; hoy 11 | Generar eventos | No crea el evento del 5; sí los de meses futuros. | PASS (corregido) |
| NOM-12 | Total mostrado en UI | M | Base y adicional | Abrir nómina | El total visible coincide con base + adicional. | BLOCKED |
| NOM-13 | Adicional negativo | M | Adicional −100 | Guardar | Validación; sin cambios. | NOT TESTED |
| NOM-14 | Pago con cuenta inexistente | A | `cuentaBancoId` inválido | Pagar | Error `sinCuenta`; sin movimiento. | NOT TESTED |

**Trazabilidad:** NOM-03/05/06 → H-05/H-06; NOM-09/11 → H-16.

---

## 7. Gastos recurrentes (12 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| REC-01 | Generar el gasto del mes una sola vez | A | Recurrente activo, día 10 | Ejecutar dos veces | Un solo movimiento por mes. | PASS |
| REC-02 | Respetar `fechaFin` | A | Fin 2026-03-31; ejecutar abril | Generar | No se crea movimiento en abril. | PASS (corregido) |
| REC-03 | Respetar `fechaInicio` | A | Inicio 2026-12-01 | Generar en noviembre | No se crea movimiento antes del inicio. | PASS |
| REC-04 | Periodicidad bimestral | M | Periodicidad 2 meses | Generar meses consecutivos | Solo genera en meses pares según inicio. | PASS |
| REC-05 | Recortar día de vencimiento | M | Día 31 | Generar febrero | Movimiento con fecha 28/29 de febrero. | PASS |
| REC-06 | Inactivo o sin cuenta | M | `activo=false` / sin `cuentaBancoId` | Generar | No crea movimientos. | PASS |
| REC-07 | Valor no positivo | A | Valor 0 / −5 / `NaN` | Generar | Se omite; no crea movimientos en cero. | PASS (corregido) |
| REC-08 | Idempotencia tras recarga | A | Recurrente ya generado | Recargar y reejecutar | No duplica el gasto. | PASS |
| REC-09 | Cuenta eliminada | M | Recurrente apunta a cuenta borrada | Generar | Error controlado y visible; no crea movimiento huérfano. | NOT TESTED |
| REC-10 | Listar y editar recurrentes | B | Uno activo | Abrir módulo | Se lista y edita sin perder campos. | BLOCKED |
| REC-11 | Categoría del movimiento generado | B | Recurrente “Internet” | Generar | Movimiento con categoría coherente y concepto del recurrente. | PASS |
| REC-12 | `fechaFin` anterior a `fechaInicio` | B | Inicio 2026-06, fin 2026-05 | Generar | No genera y advierte configuración inválida. | NOT TESTED |

**Trazabilidad:** REC-02/07 → H-09.

---

## 8. Impuestos (12 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| IMP-01 | Pagar impuesto | A | Impuesto 200.000; cuenta 500.000 | Pagar | `pagado=true`, cuenta 300.000, movimiento creado. | PASS |
| IMP-02 | No pagar dos veces | A | Impuesto ya pagado | Volver a pagar | Error; sin segundo movimiento ni descuento. | PASS |
| IMP-03 | Sin fondos | A | Cuenta 10.000 | Pagar 200.000 | Error; sin cambios. | PASS |
| IMP-04 | Sin cuenta asociada | M | Impuesto sin `cuentaBancoId` | Pagar | Se marca pagado sin descontar saldo y lo informa. | PASS |
| IMP-05 | Pagos concurrentes | A | Impuesto pendiente; dos pagos simultáneos | Ejecutar en paralelo | Solo uno descuenta. | PASS (corregido) |
| IMP-06 | Valor cero | M | Valor 0 | Pagar | Error; no crea movimiento en cero. | PASS |
| IMP-07 | Impuesto inexistente | A | ID inválido | Pagar | Error controlado; sin escrituras. | NOT TESTED |
| IMP-08 | Valor negativo | M | Valor −1 | Pagar | Error de validación. | NOT TESTED |
| IMP-09 | Estado pagado/pendiente en UI | M | Un pagado y uno pendiente | Abrir módulo | Se distinguen visualmente y los totales cuadran. | BLOCKED |
| IMP-10 | Editar impuesto pagado | B | Impuesto pagado | Cambiar valor | No permite un segundo pago ni descuadra la cuenta. | PASS |
| IMP-11 | Eliminar impuesto pagado | B | Impuesto pagado con movimiento | Eliminar | El movimiento histórico se conserva. **(indefinido)** | NOT TESTED |
| IMP-12 | Impuesto vencido | B | Fecha de vencimiento pasada | Abrir módulo | Se muestra como vencido. | BLOCKED |

**Trazabilidad:** IMP-05 → H-05.

---

## 9. Vehículos y mantenimiento (16 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| VEH-01 | Mensualizar SOAT, TM y STR | M | SOAT 600.000 anual, TM 300.000, STR 200.000 | Calcular detalle | Suma mensual correcta (50.000 + 25.000 + 16.667 aprox.). | PASS |
| VEH-02 | STR desactivado | B | `tiene=false` | Calcular | No suma STR. | PASS |
| VEH-03 | Editar conserva SOAT | A | Vehículo con SOAT | Cambiar solo placa | Los campos de SOAT se conservan. | PASS (corregido) |
| VEH-04 | Editar conserva mantenimiento y tareas | A | Vehículo con tareas | Cambiar kilometraje | Tareas y fechas se conservan. | PASS (corregido) |
| VEH-05 | Editar conserva campos superiores | M | Vehículo con marca/modelo | Cambiar un campo | No se pierden los demás. | PASS |
| VEH-06 | Borrar bloque anidado con `null` | M | Vehículo con SOAT | Enviar `soat: null` | El bloque se elimina del documento, no queda `null`. | PASS (corregido) |
| VEH-07 | Recalcular gasto mensual tras editar | M | Vehículo con gastos | Cambiar SOAT | Gasto mensual recalculado con datos mezclados. | PASS |
| VEH-08 | Actualizar kilometraje | M | Vehículo con tareas | Registrar km | Se actualiza km y se conservan tareas. | PASS |
| VEH-09 | Próximo servicio sin desbordar mes | M | Servicio el 31 | Registrar con mes corto | Próxima fecha en el último día real del mes. | PASS |
| VEH-10 | Crear con valores por defecto | M | Solo placa/marca | Crear | Documento válido y gasto calculado. | PASS |
| VEH-11 | Placa duplicada | B | Placa existente | Crear | Se rechaza o advierte. **(indefinido)** | NOT TESTED |
| VEH-12 | Eliminar vehículo | B | Vehículo con movimientos | Eliminar | Se advierte; los movimientos se conservan. **(indefinido)** | NOT TESTED |
| VEH-13 | Tarea con costo sin cuenta | A | Tarea con costo; sin cuenta asociada | Guardar desde el chat | No se guarda la tarea hasta elegir cuenta; mensaje claro. | PASS (corregido) |
| VEH-14 | Editar SOAT con fecha inválida | M | Fecha `2026-02-30` | Guardar | Validación; sin cambios. | NOT TESTED |
| VEH-15 | Vehículo sin SOAT | B | Sin bloque SOAT | Abrir detalle | Cálculo no rompe y muestra 0 en ese concepto. | NOT TESTED |
| VEH-16 | Total de gastos en UI | B | Dos vehículos | Abrir módulo | Suma correcta y coherente con el detalle. | BLOCKED |

**Trazabilidad:** VEH-03/04/06 → H-30/H-31; VEH-13 → H-28.

---

## 10. Propiedades (8 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| PRO-01 | Actualización conserva impuestos | A | Propiedad con `impuestos.predial` | Cambiar dirección | El bloque `impuestos` se conserva. | PASS |
| PRO-02 | Borrar predial con `null` | M | Propiedad con predial | Enviar `impuestos: {predial: null}` | El campo se elimina, no queda `null`. | PASS (corregido) |
| PRO-03 | Crear con los campos recibidos | M | Datos completos | Crear | Documento con todos los campos y tipos correctos. | PASS |
| PRO-04 | Crear sin canon | M | Canon vacío | Crear | Validación o valor 0 explícito; nunca `NaN`. **(indefinido)** | NOT TESTED |
| PRO-05 | Editar canon | B | Propiedad con canon | Cambiar canon | Se actualiza sin perder otros bloques. | NOT TESTED |
| PRO-06 | Eliminar propiedad | B | Propiedad existente | Eliminar | Se elimina el documento; no borra movimientos históricos. **(indefinido)** | NOT TESTED |
| PRO-07 | Editar otro campo no borra anidados | M | Predial y otros impuestos | Cambiar `notas` | Ambos bloques permanecen. | PASS |
| PRO-08 | Rentabilidad en UI | B | Propiedad con canon y gastos | Abrir detalle | Cálculo coherente con los datos mostrados. | BLOCKED |

**Trazabilidad:** PRO-02 → H-31.

---

## 11. Calendario (12 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| CAL-01 | Nómina día 31 en mes corto | M | Nómina día 31 | Generar febrero | Evento el último día real de febrero. | PASS (corregido) |
| CAL-02 | Nómina 29 de febrero bisiesto | M | Día 29, año 2024 | Generar | Evento el 29/02/2024. | PASS |
| CAL-03 | No generar eventos pasados del mes | M | Hoy 11, evento día 5 | Generar | No crea el evento del 5. | PASS (corregido) |
| CAL-04 | Cuota de deuda día 31 | M | Deuda día 31 | Generar febrero | Evento el último día real. | PASS (corregido) |
| CAL-05 | Omitir deudas inactivas | M | Deuda pagada | Generar | No crea evento. | PASS |
| CAL-06 | Guardar sin duplicar | A | Evento ya existente | Guardar de nuevo | Un solo documento por evento. | PASS |
| CAL-07 | Listar activos, ordenados y con límite | M | Varios eventos | Listar | Excluye inactivos, ordena por fecha y respeta el máximo. | PASS |
| CAL-08 | Editar evento | B | Evento existente | Cambiar título/fecha | Se actualiza sin duplicar. | BLOCKED |
| CAL-09 | Eliminar evento | B | Evento existente | Eliminar | Se elimina y no reaparece al regenerar el mismo día. | BLOCKED |
| CAL-10 | Evento con hora vs. todo el día | B | Ambos tipos | Ver detalle | Se muestran con la semántica correcta. | NOT TESTED |
| CAL-11 | Sincronización con Google Calendar | M | Token en memoria | Sincronizar | Usa el token de sesión; no lee tokens persistidos. | PASS (corregido) |
| CAL-12 | Sincronización sin duplicar | M | Evento ya sincronizado | Sincronizar dos veces | No crea duplicados en Google. | NOT TESTED |

**Trazabilidad:** CAL-01/03/04 → H-16; CAL-11 → H-19.

---

## 12. Backup (10 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| BAK-01 | Exportar colecciones permitidas | A | Datos en varias colecciones | Exportar | JSON con las 11 colecciones y el `id` de cada documento. | PASS |
| BAK-02 | Importar documentos válidos | A | Backup generado por la app | Importar | Documentos restaurados con sus IDs. | PASS |
| BAK-03 | Rechazar colección no permitida | A | Backup con `usuarios_maliciosos` | Importar | Error y **cero** escrituras. | PASS (corregido) |
| BAK-04 | Rechazar estructura inválida | A | Documento sin `id` o con tipo incorrecto | Importar | Error antes de escribir; nada parcial. | PASS (corregido) |
| BAK-05 | Rechazar payload no objeto | A | `[]`, `null`, `"texto"` | Importar | Error controlado; sin escrituras. | PASS (corregido) |
| BAK-06 | Reimportación idempotente | M | Mismo backup dos veces | Importar dos veces | Sobrescribe por ID; no duplica. | PASS |
| BAK-07 | Límite de documentos | M | Backup > 20.000 docs | Importar | Se rechaza antes de escribir. | PASS (corregido) |
| BAK-08 | Falla a mitad de la importación | M | Error simulado en el segundo lote | Importar | No quedan colecciones a medio restaurar (o se informa el estado). | NOT TESTED |
| BAK-09 | Cobertura de colecciones | M | Revisar lista de exportación | Inspeccionar código | Incluye todas las colecciones de negocio y excluye `users`. | PASS |
| BAK-10 | Descarga del archivo en UI | B | Backup listo | Pulsar “Exportar” | Se descarga un JSON válido con nombre y fecha local. | BLOCKED |

**Trazabilidad:** BAK-03/04/05/07 → H-20/H-21.

---

## 13. Chat, parser y motor local (25 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| CHT-01 | Gasto simple | A | Motor local (sin Gemini) | “Gasté 45.000 en mercado ayer” | Borrador gasto 45.000, categoría mercado, fecha de ayer. | PASS |
| CHT-02 | Varias transacciones en un mensaje | M | Motor local | “Pagué 20.000 de taxi y recibí 500.000 de sueldo” | Dos acciones: gasto e ingreso, sin mezclar montos. | PASS |
| CHT-03 | Conversión de moneda no crea movimiento | A | Motor local | “¿Cuánto son 100 dólares en pesos?” | Intención `consulta_conversion`; sin borrador ni movimiento. | PASS (corregido) |
| CHT-04 | Transferencia por nombre de cuentas | A | Cuentas “Ahorros” y “Nequi” | “Pasé 100.000 de Ahorros a Nequi” | Transferencia con ambas cuentas y monto. | PASS |
| CHT-05 | Una sola cuenta no inventa transferencia | A | Solo “Ahorros” | “Pasé 100.000 a Nequi” | No crea transferencia; pide aclaración o trata como gasto. | PASS |
| CHT-06 | Recordatorio día 31 en febrero | M | Fecha base febrero | “Recuérdame pagar el 31” | Fecha el último día real de febrero. | PASS (corregido) |
| CHT-07 | Resumen del mes | M | Movimientos de noviembre | “¿Cómo va el mes?” | Resumen con totales del mes pedido. | PASS |
| CHT-08 | Pago de deuda tiene prioridad | M | Deuda “Tarjeta” | “Pagué la cuota de la tarjeta” | Acción `pago_deuda`, no gasto genérico. | PASS |
| CHT-09 | Pago de nómina | M | Nómina configurada | “Págame la nómina” | Acción `pago_nomina`. | PASS |
| CHT-10 | Estimación SOAT/TM | B | Vehículo sin datos | “¿Cuánto es el SOAT?” | Estimación con supuestos explícitos, sin escribir datos. | PASS |
| CHT-11 | Montos con separadores colombianos | A | “1.234.500”, “$ 45.000” | `parseMontoCO` | 1234500 y 45000. | PASS |
| CHT-12 | Sufijos k y millones | M | “45k”, “2 millones” | `parseMontoCO` | 45000 y 2000000. | PASS |
| CHT-13 | Cantidad sin unidad monetaria | M | “compré 3 panes” | `parseMontoCO` | No interpreta 3 como monto. | PASS |
| CHT-14 | Redondeo a pesos | B | “45.000,60” | `parseMontoCO` | 45001 (entero). | PASS |
| CHT-15 | Año explícito | A | “15 de marzo de 2025” | `parseFecha` | 2025-03-15. | PASS (corregido) |
| CHT-16 | Año actual por defecto | M | “15 de marzo” | `parseFecha` | Año actual. | PASS |
| CHT-17 | Fecha imposible | A | “31/02/2026” | `parseFecha` | Rechaza y usa hoy como respaldo; nunca 03/03. | PASS (corregido) |
| CHT-18 | 29 de febrero | M | “29/02/2025” y “29/02/2024” | `parseFecha` | Rechaza 2025; acepta 2024. | PASS (corregido) |
| CHT-19 | Fechas relativas | M | “ayer”, “hoy”, “mañana” | `parseFecha` | Desplazamiento correcto en zona local. | PASS |
| CHT-20 | Fechas ISO | M | “2026-11-10” | `parseFecha` | 2026-11-10. | PASS (corregido) |
| CHT-21 | Detectar ingresos | A | “Recibí 500.000” | `parseTipo` | `ingreso`. | PASS (corregido) |
| CHT-22 | Detectar gastos | A | “Pagué 20.000” | `parseTipo` | `gasto`. | PASS |
| CHT-23 | Clasificar categorías | M | mercado, taxi, arriendo, luz | `parseCategoria` | Categorías esperadas. | PASS |
| CHT-24 | Limpiar concepto | M | “Gasté 45.000 en mercado” | `limpiarConcepto` | “mercado”, sin monto ni verbo. | PASS (corregido) |
| CHT-25 | Concepto nunca vacío | M | “Gasté 45.000” / texto con acentos | `limpiarConcepto` | Devuelve un concepto útil y normaliza acentos/mayúsculas. | PASS |

**Trazabilidad:** CHT-03 → H-29; CHT-06 → H-15; CHT-15…21/24 → H-11…H-14.

---

## 14. Bear's Reserve (18 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| BRS-01 | Distancia Haversine | M | Manizales–Bogotá | Calcular | Valor dentro del rango geográfico esperado (150–180 km). | PASS |
| BRS-02 | Sinuosidad por terreno | M | Misma ruta, trocha vs. pavimento | Calcular | Trocha produce más distancia efectiva. | PASS |
| BRS-03 | Ida y vuelta desde base | M | Ruta de ida | Calcular | Duplica la distancia de ida. | PASS |
| BRS-04 | Ralentí no negativo | M | Tiempo de ralentí 0 y negativo | Calcular | Galones de ralentí ≥ 0. | PASS (corregido) |
| BRS-05 | Galones y desgaste | M | Distancia y terreno | Calcular | Galones y desgaste finitos y positivos. | PASS |
| BRS-06 | Combustible por vehículo | M | Camión y carro | Calcular | Camión diésel; carro corriente. | PASS |
| BRS-07 | Rendimiento mínimo | B | Terreno extremo | Calcular | Rendimiento efectivo ≥ 3 km/gal. | PASS |
| BRS-08 | Precios de combustible | B | Consulta de precios | Calcular | Precios positivos y fuente declarada. | PASS |
| BRS-09 | Rutas automáticas una sola vez | A | Portal montado dos veces | Ejecutar verificación | La segunda ejecución no repite rutas (mutex). | PASS (corregido) |
| BRS-10 | Misión comunitaria idempotente | M | Misión ya completada | Completar de nuevo | No duplica recompensa ni historial. | PASS (corregido) |
| BRS-11 | Liquidar combustible contra CashMet | M | Ruta con consumo | Liquidar | Crea un movimiento coherente y no duplica al reintentar. | PASS |
| BRS-12 | Datos demo sin Firestore | B | Sin vehículos/nómina | Abrir portal | Usa datos demo sin escribir en Firestore. | PASS |
| BRS-13 | Persistencia local | M | Ruta completada | Recargar | El estado persiste en `localStorage`. | BLOCKED |
| BRS-14 | Carga del portal | M | Sesión válida | Abrir módulo | Sin errores de render ni pantalla en blanco. | BLOCKED |
| BRS-15 | Misión repetida | M | Recompensa ya entregada | Repetir | No se entrega dos veces. | PASS |
| BRS-16 | Ruta de distancia cero | B | Origen = destino | Calcular | No divide por cero; resultado 0 controlado. | NOT TESTED |
| BRS-17 | Historial ordenado | B | Varias rutas | Abrir historial | Orden cronológico descendente. | NOT TESTED |
| BRS-18 | Mapa e indicadores | B | Datos demo | Abrir portal | Indicadores coinciden con el detalle. | BLOCKED |

**Trazabilidad:** BRS-04 → H-32; BRS-09/10 → H-33.

---

## 15. Seguridad (12 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| SEG-01 | Denegar rutas no declaradas | A | Reglas desplegadas | Leer/escribir ruta arbitraria | `permission_denied`. | PASS |
| SEG-02 | Aislar finanzas por usuario | A | Dos usuarios autenticados | B lee colección de A | B no puede leer ni escribir. | FAIL (riesgo residual) |
| SEG-03 | Aislar archivos por usuario | A | Dos usuarios | B descarga archivo de A | `permission_denied`. | PASS |
| SEG-04 | Sin XSS por HTML crudo | A | Código fuente | Buscar `dangerouslySetInnerHTML` | No se usa en la app. | PASS |
| SEG-05 | Sin `eval`/`Function` dinámico | A | Código fuente | Buscar `eval(`/`new Function` | No se usa. | PASS |
| SEG-06 | Token OAuth no persistido | A | Sesión con Calendar | Inspeccionar almacenamiento | Sin token en `localStorage`/`sessionStorage`. | PASS (corregido) |
| SEG-07 | Importación con lista blanca | A | Backup manipulado | Importar colección arbitraria | Rechazo antes de escribir. | PASS (corregido) |
| SEG-08 | Datos financieros en almacenamiento local | M | Conversación con montos | Inspeccionar `localStorage` | Los datos sensibles no quedan persistidos sin control. | FAIL (riesgo aceptado) |
| SEG-09 | Clave de IA fuera del bundle | A | Build de producción | Buscar la clave en `dist/` | La clave no viaja al cliente. | FAIL (riesgo aceptado) |
| SEG-10 | Dependencias sin vulnerabilidades altas | M | `npm audit` | Ejecutar auditoría | 0 high/critical. | FAIL (17 high) |
| SEG-11 | Cabeceras de seguridad | M | Hosting | Revisar CSP/HSTS/XFO | Cabeceras presentes y razonables. | NOT TESTED |
| SEG-12 | Logout limpia credenciales | M | Sesión con Google | Cerrar sesión | Token en memoria descartado; no se reutiliza. | PASS |

**Trazabilidad:** SEG-02 → H-22; SEG-06 → H-19; SEG-08 → H-24; SEG-09 → H-23; SEG-10 → H-25.

---

## 16. Accesibilidad (10 casos, WCAG 2.2 AA)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| ACC-01 | Idioma del documento | A | `index.html` | Inspeccionar `<html lang>` | `lang="es"`. | PASS (corregido) |
| ACC-02 | Contraste de texto | A | Tema claro/oscuro | Medir contraste | ≥ 4.5:1 texto normal y ≥ 3:1 texto grande. | BLOCKED |
| ACC-03 | Navegación por teclado | A | App cargada | Tabular por toda la app | Todos los controles alcanzables y operables. | BLOCKED |
| ACC-04 | Foco visible | A | Navegación por teclado | Tabular | Indicador de foco visible en cada control. | BLOCKED |
| ACC-05 | Etiquetas de formulario | A | Formularios CRUD | Inspeccionar con árbol de accesibilidad | Todo campo tiene nombre accesible. | BLOCKED |
| ACC-06 | Anuncios del chat | M | Lector de pantalla | Enviar mensaje | Respuestas y errores se anuncian (`aria-live`). | BLOCKED |
| ACC-07 | Zoom 200 % | M | Navegador al 200 % | Revisar layout | Sin pérdida de contenido ni solapamientos. | BLOCKED |
| ACC-08 | Errores asociados al campo | M | Envío inválido | Inspeccionar | El error se asocia al campo (`aria-describedby`) y se anuncia. | BLOCKED |
| ACC-09 | Nombre accesible en botones icónicos | M | Botones de icono | Inspeccionar | `aria-label` o texto visible. | BLOCKED |
| ACC-10 | Movimiento reducido | B | `prefers-reduced-motion` | Activar preferencia | Animaciones no esenciales desactivadas. | BLOCKED |

**Trazabilidad:** ACC-01 → H-34. El resto no pudo ejecutarse sin navegador (limitación declarada).

---

## 17. Rendimiento (8 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| REN-01 | Build de producción | A | Repo limpio | `npm run build` | Build exitoso; advertencia de chunk > 500 kB documentada. | PASS |
| REN-02 | Listado de movimientos acotado | A | 30 movimientos | `listarTodosLosMovimientos(10)` | Consulta con `orderBy` + `limit`, no descarga todo. | PASS (corregido) |
| REN-03 | Índices de Firestore | M | Consultas compuestas | Ejecutar contra proyecto real | Sin errores de índice faltante. | NOT TESTED |
| REN-04 | Tamaño de carga inicial | M | Build de producción | Medir bundle y red | Chunk principal identificado y presupuesto definido. | NOT TESTED |
| REN-05 | Caché PWA | M | Primera visita | Recargar sin red | Assets y shell servidos desde caché. | BLOCKED |
| REN-06 | Listas largas | B | 1.000 movimientos | Abrir listado | Scroll fluido; sin bloqueo perceptible. | NOT TESTED |
| REN-07 | Respuesta del chat | B | Mensaje con Gemini | Medir latencia | Indicador de carga y UI no bloqueada. | BLOCKED |
| REN-08 | Backup masivo por lotes | M | 5.000 documentos | Importar | Escrituras en lotes de 400 sin exceder límites. | PASS |

**Trazabilidad:** REN-02 → H-35; REN-01 → advertencia de tamaño de chunk.

---

## 18. Integridad de datos (10 casos)

| ID | Objetivo | P | Precondiciones / datos | Pasos | Resultado esperado y criterio | Estado |
|---|---|---|---|---|---|---|
| INT-01 | Gasto + saldo atómicos | A | Cuenta 100.000 | Fallo simulado tras crear movimiento | No queda movimiento sin descuento ni descuento sin movimiento. | PASS (corregido) |
| INT-02 | Edición + saldo atómicos | A | Movimiento existente | Editar monto | Un solo estado final consistente. | PASS |
| INT-03 | Borrado + reverso atómicos | A | Movimiento existente | Eliminar | Movimiento y saldo se revierten juntos. | PASS |
| INT-04 | Transferencia atómica | A | Dos cuentas | Fallo en el segundo lado | Ningún lado se modifica. | PASS (corregido) |
| INT-05 | Concurrencia de transferencias | A | Saldo justo para una | Dos transferencias simultáneas | Solo una; saldo nunca negativo. | PASS (corregido) |
| INT-06 | Concurrencia de pagos de deuda | A | Deuda y cuenta ajustadas | Dos pagos simultáneos | Sin doble descuento ni sobregiro. | PASS (corregido) |
| INT-07 | Concurrencia de pagos de nómina | A | Cuenta ajustada | Dos pagos simultáneos | Un solo descuento. | PASS (corregido) |
| INT-08 | Concurrencia de impuestos | A | Impuesto pendiente | Dos pagos simultáneos | Un solo descuento y un solo movimiento. | PASS (corregido) |
| INT-09 | Saneamiento de payloads | M | `undefined`, `""`, objetos vacíos | Guardar | Firestore no recibe `undefined`; ceros y `false` se conservan. | PASS |
| INT-10 | Fechas de negocio en zona local | A | Bogotá, 23:30 | Registrar/exportar | La fecha es la local, no la UTC del día siguiente. | PASS (corregido) |

**Trazabilidad:** INT-01…08 → H-01…H-05; INT-09 → `limpio`; INT-10 → H-17.

---

## 19. Resumen de ejecución

| Área | Casos | PASS | PASS (corregido) | FAIL | BLOCKED | NOT TESTED |
|---|---:|---:|---:|---:|---:|---:|
| Autenticación y sesión | 10 | 0 | 1 | 0 | 8 | 1 |
| Cuentas bancarias | 12 | 3 | 1 | 0 | 1 | 7 |
| Movimientos | 25 | 9 | 10 | 0 | 3 | 3 |
| Transferencias | 10 | 3 | 6 | 0 | 1 | 0 |
| Deudas | 14 | 0 | 10 | 0 | 0 | 4 |
| Nómina | 14 | 3 | 6 | 1 | 1 | 3 |
| Gastos recurrentes | 12 | 7 | 2 | 0 | 1 | 2 |
| Impuestos | 12 | 6 | 1 | 0 | 2 | 3 |
| Vehículos y mantenimiento | 16 | 7 | 4 | 0 | 1 | 4 |
| Propiedades | 8 | 3 | 1 | 0 | 1 | 3 |
| Calendario | 12 | 4 | 4 | 0 | 2 | 2 |
| Backup | 10 | 4 | 4 | 0 | 1 | 1 |
| Chat / parser / motor | 25 | 17 | 8 | 0 | 0 | 0 |
| Bear's Reserve | 18 | 10 | 3 | 0 | 3 | 2 |
| Seguridad | 12 | 5 | 2 | 4 | 0 | 1 |
| Accesibilidad | 10 | 0 | 1 | 0 | 9 | 0 |
| Rendimiento | 8 | 2 | 1 | 0 | 2 | 3 |
| Integridad de datos | 10 | 3 | 7 | 0 | 0 | 0 |
| **Total** | **238** | **86** | **72** | **5** | **36** | **39** |

> La columna `PASS (corregido)` corresponde a casos que **fallaron en la línea base** y hoy están en verde con regresión. La suma de `PASS + PASS (corregido) + FAIL + BLOCKED + NOT TESTED` es 238.

### Correspondencia con la ejecución automatizada

- **130 pruebas automatizadas en 15 suites**, todas en verde: `Test Files 15 passed (15)`, `Tests 130 passed (130)`.
- Línea base en `develop`: `Test Files 14 failed | 1 passed (15)`, `Tests 49 failed | 81 passed (130)`.
- Los 86 casos `PASS` no corregidos agrupan varias pruebas cuando el mismo comportamiento se valida en más de un escenario (por ejemplo, transferencias y concurrencia).
- `npm run lint`, `npx tsc -b` y `npm run build` en verde; `npm run coverage` genera reporte (sentencias 13,65 %, líneas 14,22 %, funciones 8,44 %, ramas 9,58 % sobre todo `src/`, incluida la UI no ejecutada).

---

## 20. Trazabilidad de hallazgos → casos

| Hallazgo | Casos que lo cubren | Estado del hallazgo |
|---|---|---|
| H-01 | MOV-01, MOV-02, INT-01 | Corregido |
| H-02 | MOV-10…16, INT-02, INT-03 | Corregido |
| H-03 | TRF-02…06, INT-04, INT-05 | Corregido |
| H-04 | DEU-01…08, INT-06 | Corregido |
| H-05 | NOM-03, IMP-05, INT-07, INT-08 | Corregido |
| H-06 | NOM-04, NOM-05 | Corregido |
| H-07 | MOV-03…05, MOV-13, TRF-06, DEU-06 | Corregido |
| H-08 | MOV-08, CTA-12 | Corregido |
| H-09 | REC-02, REC-07 | Corregido |
| H-10 | DEU-09, DEU-10 | Corregido |
| H-11 | CHT-17 | Corregido |
| H-12 | CHT-15 | Corregido |
| H-13 | CHT-20 | Corregido |
| H-14 | CHT-21 | Corregido |
| H-15 | CHT-06 | Corregido |
| H-16 | CAL-01, CAL-04, NOM-09 | Corregido |
| H-17 | MOV-21, INT-10 | Corregido |
| H-18 | CHT-17, CHT-18, CHT-19, INT-10 | Corregido |
| H-19 | AUT-08, SEG-06, CAL-11 | Corregido |
| H-20 | BAK-03, SEG-07 | Corregido |
| H-21 | BAK-04, BAK-05, BAK-07 | Corregido |
| H-22 | SEG-02, AUT-10 | **Riesgo residual** (no desplegable sin proyecto de pruebas) |
| H-23 | SEG-09 | **Riesgo aceptado** (arquitectura cliente-only) |
| H-24 | SEG-08 | **Riesgo aceptado** (historial local del chat) |
| H-25 | SEG-10 | **Riesgo residual** (17 high en dependencias) |
| H-26 | MOV-25, TRF-07 | Corregido |
| H-27 | DEU-09, DEU-10 | Corregido |
| H-28 | VEH-13 | Corregido |
| H-29 | CHT-03 | Corregido |
| H-30 | VEH-03, VEH-04 | Corregido |
| H-31 | VEH-06, PRO-02 | Corregido |
| H-32 | BRS-04 | Corregido |
| H-33 | BRS-09, BRS-10 | Corregido |
| H-34 | ACC-01 | Corregido |
| H-35 | MOV-17, REN-02 | Corregido |

**Hallazgos nuevos detectados durante la ejecución (no estaban en el informe inicial):**

| ID | Sev | Hallazgo | Caso | Estado |
|---|---|---|---|---|
| H-36 | S2 | `registrarPagoNomina` no es idempotente por periodo: el piloto automático evita repetir el mes, pero dos pagos manuales (chat) del mismo mes descuentan dos veces | NOM-08 | Pendiente (documentado; requiere definir periodo de pago) |
| H-37 | S3 | `fechaFin` de recurrentes anterior a `fechaInicio` no se valida | REC-12 | Pendiente (bajo impacto) |
| H-38 | S3 | Backup puede quedar parcial si un lote falla a mitad de la importación | BAK-08 | Pendiente (requiere transacción multi-lote o marca de importación) |

