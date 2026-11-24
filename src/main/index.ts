import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { existsSync } from 'fs';
import icon from '../../resources/icon.png?asset';
import { registerAuthRouter } from './routers/auth.router';
import { registerUtilizadorRouter } from './routers/utilizador.router';
import { registerPerfilRouter } from './routers/perfil.router';
import { registerEmpresaRouter } from './routers/empresa.router';
import { registerArtigoRouter } from './routers/artigo.router';
import { registerClienteRouter } from './routers/cliente.router';
import { registerFornecedorRouter } from './routers/fornecedor.router';
import { registerArmazemRouter } from './routers/armazem.router';
import { registerStockRouter } from './routers/stock.router';
import { registerComprasRouter } from './routers/compras.router';
import { registerVendasRouter } from './routers/vendas.router';
import { registerProformaRouter } from './routers/proforma.router';
import { registerGuiaEntregaRouter } from './routers/guia-entrega.router';
import { registerReciboRouter } from './routers/recibo.router';
import { registerTesourariaRouter } from './routers/tesouraria.router';
import { registerContabilidadeRouter } from './routers/contabilidade.router';
import { registerFiscalRouter } from './routers/fiscal.router';
import { registerRelatoriosRouter } from './routers/relatorios.router';
import { registerLocalizacaoRouter } from './routers/localizacao.router';
import { registerInventoryRouter } from './routers/inventory.router';
import { registerPuttawayPickingRouter } from './routers/putaway-picking.router';
import { registerDocumentoPrintRouter } from './routers/documento-print.router';
import { registerRegraStockRouter } from './routers/regra-stock.router';
import { registerLoteRouter } from './routers/lote.router';
import { registerRhRouter } from './routers/rh.router';
import { registerConfigRouter } from './routers/config.router';
import { armazemService } from './services/armazem.service';
import { testDatabaseConnection, disconnectPrisma } from './database/prisma';

function createWindow(): void {
  const preloadPath = existsSync(join(__dirname, '../preload/index.mjs'))
    ? join(__dirname, '../preload/index.mjs')
    : join(__dirname, '../preload/index.js');

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1850,
    height: 840,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Só URLs externas (http/https) seguem para o browser do sistema. O
    // renderer também usa `window.open` com `blob:` para pré-visualizar PDFs
    // (recibos); esse URL não é abrível pelo shell e a rejeição da promise
    // ficava sem handler no processo principal.
    if (/^https?:\/\//i.test(details.url)) {
      void shell.openExternal(details.url).catch(() => undefined);
    }
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Test database connection in background (non-blocking) e garante armazéns
  // padrão do sistema: ARM-01 (Geral, entradas) e ARM-02 (Vendas, baixas)
  testDatabaseConnection()
    .then(() => armazemService.ensureDefaultArmazens())
    .then(() => {
      console.log('Armazéns padrão ARM-01 (Geral) e ARM-02 (Vendas) garantidos.');
    })
    .catch((err) => {
      console.warn('Base de dados não acessível no arranque:', err.message);
    });

  // Register IPC Routers
  registerAuthRouter();
  registerUtilizadorRouter();
  registerPerfilRouter();
  registerEmpresaRouter();
  registerArtigoRouter();
  registerClienteRouter();
  registerFornecedorRouter();
  registerArmazemRouter();
  registerStockRouter();
  registerComprasRouter();
  registerVendasRouter();
  registerProformaRouter();
  registerGuiaEntregaRouter();
  registerReciboRouter();
  registerTesourariaRouter();
  registerContabilidadeRouter();
  registerFiscalRouter();
  registerRelatoriosRouter();
  registerLocalizacaoRouter();
  registerInventoryRouter();
  registerPuttawayPickingRouter();
  registerDocumentoPrintRouter();
  registerRegraStockRouter();
  registerLoteRouter();
  registerRhRouter();
  registerConfigRouter();

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Limpeza de recursos antes de fechar a aplicação
app.on('before-quit', async () => {
  await disconnectPrisma();
});
