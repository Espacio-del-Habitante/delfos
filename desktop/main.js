const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIST_INDEX = path.join(ROOT_DIR, "frontend", "dist", "index.html");

const BACKEND_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = Number(process.env.DELFOS_BACKEND_TIMEOUT_MS || 45000);
const BACKEND_CMD = process.env.DELFOS_BACKEND_CMD || "uv run python app.py";
const RENDERER_URL_OVERRIDE = process.env.DELFOS_RENDERER_URL || "";

let backendProcess = null;
let mainWindow = null;
let isShuttingDown = false;
let currentRendererUrl = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, BACKEND_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No fue posible resolver un puerto libre para Flask."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForBackend(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "Backend sin respuesta.";

  while (Date.now() < deadline) {
    if (backendProcess && backendProcess.exitCode !== null) {
      throw new Error(`Flask finalizó durante el arranque (exit ${backendProcess.exitCode}).`);
    }

    try {
      const response = await fetch(`${url}/api/finance`);
      if (response.ok) {
        return;
      }
      lastError = `Health check devolvió HTTP ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(350);
  }

  throw new Error(`No se pudo conectar con Flask a tiempo. Último error: ${lastError}`);
}

function ensureFrontendBuild() {
  if (RENDERER_URL_OVERRIDE) {
    return;
  }

  if (!fs.existsSync(FRONTEND_DIST_INDEX)) {
    throw new Error(
      [
        "No existe frontend/dist/index.html.",
        "Ejecuta `npm --prefix frontend install && npm --prefix frontend run build`",
        "o define DELFOS_RENDERER_URL para usar Astro dev server.",
      ].join(" "),
    );
  }
}

function startBackend(port) {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    FLASK_HOST: BACKEND_HOST,
    FLASK_PORT: String(port),
    FLASK_DEBUG: "false",
    DELFOS_DATA_DIR: dataDir,
  };

  backendProcess = spawn(BACKEND_CMD, {
    cwd: BACKEND_DIR,
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  backendProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[flask] ${chunk}`);
  });

  backendProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[flask] ${chunk}`);
  });

  backendProcess.on("close", (code, signal) => {
    if (!isShuttingDown) {
      dialog.showErrorBox(
        "Delfos backend finalizó",
        `El proceso de Flask terminó inesperadamente (code=${code}, signal=${signal || "none"}).`,
      );
      app.quit();
    }
  });
}

function stopBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) {
    return;
  }

  // ponytail: cierre simple con SIGTERM; si aparecen huérfanos, escalar a SIGKILL con timeout.
  backendProcess.kill("SIGTERM");
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(url);
}

async function bootstrap() {
  ensureFrontendBuild();

  const backendPort = await getFreePort();
  startBackend(backendPort);

  const backendUrl = `http://${BACKEND_HOST}:${backendPort}`;
  await waitForBackend(backendUrl, STARTUP_TIMEOUT_MS);

  const rendererUrl = RENDERER_URL_OVERRIDE || backendUrl;
  currentRendererUrl = rendererUrl;
  await createMainWindow(rendererUrl);
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("No se pudo iniciar Delfos Desktop", message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null && currentRendererUrl) {
    void createMainWindow(currentRendererUrl);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isShuttingDown = true;
  stopBackend();
});
