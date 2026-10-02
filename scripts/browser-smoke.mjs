// Run against an ephemeral account and database. Does not touch a user's database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const state = await mkdtemp(path.join(tmpdir(), "ea-inversion-e2e-"));
const results = path.join(root, "test-results");
await mkdir(results, { recursive: true });
const python =
  process.env.PYTHON_BIN ||
  path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
const origin = "http://localhost:3100";
const logs = [];
function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", (e) => logs.push(e.message));
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (d) => logs.push(String(d)));
  return child;
}
const api = start(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "backend",
    "--host",
    "127.0.0.1",
    "--port",
    "8100",
  ],
  {
    APP_ORIGIN: origin,
    DATABASE_URL: "sqlite:///" + path.join(state, "db.sqlite"),
    TWELVE_DATA_API_KEY: "",
    COOKIE_SECURE: "false",
  },
);
const web = start(
  process.execPath,
  [
    path.join(root, "frontend/node_modules/next/dist/bin/next"),
    "start",
    path.join(root, "frontend"),
    "-H",
    "127.0.0.1",
    "-p",
    "3100",
  ],
  { API_URL: "http://127.0.0.1:8100", NEXT_TELEMETRY_DISABLED: "1" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(origin + "/api/auth/me");
      if (r.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "Application did not start: " + logs.join("").slice(-2500));
  let launch = { headless: true };
  if (process.env.CHROMIUM_MODULE) {
    const loaded = require(process.env.CHROMIUM_MODULE);
    const alternate = loaded.default || loaded;
    launch = {
      ...launch,
      executablePath:
        process.env.CHROMIUM_EXECUTABLE || (await alternate.executablePath()),
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
      ],
    };
  }
  browser = await chromium.launch(launch);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Crea tu cuenta", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Carlos");
  await page.getByLabel("Correo electrónico").fill("browser-test@example.test");
  await page.getByLabel("Contraseña").fill("Disposable-test-password-2026");
  await page
    .getByRole("button", { name: "Crear mi cuenta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explorar con datos de ejemplo", exact: true })
    .click();
  await page.locator(".source-demo").waitFor();
  await page.screenshot({
    path: path.join(results, "dashboard-desktop.png"),
    fullPage: true,
  });
  assert.equal(await page.locator("tbody tr").count(), 4);
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await page
    .getByText("Cartera actual · 21 retornos diarios", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Análisis de riesgo", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Las caídas también cuentan." })
    .waitFor();
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cartera guardada");
  await page
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  await page.getByText("Portafolio guardado.", { exact: true }).waitFor();
  await page.reload();
  await page.locator("#portfolio-select").waitFor();
  assert.equal(
    await page.locator("#portfolio-select option:checked").innerText(),
    "Cartera guardada",
  );
  await page
    .getByRole("button", { name: "Nuevo portafolio", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nombre", { exact: true })
    .fill("Prueba de inversión");
  await dialog
    .getByRole("button", { name: "Crear portafolio", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Agregar activo", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Símbolo", { exact: true }).fill("AAPL");
  await dialog.getByLabel("Cantidad", { exact: true }).fill("2");
  await dialog.getByLabel("Costo promedio (USD)").fill("90");
  await dialog.getByLabel("Precio registrado (USD)").fill("100");
  await dialog.getByLabel("Fecha del precio").fill("2026-01-07");
  await dialog
    .getByRole("button", { name: "Guardar posición", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Importar histórico", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Contenido del archivo")
    .fill(
      "date,AAPL,benchmark\n2026-01-05,100,100\n2026-01-06,110,105\n2026-01-07,99,103",
    );
  await dialog
    .getByRole("button", { name: "Importar y analizar", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("CSV importado", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".metric-dark strong").innerText(),
    await page.evaluate(() =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(200),
    ),
  );
  await page.getByRole("button", { name: "Editar AAPL", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
  await dialog
    .getByRole("button", { name: "Guardar posición", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".metric-dark strong").innerText(),
    await page.evaluate(() =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(300),
    ),
  );
  await page
    .getByRole("button", { name: "Actualizar precios", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Falta configurar" })
    .waitFor();
  assert.equal(
    await page.locator(".metric-dark strong").innerText(),
    await page.evaluate(() =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(300),
    ),
  );
  await page
    .getByRole("button", { name: "Mis posiciones", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar", exact: true }).click();
  assert.equal((await download).suggestedFilename(), "posiciones.csv");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await page.screenshot({
    path: path.join(results, "dashboard-mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Unexpected horizontal page overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Eliminar AAPL", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Agrega tu primera posición." })
    .waitFor();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Bienvenido de nuevo." }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Bienvenido de nuevo." }).waitFor();
  await page.goto(origin + "/lab");
  await page
    .getByRole("button", { name: "Analizar portafolio →", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Evolución · base 100", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: registro, sesión, demo, periodos, análisis, guardado, recarga, cartera, posiciones, CSV, edición, error de proveedor, exportación, móvil, eliminación, cierre y laboratorio.",
  );
} catch (e) {
  console.error(e);
  console.error(logs.join("").slice(-4000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  await rm(state, { recursive: true, force: true });
}
