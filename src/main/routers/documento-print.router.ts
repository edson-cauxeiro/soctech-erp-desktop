/**
 * @file documento-print.router.ts
 * @description Canal IPC para geração e exportação de PDF de documentos comerciais/fiscais no DoraERP.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'fs/promises';
import { basename } from 'path';
import { ok, err } from '../utils/ipc-response';

export function registerDocumentoPrintRouter(): void {
  ipcMain.handle('documentoPrint:exportPdf', async (event, options: { suggestedFilename?: string }) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return err('WINDOW_NOT_FOUND', 'Janela principal não encontrada.');
      }

      const rawName = options?.suggestedFilename || 'documento.pdf';
      const sanitized = basename(rawName)
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_')
        .replace(/^\.+/, '');
      const filename = sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;

      const saveResult = await dialog.showSaveDialog(window, {
        title: 'Guardar Documento PDF',
        defaultPath: filename,
        filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return ok({ success: false, canceled: true });
      }

      const pdfBuffer = await event.sender.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
        margins: {
          marginType: 'none',
        },
      });

      await writeFile(saveResult.filePath, pdfBuffer);

      return ok({ success: true, filePath: saveResult.filePath });
    } catch (error) {
      return err('PDF_EXPORT_ERROR', (error as Error)?.message || 'Erro ao exportar PDF do documento.');
    }
  });
}
