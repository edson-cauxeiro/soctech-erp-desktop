/**
 * @file RhAuditoriaTimeline.tsx
 * @description Componente de timeline de auditoria para o módulo RH (RH-802).
 *
 * Exibe uma linha temporal de eventos de auditoria filtráveis por funcionário,
 * processamento, entidade, período, ação e severidade.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Search, Filter, Download, RefreshCw, User, FileText } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { rhApi } from '@/api/rh.api';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { RhAuditLogDto } from '@/@types/electron';

type AbaAuditoria = 'funcionario' | 'processamento' | 'geral';

interface FiltrosBase {
  acao?: string;
  severidade?: string;
  desde?: string;
  ate?: string;
  limite?: number;
  cursor?: string;
  incluirArquivados?: boolean;
}

interface FiltrosFuncionario extends FiltrosBase {
  funcionarioId: string;
}

interface FiltrosProcessamento extends FiltrosBase {
  processamentoId: string;
}

interface FiltrosGeral extends FiltrosBase {
  entidade?: string;
  entidadeId?: string;
  utilizadorId?: string;
}

const ACOS_AUDITORIA = [
  { value: 'criar', label: 'Criar' },
  { value: 'actualizar', label: 'Actualizar' },
  { value: 'eliminar', label: 'Eliminar' },
  { value: 'exportar', label: 'Exportar' },
  { value: 'validar', label: 'Validar' },
  { value: 'imprimir', label: 'Imprimir' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'anular', label: 'Anular' },
  { value: 'submeter', label: 'Submeter' },
];

const SEVERIDADES = [
  { value: 'info', label: 'Info' },
  { value: 'aviso', label: 'Aviso' },
  { value: 'critico', label: 'Crítico' },
];

const ENTIDADES_RH = [
  'RhFuncionario',
  'RhContrato',
  'RhAlteracaoMensal',
  'RhAlteracaoSalarial',
  'RhPeriodo',
  'RhLoteProcessamento',
  'RhProcessamento',
  'RhProcessamentoItem',
  'RhRecibo',
  'RhPagamento',
  'RhOrdemPagamento',
  'RhAusencia',
  'RhHoraExtra',
  'RhFeriasSaldo',
  'RhMarcacaoFerias',
  'RhAfetacao',
  'RhProcessoDivida',
  'RhPrestacaoDivida',
  'RhRetroativo',
  'RhIndependente',
  'RhAtividade',
  'RhProcessamentoHonorario',
  'RhPagamentoHonorario',
];

function SeveridadeBadge({ severidade }: { severidade: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    info: 'default',
    aviso: 'secondary',
    critico: 'destructive',
  };
  return <Badge variant={variants[severidade] || 'outline'}>{severidade.toUpperCase()}</Badge>;
}

function AcaoBadge({ acao }: { acao: string }) {
  const labels: Record<string, string> = {
    criar: 'Criar',
    actualizar: 'Actualizar',
    eliminar: 'Eliminar',
    exportar: 'Exportar',
    validar: 'Validar',
    imprimir: 'Imprimir',
    login: 'Login',
    logout: 'Logout',
    anular: 'Anular',
    submeter: 'Submeter',
  };
  return <Badge variant="outline">{labels[acao] || acao}</Badge>;
}

function DataHoraCell({ dataHora }: { dataHora: string | Date }) {
  const data = typeof dataHora === 'string' ? new Date(dataHora) : dataHora;
  return (
    <span title={format(data, 'dd/MM/yyyy HH:mm:ss', { locale: pt })}>
      {format(data, 'dd/MM/yyyy HH:mm', { locale: pt })}
    </span>
  );
}

export function RhAuditoriaTimeline() {
  const [abaAtiva, setAbaAtiva] = useState<AbaAuditoria>('funcionario');
  const [carregando, setCarregando] = useState(false);
  const [registos, setRegistos] = useState<RhAuditLogDto[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [temMais, setTemMais] = useState(false);

  // Filtros por aba
  const [filtrosFuncionario, setFiltrosFuncionario] = useState<FiltrosFuncionario>({
    funcionarioId: '',
    limite: 50,
  });
  const [filtrosProcessamento, setFiltrosProcessamento] = useState<FiltrosProcessamento>({
    processamentoId: '',
    limite: 50,
  });
  const [filtrosGeral, setFiltrosGeral] = useState<FiltrosGeral>({
    limite: 50,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      let resultado;
      if (abaAtiva === 'funcionario') {
        resultado = await rhApi.auditoria.porFuncionario(filtrosFuncionario);
      } else if (abaAtiva === 'processamento') {
        resultado = await rhApi.auditoria.porProcessamento(filtrosProcessamento);
      } else {
        resultado = await rhApi.auditoria.listar(filtrosGeral);
      }

      if (resultado.success && resultado.data) {
        setRegistos(resultado.data.registos);
        setProximoCursor(resultado.data.proximoCursor);
        setTotal(resultado.data.total);
        setTemMais(!!resultado.data.proximoCursor);
      }
    } catch (error) {
      console.error('Erro ao carregar auditoria:', error);
    } finally {
      setCarregando(false);
    }
  }, [abaAtiva, filtrosFuncionario, filtrosProcessamento, filtrosGeral]);

  const carregarMais = useCallback(async () => {
    if (!proximoCursor || carregando) return;
    setCarregando(true);
    try {
      let resultado;
      const baseFiltros = { cursor: proximoCursor, limite: 50 };

      if (abaAtiva === 'funcionario') {
        resultado = await rhApi.auditoria.porFuncionario({ ...filtrosFuncionario, ...baseFiltros });
      } else if (abaAtiva === 'processamento') {
        resultado = await rhApi.auditoria.porProcessamento({ ...filtrosProcessamento, ...baseFiltros });
      } else {
        resultado = await rhApi.auditoria.listar({ ...filtrosGeral, ...baseFiltros });
      }

      if (resultado.success && resultado.data) {
        setRegistos((prev) => [...prev, ...resultado.data!.registos]);
        setProximoCursor(resultado.data.proximoCursor);
        setTemMais(!!resultado.data.proximoCursor);
      }
    } catch (error) {
      console.error('Erro ao carregar mais:', error);
    } finally {
      setCarregando(false);
    }
  }, [abaAtiva, proximoCursor, carregando, filtrosFuncionario, filtrosProcessamento, filtrosGeral]);

  const exportarCsv = useCallback(() => {
    if (registos.length === 0) return;

    const cabecalhos = ['Data/Hora', 'Utilizador', 'Ação', 'Severidade', 'Entidade', 'Entidade ID', 'Descrição'];
    const linhas = registos.map((r) => [
      format(new Date(r.dataHora), 'dd/MM/yyyy HH:mm:ss', { locale: pt }),
      r.utilizadorNome || r.utilizadorLogin || 'Sistema',
      r.acao,
      r.severidade,
      r.entidade,
      r.entidadeId || '',
      r.descricao,
    ]);

    const csv = [cabecalhos.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-rh-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [registos]);

  const limparFiltros = useCallback(() => {
    if (abaAtiva === 'funcionario') {
      setFiltrosFuncionario({ funcionarioId: '', limite: 50 });
    } else if (abaAtiva === 'processamento') {
      setFiltrosProcessamento({ processamentoId: '', limite: 50 });
    } else {
      setFiltrosGeral({ limite: 50 });
    }
  }, [abaAtiva]);

  // Reset registos ao mudar de aba
  useEffect(() => {
    setRegistos([]);
    setProximoCursor(null);
    setTotal(0);
    setTemMais(false);
  }, [abaAtiva]);

  return (
    <div className="h-full flex flex-col">
      {/* Header com abas */}
      <div className="border-b p-4">
        <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as AbaAuditoria)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="funcionario">
              <User className="mr-2 h-4 w-4" />
              Por Funcionário
            </TabsTrigger>
            <TabsTrigger value="processamento">
              <FileText className="mr-2 h-4 w-4" />
              Por Processamento
            </TabsTrigger>
            <TabsTrigger value="geral">
              <Search className="mr-2 h-4 w-4" />
              Geral
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filtros */}
      <div className="p-4 border-b bg-muted/30 space-y-4">
        {/* Linha 1: Identificador principal */}
        <div className="flex gap-4 flex-wrap">
          {abaAtiva === 'funcionario' && (
            <div className="flex-1 min-w-[250px]">
              <Label htmlFor="funcionarioId" className="block text-sm font-medium mb-1">
                Funcionário (ID) *
              </Label>
              <Input
                id="funcionarioId"
                placeholder="ID do funcionário"
                value={filtrosFuncionario.funcionarioId}
                onChange={(e) => setFiltrosFuncionario({ ...filtrosFuncionario, funcionarioId: e.target.value })}
              />
            </div>
          )}
          {abaAtiva === 'processamento' && (
            <div className="flex-1 min-w-[250px]">
              <Label htmlFor="processamentoId" className="block text-sm font-medium mb-1">
                Processamento (ID) *
              </Label>
              <Input
                id="processamentoId"
                placeholder="ID do processamento"
                value={filtrosProcessamento.processamentoId}
                onChange={(e) => setFiltrosProcessamento({ ...filtrosProcessamento, processamentoId: e.target.value })}
              />
            </div>
          )}
          {abaAtiva === 'geral' && (
            <>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="entidade" className="block text-sm font-medium mb-1">
                  Entidade
                </Label>
                <Select value={filtrosGeral.entidade || ''} onValueChange={(v) => setFiltrosGeral({ ...filtrosGeral, entidade: v || undefined })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as entidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    {ENTIDADES_RH.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="entidadeId" className="block text-sm font-medium mb-1">
                  ID da Entidade
                </Label>
                <Input
                  id="entidadeId"
                  placeholder="ID da entidade"
                  value={filtrosGeral.entidadeId || ''}
                  onChange={(e) => setFiltrosGeral({ ...filtrosGeral, entidadeId: e.target.value || undefined })}
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="utilizadorId" className="block text-sm font-medium mb-1">
                  Utilizador (ID)
                </Label>
                <Input
                  id="utilizadorId"
                  placeholder="ID do utilizador"
                  value={filtrosGeral.utilizadorId || ''}
                  onChange={(e) => setFiltrosGeral({ ...filtrosGeral, utilizadorId: e.target.value || undefined })}
                />
              </div>
            </>
          )}
        </div>

        {/* Linha 2: Filtros comuns */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="acao" className="block text-sm font-medium mb-1">
              Ação
            </Label>
            <Select
              value={(abaAtiva === 'funcionario' ? filtrosFuncionario.acao : abaAtiva === 'processamento' ? filtrosProcessamento.acao : filtrosGeral.acao) || ''}
              onValueChange={(v) => {
                if (abaAtiva === 'funcionario') setFiltrosFuncionario({ ...filtrosFuncionario, acao: v || undefined });
                else if (abaAtiva === 'processamento') setFiltrosProcessamento({ ...filtrosProcessamento, acao: v || undefined });
                else setFiltrosGeral({ ...filtrosGeral, acao: v || undefined });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as ações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                {ACOS_AUDITORIA.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="severidade" className="block text-sm font-medium mb-1">
              Severidade
            </Label>
            <Select
              value={(abaAtiva === 'funcionario' ? filtrosFuncionario.severidade : abaAtiva === 'processamento' ? filtrosProcessamento.severidade : filtrosGeral.severidade) || ''}
              onValueChange={(v) => {
                if (abaAtiva === 'funcionario') setFiltrosFuncionario({ ...filtrosFuncionario, severidade: v || undefined });
                else if (abaAtiva === 'processamento') setFiltrosProcessamento({ ...filtrosProcessamento, severidade: v || undefined });
                else setFiltrosGeral({ ...filtrosGeral, severidade: v || undefined });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                {SEVERIDADES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="desde" className="block text-sm font-medium mb-1">
              De
            </Label>
            <Input
              id="desde"
              type="date"
              value={(abaAtiva === 'funcionario' ? filtrosFuncionario.desde : abaAtiva === 'processamento' ? filtrosProcessamento.desde : filtrosGeral.desde) || ''}
              onChange={(e) => {
                const v = e.target.value || undefined;
                if (abaAtiva === 'funcionario') setFiltrosFuncionario({ ...filtrosFuncionario, desde: v });
                else if (abaAtiva === 'processamento') setFiltrosProcessamento({ ...filtrosProcessamento, desde: v });
                else setFiltrosGeral({ ...filtrosGeral, desde: v });
              }}
            />
          </div>

          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="ate" className="block text-sm font-medium mb-1">
              Até
            </Label>
            <Input
              id="ate"
              type="date"
              value={(abaAtiva === 'funcionario' ? filtrosFuncionario.ate : abaAtiva === 'processamento' ? filtrosProcessamento.ate : filtrosGeral.ate) || ''}
              onChange={(e) => {
                const v = e.target.value || undefined;
                if (abaAtiva === 'funcionario') setFiltrosFuncionario({ ...filtrosFuncionario, ate: v });
                else if (abaAtiva === 'processamento') setFiltrosProcessamento({ ...filtrosProcessamento, ate: v });
                else setFiltrosGeral({ ...filtrosGeral, ate: v });
              }}
            />
          </div>

          <div className="flex items-end gap-2">
            <Label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={(abaAtiva === 'funcionario' ? filtrosFuncionario.incluirArquivados : abaAtiva === 'processamento' ? filtrosProcessamento.incluirArquivados : filtrosGeral.incluirArquivados) || false}
                onChange={(e) => {
                  const v = e.target.checked;
                  if (abaAtiva === 'funcionario') setFiltrosFuncionario({ ...filtrosFuncionario, incluirArquivados: v });
                  else if (abaAtiva === 'processamento') setFiltrosProcessamento({ ...filtrosProcessamento, incluirArquivados: v });
                  else setFiltrosGeral({ ...filtrosGeral, incluirArquivados: v });
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">Incluir arquivados</span>
            </Label>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={carregar} disabled={carregando} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'A carregar...' : 'Actualizar'}
          </Button>
          <Button variant="outline" onClick={limparFiltros} className="flex-1 sm:flex-none">
            <Filter className="mr-2 h-4 w-4" />
            Limpar
          </Button>
          <Button variant="outline" onClick={exportarCsv} disabled={registos.length === 0} className="flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Tabela de resultados */}
      <div className="flex-1 overflow-hidden">
        {registos.length === 0 && !carregando ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Search className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg">Nenhum registo encontrado</p>
            <p className="text-sm">Ajuste os filtros e clique em Actualizar</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <Table>
              <TableCaption className="p-4 text-left text-sm text-muted-foreground">
                {total} registo{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}{temMais ? ' (carregue mais no final)' : ''}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableCell className="w-[160px]">Data/Hora</TableCell>
                  <TableCell className="w-[140px]">Utilizador</TableCell>
                  <TableCell className="w-[100px]">Ação</TableCell>
                  <TableCell className="w-[100px]">Severidade</TableCell>
                  <TableCell className="w-[200px]">Entidade</TableCell>
                  <TableCell className="w-[120px]">ID Entidade</TableCell>
                  <TableCell>Descrição</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registos.map((registo) => (
                  <TableRow key={registo.id} className={registo.arquivado ? 'opacity-50' : ''}>
                    <TableCell><DataHoraCell dataHora={registo.dataHora} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{registo.utilizadorNome || registo.utilizadorLogin || 'Sistema'}</span>
                        {registo.utilizadorLogin && registo.utilizadorNome !== registo.utilizadorLogin && (
                          <span className="text-xs text-muted-foreground">@{registo.utilizadorLogin}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><AcaoBadge acao={registo.acao} /></TableCell>
                    <TableCell><SeveridadeBadge severidade={registo.severidade} /></TableCell>
                    <TableCell className="font-mono text-sm">{registo.entidade}</TableCell>
                    <TableCell className="font-mono text-sm">{registo.entidadeId || '-'}</TableCell>
                    <TableCell className="max-w-[400px] truncate" title={registo.descricao}>
                      {registo.descricao}
                    </TableCell>
                  </TableRow>
                ))}
                {temMais && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      <Button variant="outline" onClick={carregarMais} disabled={carregando}>
                        {carregando ? 'A carregar...' : 'Carregar mais'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      {/* Detalhes do registo selecionado - podia ser expandido com Popover se necessário */}
      <TooltipProvider>
        {registos.length > 0 && (
          <div className="border-t p-4 bg-muted/30 text-xs text-muted-foreground">
            <p>Dica: Passe o mouse sobre a descrição para ver o texto completo. Registos arquivados aparecem com opacidade reduzida.</p>
          </div>
        )}
      </TooltipProvider>
    </div>
  );
}