import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const backendDir = path.join(rootDir, "backend");
const frontendDist = path.join(rootDir, "frontend", "dist", "index.html");
const backendName = "delfos-backend";
const addDataSeparator = process.platform === "win32" ? ";" : ":";
const backendBinary = path.join(
  backendDir,
  "dist",
  process.platform === "win32" ? `${backendName}.exe` : backendName,
);

function runOrFail(command, args, cwd) {
  const run = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (run.error) {
    throw new Error(`No se pudo ejecutar '${command}'. Detalle: ${run.error.message}`);
  }

  if (run.status !== 0) {
    throw new Error(`El comando '${command} ${args.join(" ")}' finalizó con código ${run.status}.`);
  }
}

function resolveUvCommand(cwd) {
  const envBinary = process.env.DELFOS_UV_BIN;
  const candidates = [];

  if (envBinary) {
    candidates.push({ command: envBinary, baseArgs: [] });
  }

  candidates.push(
    { command: "uv", baseArgs: [] },
    { command: "python3", baseArgs: ["-m", "uv"] },
    { command: "python", baseArgs: ["-m", "uv"] },
  );

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.baseArgs, "--version"], {
      cwd,
      stdio: "ignore",
      env: process.env,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "No se encontró `uv` en PATH ni como módulo Python. Instala uv o define DELFOS_UV_BIN=/ruta/a/uv.",
  );
}

const uvCommand = resolveUvCommand(backendDir);
const runUv = (args) => runOrFail(uvCommand.command, [...uvCommand.baseArgs, ...args], backendDir);

if (!existsSync(frontendDist)) {
  throw new Error("No existe frontend/dist. Ejecuta `npm --prefix frontend run build`.");
}

console.log("==> Sincronizando backend (uv sync --group dev)...");
runUv(["sync", "--group", "dev"]);

console.log("==> Generando binario backend (PyInstaller onefile)...");
runUv([
  "run",
  "pyinstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name",
  backendName,
  "--add-data",
  `../frontend/dist${addDataSeparator}frontend_dist`,
  "--collect-all",
  "yfinance",
  "app.py",
]);

if (!existsSync(backendBinary)) {
  throw new Error(`PyInstaller no generó el binario esperado: ${backendBinary}`);
}

console.log(`==> Backend listo: ${backendBinary}`);
