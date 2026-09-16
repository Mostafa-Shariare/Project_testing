const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

// Avoid GPU shader cache locking collisions on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow = null;
let pythonProcess = null;
let pythonRl = null;

const CONFIG_PATH = path.join(__dirname, 'config.json');
const CLIENT_CONFIG_PATH = path.join(__dirname, '..', 'client', 'config.json');

function getInitialConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      console.error('Error reading local config:', e);
    }
  }
  if (fs.existsSync(CLIENT_CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CLIENT_CONFIG_PATH, 'utf-8'));
    } catch (e) {
      console.error('Error reading client config:', e);
    }
  }
  return {
    student_name: 'John Doe',
    roll_number: 'ROLL001',
    class_code: 'CS101',
    join_code: 'ABC123',
    server_url: 'http://localhost:8000',
  };
}

function startPythonEngine() {
  if (pythonProcess) return;

  const venvPython = path.join(__dirname, '..', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const pythonExec = fs.existsSync(venvPython)
    ? venvPython
    : (process.platform === 'win32' ? 'python' : 'python3');
  const engineScript = path.join(__dirname, 'engine.py');

  console.log(`[Electron] Launching Python Engine: ${pythonExec} ${engineScript}`);

  pythonProcess = spawn(pythonExec, ['-u', engineScript], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  pythonRl = readline.createInterface({
    input: pythonProcess.stdout,
    terminal: false,
  });

  pythonRl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    try {
      const data = JSON.parse(line);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('engine-data', data);
      }
    } catch (err) {
      console.log('[Python Output]', line);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('[Python Error]', data.toString().trim());
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('engine-error', data.toString().trim());
    }
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Electron] Python engine exited with code: ${code}`);
    pythonProcess = null;
    pythonRl = null;
  });
}

function sendToPython(commandObj) {
  if (pythonProcess && pythonProcess.stdin && !pythonProcess.stdin.destroyed) {
    try {
      pythonProcess.stdin.write(JSON.stringify(commandObj) + '\n');
    } catch (err) {
      console.error('Error sending to python:', err);
    }
  } else {
    // If engine is not running, restart it and retry
    startPythonEngine();
    setTimeout(() => {
      if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify(commandObj) + '\n');
      }
    }, 500);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1020,
    minHeight: 680,
    title: 'Visoria Student Desktop Tracker',
    backgroundColor: '#0F1115',
    icon: path.join(__dirname, '..', 'client', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  startPythonEngine();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    try {
      pythonProcess.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n');
    } catch (e) {}
    setTimeout(() => {
      if (pythonProcess) pythonProcess.kill();
      app.quit();
    }, 400);
  } else {
    app.quit();
  }
});

// IPC handlers
ipcMain.on('start-tracking', (_event, config) => {
  sendToPython({ cmd: 'start', config });
});

ipcMain.on('stop-tracking', () => {
  sendToPython({ cmd: 'stop' });
});

ipcMain.on('toggle-pause', (_event, paused) => {
  sendToPython({ cmd: 'pause', paused });
});

ipcMain.on('update-hud', (_event, toggles) => {
  sendToPython({ cmd: 'set_hud', toggles });
});

ipcMain.on('open-student-app', (_event, targetUrl) => {
  const finalUrl = targetUrl || 'http://localhost:5173/';
  console.log('[Electron] Opening student app URL:', finalUrl);
  shell.openExternal(finalUrl);
});

ipcMain.handle('load-config', () => {
  return getInitialConfig();
});

ipcMain.handle('save-config', (_event, config) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('Failed to save config:', err);
    return { ok: false, error: err.message };
  }
});
