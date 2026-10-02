> Archived source documentation, preserved during migration. Paths, project names and prior verification statements below describe the earlier delivery; they are not evidence of checks performed during this migration. Use the root README and docs/validation.md for current instructions and recorded verification.

# EA Inversión · Portfolio Copilot

MVP funcional para registrar carteras y analizar sus posiciones. Evoluciona la base previa Next.js / TypeScript + FastAPI / Python, conservando el motor financiero independiente y el laboratorio CSV.

## Empezar

Necesitas **Python 3.12** y **Node.js 22.17 o posterior**.

```sh
python scripts/dev.py --setup
python scripts/dev.py
```

Abre **http://localhost:3000**, crea una cuenta y elige «Explorar con datos de ejemplo» o crea una cartera vacía. Los ejemplos están identificados como sintéticos. El comando mantiene los dos servidores activos y los detiene con Ctrl+C; los datos permanecen en `data/ea-inversion.db`. Usa el mismo origen `localhost`, no `127.0.0.1`, para entrar desde el navegador.

La configuración opcional se encuentra en `.env.example`. Cópiala a `.env` antes de personalizarla. El lanzador la lee sin ejecutar su contenido como código.

## Qué puedes hacer

- Crear una cuenta, iniciar sesión y cerrar/revocar la sesión.
- Crear, renombrar y eliminar portafolios personales.
- Añadir, editar y eliminar posiciones con cantidades fraccionarias, costo promedio, precio y fecha de valoración.
- Consultar valor de mercado, costo, ganancia no realizada y distribución por activo.
- Importar y guardar precios históricos CSV para tu cartera.
- Comparar una simulación de las posiciones actuales con SPY u otro benchmark USD.
- Revisar rendimiento, volatilidad, Sharpe, beta, máxima caída y observaciones determinísticas.
- Explorar ventanas de 1, 3, 6 y 12 meses aproximados o todo el histórico.
- Exportar las posiciones a CSV.
- Usar el laboratorio original en `/lab`, sin cuenta ni almacenamiento de su análisis.
- Usar una base PostgreSQL con `DATABASE_URL=postgresql+psycopg://...`; SQLite es el valor local por defecto.

No incorpora IA generativa, optimización avanzada ni ejecución de órdenes, conforme al alcance P0 acordado.

## Precios de mercado

El adaptador de **Twelve Data** está implementado. Para activarlo, configura `TWELVE_DATA_API_KEY` en el servidor o en el `.env` del lanzador y reinicia. Pulsa «Actualizar precios» en la cartera. El endpoint consulta hasta un año por defecto; la API admite de 30 a 1,825 días.

La clave no llega al navegador. Se solicitan cierres diarios ajustados por splits y dividendos para el análisis, y un cierre sin ajustar para valorar las cantidades actuales. La caché dura seis horas. Cada símbolo sin caché consume dos consultas; el benchmark también cuenta. Tu plan debe admitir los símbolos, los ajustes y la cuota necesarios. Las descargas terminan en el día anterior para evitar el cierre parcial del día en curso.

**La descarga real requiere una clave del usuario y no se ha validado con una cuenta real.** El adaptador se probó con respuestas HTTP controladas: valores, parámetros de ajuste, fechas, moneda, errores y cuotas. Si el proveedor falla o los calendarios no coinciden, la actualización se cancela completa y conserva los datos anteriores. Nunca se sustituye una descarga fallida por datos sintéticos.

