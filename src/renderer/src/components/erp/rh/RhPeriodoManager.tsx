import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock, Unlock, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';

export function RhPeriodoManager() {
  const [periodos, setPeriodos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ano, setAno] = useState(new Date().getFullYear());

  const carregarPeriodos = async () => {
    setIsLoading(true);
    try {
      const resp = await rhApi.config.periodos.listar(ano);
      if (resp.success) {
        setPeriodos(resp.data);
      } else {
        toast.error(resp.error?.message || 'Erro ao carregar períodos');
      }
    } catch {
      toast.error('Erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarPeriodos();
  }, [ano]);

  const handleGerar = async () => {
    setIsLoading(true);
    try {
      const resp = await rhApi.config.periodos.gerar(ano);
      if (resp.success) {
        toast.success('Períodos gerados com sucesso');
        carregarPeriodos();
      } else {
        toast.error(resp.error?.message || 'Erro ao gerar períodos');
      }
    } catch {
      toast.error('Erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFechar = async (periodo: any) => {
    if (!confirm(`Tem certeza que deseja fechar o período ${periodo.codigo}/${ano}?`)) return;
    setIsLoading(true);
    try {
      const resp = await rhApi.config.periodos.fechar(periodo.id);
      if (resp.success) {
        toast.success('Período fechado');
        carregarPeriodos();
      } else {
        toast.error(resp.error?.message || 'Erro ao fechar');
      }
    } catch {
      toast.error('Erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReabrir = async (periodo: any) => {
    if (!confirm(`Tem certeza que deseja reabrir o período ${periodo.codigo}/${ano}?`)) return;
    setIsLoading(true);
    try {
      const resp = await rhApi.config.periodos.reabrir(periodo.id);
      if (resp.success) {
        toast.success('Período reaberto');
        carregarPeriodos();
      } else {
        toast.error(resp.error?.message || 'Erro ao reabrir');
      }
    } catch {
      toast.error('Erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Períodos</h1>
          <p className="text-sm text-muted-foreground">Abertura, fecho e geração de períodos salariais</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(ano)} onValueChange={v => { setAno(parseInt(v)); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(a => (
                <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleGerar} disabled={isLoading}>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Gerar Períodos
          </Button>
        </div>
      </div>

      <div className="card p-4">
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {!isLoading && periodos.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>Nenhum período encontrado para {ano}</p>
          </div>
        )}
        {!isLoading && periodos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2 text-left text-sm font-medium">Código</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-left">Início</th>
                  <th className="p-2 text-left">Fim</th>
                  <th className="p-2 text-center">Estado</th>
                  <th className="p-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="p-2 font-mono">{p.codigo}</td>
                    <td className="p-2">{p.descricao}</td>
                    <td className="p-2">{p.dataInicio ? new Date(p.dataInicio).toLocaleDateString('pt-AO') : '—'}</td>
                    <td className="p-2">{p.dataFim ? new Date(p.dataFim).toLocaleDateString('pt-AO') : '—'}</td>
                    <td className="p-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        p.estado === 'ABERTO' ? 'bg-green-100 text-green-700 border-green-200' :
                        p.estado === 'FECHADO' ? 'bg-red-100 text-red-700 border-red-200' :
                        p.estado === 'PROCESSADO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        'bg-muted text-muted-foreground border-border'
                      }`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.estado === 'ABERTO' && (
                          <Button variant="outline" size="sm" onClick={() => handleFechar(p)} disabled={isLoading} title="Fechar período">
                            <Lock className="h-3 w-3" />
                          </Button>
                        )}
                        {p.estado === 'FECHADO' && (
                          <Button variant="outline" size="sm" onClick={() => handleReabrir(p)} disabled={isLoading} title="Reabrir período">
                            <Unlock className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}