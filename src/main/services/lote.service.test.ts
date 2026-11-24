/**
 * @file lote.service.test.ts
 * @description Testes do LoteService (EPIC 8, TASK-041).
 *
 * O foco está nas invariantes que a base de dados não impõe sozinha: o número
 * de lote é único por artigo (não globalmente), o artigo/fornecedor têm de
 * existir, e um lote com saldo não pode ser apagado. A leitura da antecedência
 * de alerta também é validada, por depender da configuração da empresa.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LoteService } from "./lote.service";
import { NotFoundError, ConflictError, BusinessRuleError } from "../utils/errors";

function criarMockPrisma() {
  return {
    artigo: { findUnique: vi.fn() },
    fornecedor: { findUnique: vi.fn() },
    lote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    estoque: { count: vi.fn() },
    empresaConfig: { findFirst: vi.fn() },
  };
}

describe("LoteService", () => {
  let prisma: ReturnType<typeof criarMockPrisma>;
  let service: LoteService;

  beforeEach(() => {
    prisma = criarMockPrisma();
    service = new LoteService(prisma as never);
  });

  describe("criar", () => {
    it("recusa quando o artigo não existe", async () => {
      prisma.artigo.findUnique.mockResolvedValue(null);

      await expect(
        service.criar({ artigoId: "art-x", numeroLote: "L-1" })
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.lote.create).not.toHaveBeenCalled();
    });

    it("recusa quando o fornecedor indicado não existe", async () => {
      prisma.artigo.findUnique.mockResolvedValue({ id: "art-1", codigo: "A1" });
      prisma.fornecedor.findUnique.mockResolvedValue(null);

      await expect(
        service.criar({ artigoId: "art-1", numeroLote: "L-1", fornecedorId: "for-x" })
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.lote.create).not.toHaveBeenCalled();
    });

    it("recusa número de lote duplicado no mesmo artigo", async () => {
      prisma.artigo.findUnique.mockResolvedValue({ id: "art-1", codigo: "A1" });
      prisma.lote.findUnique.mockResolvedValue({ id: "lote-existente" });

      await expect(
        service.criar({ artigoId: "art-1", numeroLote: "L-1" })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(prisma.lote.create).not.toHaveBeenCalled();
    });

    it("cria o lote com os dados normalizados", async () => {
      prisma.artigo.findUnique.mockResolvedValue({ id: "art-1", codigo: "A1" });
      prisma.lote.findUnique.mockResolvedValue(null);
      prisma.lote.create.mockResolvedValue({ id: "lote-1", numeroLote: "L-1" });

      const resultado = await service.criar({
        artigoId: "art-1",
        numeroLote: "L-1",
        dataValidade: "2030-01-01",
        precoCusto: 12.5,
      });

      expect(resultado).toEqual({ id: "lote-1", numeroLote: "L-1" });
      const argumento = prisma.lote.create.mock.calls[0][0];
      expect(argumento.data.artigoId).toBe("art-1");
      expect(argumento.data.numeroLote).toBe("L-1");
      expect(argumento.data.dataValidade).toBeInstanceOf(Date);
      expect(argumento.data.precoCusto).not.toBeNull();
    });
  });

  describe("actualizar", () => {
    it("recusa quando o lote não existe", async () => {
      prisma.lote.findUnique.mockResolvedValue(null);

      await expect(
        service.actualizar("lote-x", { numeroLote: "L-2" })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("recusa mudar para um número já usado no mesmo artigo", async () => {
      prisma.lote.findUnique
        .mockResolvedValueOnce({ id: "lote-1", artigoId: "art-1", numeroLote: "L-1" })
        .mockResolvedValueOnce({ id: "lote-2" });

      await expect(
        service.actualizar("lote-1", { numeroLote: "L-2" })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(prisma.lote.update).not.toHaveBeenCalled();
    });

    it("actualiza os campos indicados", async () => {
      prisma.lote.findUnique.mockResolvedValue({
        id: "lote-1",
        artigoId: "art-1",
        numeroLote: "L-1",
      });
      prisma.lote.update.mockResolvedValue({ id: "lote-1", numeroLote: "L-1" });

      await service.actualizar("lote-1", {
        dataValidade: "2031-06-30",
        observacoes: "Lote revisto",
      });

      const argumento = prisma.lote.update.mock.calls[0][0];
      expect(argumento.where).toEqual({ id: "lote-1" });
      expect(argumento.data.dataValidade).toBeInstanceOf(Date);
      expect(argumento.data.observacoes).toBe("Lote revisto");
      expect(argumento.data).not.toHaveProperty("artigoId");
    });
  });

  describe("remover", () => {
    it("recusa quando o lote não existe", async () => {
      prisma.lote.findUnique.mockResolvedValue(null);

      await expect(service.remover("lote-x")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("recusa apagar um lote que ainda tem stock", async () => {
      prisma.lote.findUnique.mockResolvedValue({ id: "lote-1", numeroLote: "L-1" });
      prisma.estoque.count.mockResolvedValue(3);

      await expect(service.remover("lote-1")).rejects.toBeInstanceOf(BusinessRuleError);
      expect(prisma.lote.delete).not.toHaveBeenCalled();
    });

    it("apaga um lote sem stock", async () => {
      prisma.lote.findUnique.mockResolvedValue({ id: "lote-1", numeroLote: "L-1" });
      prisma.estoque.count.mockResolvedValue(0);
      prisma.lote.delete.mockResolvedValue({ id: "lote-1" });

      await expect(service.remover("lote-1")).resolves.toEqual({ id: "lote-1" });
      expect(prisma.lote.delete).toHaveBeenCalledWith({ where: { id: "lote-1" } });
    });
  });

  describe("obterPorId", () => {
    it("recusa quando o lote não existe", async () => {
      prisma.lote.findUnique.mockResolvedValue(null);

      await expect(service.obterPorId("lote-x")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("listar", () => {
    it("usa a antecedência configurada na empresa para o filtro 'proximo_caducar'", async () => {
      prisma.empresaConfig.findFirst.mockResolvedValue({ diasAlertaValidade: 30 });
      prisma.lote.count.mockResolvedValue(0);
      prisma.lote.findMany.mockResolvedValue([]);

      const resultado = await service.listar({ estadoValidade: "proximo_caducar" });

      expect(prisma.empresaConfig.findFirst).toHaveBeenCalled();
      expect(resultado.total).toBe(0);
      expect(resultado.items).toEqual([]);
    });
  });
});