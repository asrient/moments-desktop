const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require("electron-updater");

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 800,
        height: 500,
        show: false,
        transparent: false,
        opacity: 1,
        title: app.name,
        minHeight: 600,
        minWidth: 370,
        //maxHeight: 650,
        //maxWidth: 400,
        // maximizable:false,
        frame: false,
        icon: "./icon.ico",
        webPreferences: {
            nodeIntegration: true,
            //preload: './preload.js'
        }
    })

    const installDir = app.getAppPath();
    const filesDir = app.getPath("userData") + '/files';

    win.webContents.session.protocol.registerFileProtocol('assets', (req, cb) => {
        var url = req.url.substr(9);
        cb(installDir + '/assets/' + url);
    })

    win.webContents.session.protocol.registerFileProtocol('bundle', (req, cb) => {
        var url = req.url.substr(9);
        cb(installDir + '/bundle/' + url);
    })

    win.webContents.session.protocol.interceptFileProtocol('files', (req, cb) => {
        var url = req.url.substr(8);
        cb(filesDir + '/' + url);
    })

    win.loadFile(installDir + '/index.html');
    //win.webContents.openDevTools()

    win.once('ready-to-show', () => {
        checkUpates();
    });

    autoUpdater.on('update-available', () => {
        console.log('Update available!');
        win.webContents.send('update_available');
    });

    autoUpdater.on('update-downloaded', () => {
        console.log('Update downloaded!');
        win.webContents.send('update_downloaded');
    });
}

function checkUpates() {
    console.log('checking for updates...');
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error(err)
    })
}

ipcMain.on('install_update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('check_update', () => {
    checkUpates();
});

autoUpdater.on('error', (err) => {
    console.log('Update error:', err);
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})