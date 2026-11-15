const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIST_INDEX = path.join(ROOT_DIR, "frontend", "dist", "index.html");

const STARTUP_TIMEOUT_MS = Number(process.env.DELFOS_BACKEND_TIMEOUT_MS || 45000);
const BACKEND_CMD = process.env.DELFOS_BACKEND_CMD || "uv run python app.py";
const RENDERER_URL_OVERRIDE = process.env.DELFOS_RENDERER_URL || "";
const HUB_PORT = Number(process.env.DELFOS_HUB_PORT || 5000);

let backendProcess = null;
let mainWindow = null;
let isShuttingDown = false;
let currentRendererUrl = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataDir() {
  return path.join(app.getPath("userData"), "data");
}

function readLanEnabled() {
  const env = (process.env.DELFOS_LAN_SYNC || "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(env)) return true;
  if (["0", "false", "no"].includes(env)) return false;
  try {
    const raw = fs.readFileSync(path.join(dataDir(), "hub_settings.json"), "utf8");
    return Boolean(JSON.parse(raw).lan_enabled);
  } catch {
    return false;
  }
}

function lanAddresses() {
  const found = new Set();
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) found.add(entry.address);
    }
  }
  return [...found].sort();
}

function getFreePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
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
  if (app.isPackaged) {
    return;
  }

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

function startBackend(bindHost, port, lanEnabled) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });

  const env = {
    ...process.env,
    FLASK_HOST: bindHost,
    FLASK_PORT: String(port),
    FLASK_DEBUG: "false",
    DELFOS_DATA_DIR: dir,
    DELFOS_OPEN_BROWSER: "false",
    // Electron es el hub empaquetado; LAN se propaga al proceso Flask.
    DELFOS_LAN_SYNC: lanEnabled ? "1" : "0",
  };
  const spawnOptions = {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  };

  if (app.isPackaged) {
    const backendBinary = path.join(
      process.resourcesPath,
      "backend",
      process.platform === "win32" ? "delfos-backend.exe" : "delfos-backend",
    );
    if (!fs.existsSync(backendBinary)) {
      throw new Error(`No se encontró backend empaquetado en: ${backendBinary}`);
    }
    backendProcess = spawn(backendBinary, [], {
      ...spawnOptions,
      cwd: path.dirname(backendBinary),
    });
  } else {
    backendProcess = spawn(BACKEND_CMD, {
      ...spawnOptions,
      cwd: BACKEND_DIR,
      shell: true,
    });
  }

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

  const lanEnabled = readLanEnabled();
  // Con LAN: puerto estable (5000) + 0.0.0.0 para que la PWA del celular apunte siempre igual.
  // Sin LAN: loopback + puerto libre (PoC desktop aislado).
  const bindHost = lanEnabled ? "0.0.0.0" : "127.0.0.1";
  const backendPort = lanEnabled ? HUB_PORT : await getFreePort("127.0.0.1");
  startBackend(bindHost, backendPort, lanEnabled);

  const localUrl = `http://127.0.0.1:${backendPort}`;
  await waitForBackend(localUrl, STARTUP_TIMEOUT_MS);

  if (lanEnabled) {
    const urls = lanAddresses().map((ip) => `http://${ip}:${backendPort}`);
    console.log("[hub] LAN activa. URL para la PWA del celular:");
    for (const url of urls) console.log(`  ${url}`);
    if (!urls.length) console.log("  (no se detectaron IPs LAN; revisa la Wi‑Fi)");
  }

  const rendererUrl = RENDERER_URL_OVERRIDE || localUrl;
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
