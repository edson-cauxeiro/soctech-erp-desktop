/**
 * @file useDocumentoBase.ts
 * @description Hook partilhado pelos gestores de documentos fiscais (FP, GR, RC) que carrega
 * os dados mestres comuns: empresa emissora, séries ativas tipadas, clientes, artigos e armazéns.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArtigoDto,
  ArmazemDto,
  ClienteDto,
  SerieDocumentoDto,
  TipoSerieDocumento,
} from "../@types/electron";
import { clienteApi } from "../api/cliente.api";
import { artigoApi } from "../api/artigo.api";
import { armazemApi } from "../api/armazem.api";
import { serieApi } from "../api/serie.api";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface DocumentoBaseData {
  empresaId: string;
  series: SerieDocumentoDto[];
  setSeries: React.Dispatch<React.SetStateAction<SerieDocumentoDto[]>>;
  clientes: ClienteDto[];
  artigos: ArtigoDto[];
  armazens: ArmazemDto[];
  isLoading: boolean;
  reload: () => Promise<void>;
  /**
   * Lê as séries ativas de um tipo de documento. É intencionalmente livre de efeitos
   * secundários: cada gestor guarda a sua própria lista para não misturar, por exemplo,
   * as séries GR do formulário com as séries FT do modal de faturamento.
   */
  fetchSeries: (tipo: TipoSerieDocumento) => Promise<SerieDocumentoDto[]>;
}

export function useDocumentoBase(): DocumentoBaseData {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";
  const [series, setSeries] = useState<SerieDocumentoDto[]>([]);
  const [clientes, setClientes] = useState<ClienteDto[]>([]);
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resCli, resArt, resArm] = await Promise.all([
        clienteApi.list({ take: 200, estado: "ativo" }),
        artigoApi.list({ take: 200, estado: "ativo" }),
        armazemApi.list({ take: 100, ativo: true }),
      ]);

      if (resCli.success) setClientes(resCli.data.items);
      if (resArt.success) setArtigos(resArt.data.items);
      if (resArm.success) setArmazens(resArm.data.items);

      if (!resArt.success) {
        toast.error("Não foi possível carregar os artigos: " + resArt.error.message);
      }
    } catch {
      toast.error("Erro ao carregar dados auxiliares de documentos.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Lê as séries ativas de um tipo de documento, sem alterar o estado `series`. */
  const fetchSeries = useCallback(
    async (tipo: TipoSerieDocumento): Promise<SerieDocumentoDto[]> => {
      if (!empresaId) return [];
      try {
        const res = await serieApi.list(empresaId, tipo);
        return res.success ? res.data.filter((s) => s.estado !== "inativo") : [];
      } catch {
        return [];
      }
    },
    [empresaId]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { empresaId, series, setSeries, clientes, artigos, armazens, isLoading, reload, fetchSeries };
}