Referencia del contrato del proveedor: [documentación oficial de Twelve Data](https://twelvedata.com/docs).

## CSV de históricos

Primera columna `date`, seguida de **exactamente los símbolos de la cartera** y una columna opcional `benchmark`. Encabezados únicos, fechas `AAAA-MM-DD` crecientes, mínimo tres filas, sin vacíos, valores positivos y precios diarios ajustados en USD. Máximo 1 MB y 10,000 filas. El parser acepta CSV estándar y BOM.

```csv
date,AAPL,MSFT,benchmark
2026-01-05,100,200,100
2026-01-06,102,202,101
2026-01-07,101,206,103
```

Los valores anteriores son un ejemplo sintético de formato. `benchmark` debe corresponder al benchmark seleccionado. La app no verifica por sí sola el ajuste corporativo ni el calendario de un archivo del usuario. No rellena huecos ni convierte monedas. Importar históricos **no cambia** los precios de valoración, porque un precio ajustado no equivale necesariamente al cierre sin ajustar.

Añadir/eliminar un símbolo o cambiar el benchmark invalida el histórico para impedir un análisis inconsistente. Cambiar la cantidad conserva la serie y recalcula la simulación. Editar el precio de valoración cambia su procedencia a «Precio manual».

## Metodología

La valoración es cantidad × precio registrado sin ajustar. El costo es cantidad × costo promedio. La diferencia representa ganancia/pérdida no realizada, sin comisiones, impuestos ni dividendos. Si falta el precio de una posición, el total y los pesos no se muestran; no se suman silenciosamente solo las posiciones conocidas.

El análisis histórico es **una simulación de las posiciones actuales**, no el rendimiento de las compras y ventas reales. Los pesos iniciales se obtienen de cantidad actual × precio ajustado al comienzo del intervalo y después se mantienen las unidades de la simulación. No hay rebalanceos ni flujos. Ambas curvas se normalizan a 100. Volatilidad y Sharpe usan 252 sesiones al año, desviación muestral y una tasa libre de riesgo anual configurable, cuyo valor inicial es 0. Beta usa la covarianza con el benchmark y su varianza. El máximo drawdown incluye el capital inicial. Sharpe o beta indefinidos aparecen como un guion.

Las ventanas de 1/3/6/12 meses toman las últimas 22/64/127/253 observaciones de precios: son aproximaciones por sesiones, no intervalos exactos de calendario. Las fechas efectivas se devuelven en la API. Las alertas actuales señalan concentración inicial superior a 40%, muestras menores de 252 retornos y volatilidad casi nula.

## Estructura

```text
apps/web/app/          Dashboard, laboratorio y proxy de mismo origen
apps/web/components/  Acceso, identidad y gráficas
apps/web/lib/         Tipos, cliente HTTP y proxy
backend/app/engine.py Motor financiero original, independiente
backend/app/auth.py   Contraseñas Argon2id y sesiones revocables
backend/app/db.py     Persistencia SQLAlchemy
backend/app/market.py Adaptador y caché de precios
backend/app/main.py   Endpoints, validación y autorización
backend/tests/       Cálculos, sesiones, aislamiento y datos
scripts/dev.py       Instalación y ejecución local
scripts/browser-smoke.mjs Flujos completos en navegador
```

## Verificación

Desde la raíz, con las dependencias instaladas:

```sh
.venv/bin/python -m pytest -q
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

En Windows, el ejecutable es `.venv\Scripts\python.exe`. Para el navegador:

```sh
cd apps/web
npx playwright install chromium
npm run test:e2e
```

El test crea su propia base temporal y una cuenta desechable; recorre registro, sesión, cartera de ejemplo, periodos, configuración, persistencia tras recarga, posiciones, CSV, actualización fallida, exportación, móvil, eliminación y laboratorio. Guarda capturas en `test-results/`. La CI ejecuta la misma verificación.

## Seguridad y límites de esta entrega

Las contraseñas usan Argon2id. Las sesiones son tokens aleatorios de siete días: solo se guarda su hash, con cookie HttpOnly y SameSite=Lax. Las escrituras requieren el origen exacto de `APP_ORIGIN` y JSON. Se comprueba la propiedad del portafolio en cada ruta, incluso en las exportaciones. Hay límites de tamaño, activos y carteras, y un limitador de intentos de acceso almacenado en la base. El proxy no reenvía cabeceras arbitrarias ni expone la clave de mercado.

Esta entrega está verificada para uso local con SQLite. **No está desplegada en producción.** PostgreSQL está soportado por la capa de persistencia, pero no se ha probado contra un servidor PostgreSQL real en esta entrega. Antes de abrirla a usuarios externos faltan validación de despliegue, HTTPS (`COOKIE_SECURE=true`), copias de seguridad, migraciones versionadas, recuperación/verificación de correo y limitación de tráfico en el proxy de entrada. La cuota por IP actual cuenta la IP del servidor Next.js: es conservadora y compartida por todos los usuarios, no un limitador distribuido de producción.

Esta versión usa USD y posiciones actuales sin ledger de transacciones ni contabilidad de splits. Si cambia la cantidad real por un split, debe actualizarse en la cartera. Historial de operaciones, flujos, rentabilidad real ponderada por tiempo/dinero y conversión FX quedan para el siguiente desarrollo.
