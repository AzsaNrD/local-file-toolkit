const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

// Browser storage (saved signatures, history, settings) belongs to an origin, and an origin
// includes the port. A fixed port keeps that storage between launches; a random one would
// start every launch with an empty app.
const PREFERRED_PORT = 38417;
const HOST = "127.0.0.1";

let serverProcess = null;
let mainWindow = null;

function serverEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server", "server.js")
    : path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

function randomFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function pickPort() {
  return (await isPortFree(PREFERRED_PORT)) ? PREFERRED_PORT : randomFreePort();
}

async function waitForServer(port, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://${HOST}:${port}/`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local server did not start in time.");
}

function startServer(port) {
  const entry = serverEntry();
  // Electron's own binary runs the Next server as plain Node, so no separate Node install is needed.
  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      // Tells the server it runs inside the desktop app, and which version, for the update notice.
      LFT_APP_VERSION: app.getVersion(),
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: HOST,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  serverProcess.once("exit", () => {
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createWindow(port) {
  const origin = `http://${HOST}:${port}`;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: "#07090d",
    title: "Local File Toolkit",
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.loadURL(origin);

  // Links to other sites open in the normal browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) shell.openExternal(url);
    return { action: url.startsWith(origin) ? "allow" : "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      const port = await pickPort();
      startServer(port);
      await waitForServer(port);
      createWindow(port);
    } catch (error) {
      stopServer();
      const { dialog } = require("electron");
      dialog.showErrorBox("Local File Toolkit", String(error && error.message ? error.message : error));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", stopServer);
}
