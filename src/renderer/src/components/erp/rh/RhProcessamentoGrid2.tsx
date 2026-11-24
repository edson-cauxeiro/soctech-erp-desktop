import { useState, useMemo } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Download } from 'lucide-react';

interface RhProcessamentoGridProps {
  data: any[];
  onSelectionChange: (ids: string[]) => void;
  selectedIds: string[];
  isLoading?: boolean;
}

export function RhProcessamentoGrid({ data, onSelectionChange, selectedIds, isLoading }: RhProcessamentoGridProps) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters] = useState<Record<string, string>>({});

  const filteredSortedData = useMemo(() => {
    let result = [...data];
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        result = result.filter(row =>
          String(row[key] ?? '').toLowerCase().includes(value.toLowerCase())
        );
      }
    });
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [data, filters, sortConfig]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(filteredSortedData.map(d => d.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(x => x !== id));
    }
  };

  const isAllSelected = selectedIds.length > 0 && selectedIds.length === filteredSortedData.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < filteredSortedData.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={isIndeterminate ? 'indeterminate' : isAllSelected}
              onCheckedChange={handleSelectAll}
              disabled={data.length === 0}
            />
            <span className="text-sm">Selecionar tudo ({selectedIds.length}/{data.length})</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isIndeterminate ? 'indeterminate' : isAllSelected}
                  onCheckedChange={handleSelectAll}
                  disabled={data.length === 0}
                />
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'P', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  <span>P</span>
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'funcionario', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  Funcionário
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'tipoProcessamento', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  Tipo
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'periodo', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  Período
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'estado', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  Estado
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => setSortConfig({ key: 'totalLiquido', direction: 'asc' })} className="flex items-center gap-1 hover:underline">
                  Líquido
                </button>
              </TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Carregando...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum processamento encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredSortedData.map(item => (
                <TableRow key={item.id} className="hover:bg-accent/50">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={e => handleRowSelect(item.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{item.codigo}</span>
                  </TableCell>
                  <TableCell>{item.funcionario?.nome || item.funcionarioNome || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      item.tipo === 'VENCIMENTO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      item.tipo === 'SUBSIDIO_FERIAS' ? 'bg-green-100 text-green-700 border-green-200' :
                      item.tipo === 'SUBSIDIO_NATAL' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      item.tipo === 'EXTRAORDINARIO' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                      'bg-rose-100 text-rose-700 border-rose-200'
                    }`}>{item.tipo?.replace(/_/g, ' ')}</span>
                  </TableCell>
                  <TableCell>{item.periodo?.codigo || item.periodoCodigo || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      item.estado === 'PROCESSADO' ? 'bg-green-100 text-green-700 border-green-200' :
                      item.estado === 'ANULADO' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                      item.estado === 'EM_EXECUCAO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      'bg-muted text-muted-foreground border-border'
                    }`}
                    >{item.estado}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{item.totalLiquido ? item.totalLiquido.toLocaleString('pt-AO', { minimumFractionDigits: 2 }) : '0,00'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1 hover:bg-accent rounded transition-colors" title="Ver detalhes"><Eye className="h-4 w-4" /></button>
                      <button className="p-1 hover:bg-accent rounded transition-colors" title="Exportar PDF"><Download className="h-4 w-4" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              )))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function RhProcessamentoTabs({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  const tabs = [
    { id: 'processamentos', label: 'Processamentos', icon: 'list' },
    { id: 'restricoes', label: 'Restrições', icon: 'alert-triangle' },
    { id: 'remuneracoes', label: 'Remunerações/Descontos/Taxas Cambiais', icon: 'dollar-sign' },
  ];

  return (
    <div className="border-b mb-4">
      <nav className="flex gap-1" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab.id
                ? 'bg-background text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}