import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { DocumentoPrintModel } from './documento-print.types';
import { DocumentoA4 } from './DocumentoA4';
import { toast } from 'sonner';

interface DocumentoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documento: DocumentoPrintModel | null;
}

export const DocumentoPreviewDialog: React.FC<DocumentoPreviewDialogProps> = ({
  open,
  onOpenChange,
  documento,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  if (!documento) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const filename = `${documento.tipoDocumento}_${documento.numero.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;
      const res = await window.api.documentoPrint.exportPdf({ suggestedFilename: filename });
      if (res.success) {
        if (res.data.canceled) return;
        if (res.data.filePath) {
          toast.success(`PDF guardado com sucesso: ${res.data.filePath}`);
        }
      } else {
        toast.error('Erro ao exportar PDF: ' + res.error.message);
      }
    } catch {
      toast.error('Erro ao comunicar com o processo de exportação.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-100">
        {/* Barra superior de ações */}
        <DialogHeader className="p-4 bg-white border-b border-slate-200 flex flex-row items-center justify-between no-print">
          <div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Visualização de Documento: {documento.tituloDocumento} ({documento.numero})
            </DialogTitle>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Imprimir</span>
            </Button>
            <Button
              size="sm"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Exportar PDF</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Conteúdo com scroll e visualização A4 */}
        <div className="flex-1 overflow-y-auto p-6 flex justify-center bg-slate-200/70 a4-document-container">
          <DocumentoA4 documento={documento} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
