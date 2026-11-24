import React from 'react';
import { DocumentoPrintModel } from './documento-print.types';
import '../../styles/documentos-print.css';

interface DocumentoA4Props {
  documento: DocumentoPrintModel;
}

export const DocumentoA4: React.FC<DocumentoA4Props> = ({ documento }) => {
  const isAnulado = documento.estado === 'anulado';
  const isGuia = documento.tipoDocumento === 'GR';
  const isRecibo = documento.tipoDocumento === 'RC';
  const isMonetary = !isGuia;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', {
      style: 'currency',
      currency: documento.moeda || 'AOA',
    }).format(val);
  };

  const formatDate = (d: string | Date | null | undefined) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pt-PT');
  };

  // Os dados bancários chegam prontos do processo principal, lidos da
  // `ContaBancaria`. Não há segunda fonte a adivinhar.
  const contasBancarias = documento.contasBancarias || [];

  return (
    <div
      data-document-print
      className="a4-document-page shadow-lg rounded-sm border border-slate-200 text-slate-800 text-xs"
    >
      {/* Marca de água para documentos anulados */}
      {isAnulado && <div className="watermark-anulado">DOCUMENTO ANULADO</div>}

      {/* CABEÇALHO */}
      <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
        {/* Lado Esquerdo: Logotipo e Dados da Empresa Emissora */}
        <div className="flex gap-4 items-center max-w-[55%]">
          {documento.emissor.logotipoUrl ? (
            <img
              src={documento.emissor.logotipoUrl}
              alt={documento.emissor.nome}
              className="max-h-20 max-w-[140px] object-contain rounded"
            />
          ) : (
            <div className="w-16 h-16 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xl uppercase tracking-wider">
              {documento.emissor.nome.substring(0, 2)}
            </div>
          )}
          <div>
            <h1 className="text-base font-bold text-slate-950 uppercase leading-tight">
              {documento.emissor.nome}
            </h1>
            <p className="text-slate-600 mt-1">
              <span className="font-semibold text-slate-800">NIF:</span> {documento.emissor.nif}
            </p>
            {documento.emissor.endereco && (
              <p className="text-slate-600">{documento.emissor.endereco}</p>
            )}
            <div className="flex gap-3 text-slate-600 mt-0.5">
              {documento.emissor.telefone && <span>Tel: {documento.emissor.telefone}</span>}
              {documento.emissor.email && <span>Email: {documento.emissor.email}</span>}
            </div>
            {documento.emissor.regimeIva && (
              <p className="text-[10px] text-slate-500 mt-1">
                Regime IVA: <span className="uppercase">{documento.emissor.regimeIva}</span>
                {documento.emissor.motivoIsencao ? ` (${documento.emissor.motivoIsencao})` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Lado Direito: Identificação do Documento */}
        <div className="text-right max-w-[40%]">
          <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-sm font-bold uppercase tracking-wide">
            {documento.tituloDocumento}
          </div>
          <div className="mt-2 text-sm font-bold text-slate-950">{documento.numero}</div>
          <div className="text-slate-600 mt-1 space-y-0.5">
            <div>
              <span className="font-medium">Data de Emissão:</span> {formatDate(documento.dataEmissao)}
            </div>
            {documento.dataVencimento && (
              <div>
                <span className="font-medium">Data de Vencimento:</span>{' '}
                {formatDate(documento.dataVencimento)}
              </div>
            )}
            {documento.documentoOrigem && (
              <div className="text-[11px] text-indigo-700 font-semibold mt-1">
                Ref. {documento.documentoOrigem.tipo}: {documento.documentoOrigem.numero}
              </div>
            )}
            {documento.atcud && (
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                ATCUD: {documento.atcud}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DESTINATÁRIO / CLIENTE */}
      <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Exmo.(s) Sr.(s) / Cliente
        </div>
        <div className="text-sm font-bold text-slate-950">{documento.destinatario.nome}</div>
        <div className="grid grid-cols-2 gap-2 mt-1 text-slate-700">
          <div>
            <span className="font-medium text-slate-900">NIF:</span>{' '}
            {documento.destinatario.nif || 'Consumidor Final'}
          </div>
          {documento.destinatario.telefone && (
            <div>
              <span className="font-medium text-slate-900">Telefone:</span>{' '}
              {documento.destinatario.telefone}
            </div>
          )}
          {documento.destinatario.endereco && (
            <div className="col-span-2">
              <span className="font-medium text-slate-900">Endereço:</span>{' '}
              {documento.destinatario.endereco}
            </div>
          )}
        </div>
      </div>

      {/* TABELA DE LINHAS */}
      <div className="mb-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-[11px]">
              <th className="py-2 px-2 text-left w-20">Código</th>
              <th className="py-2 px-2 text-left">Descrição</th>
              <th className="py-2 px-2 text-center w-12">Un.</th>
              <th className="py-2 px-2 text-right w-16">Qtd.</th>
              {isMonetary && <th className="py-2 px-2 text-right w-24">Preço Unit.</th>}
              {isMonetary && <th className="py-2 px-2 text-right w-16">Desc. %</th>}
              {isMonetary && <th className="py-2 px-2 text-right w-16">Taxa IVA</th>}
              {isMonetary && <th className="py-2 px-2 text-right w-24">Total</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-[11px]">
            {documento.linhas.map((linha, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                <td className="py-2 px-2 font-mono text-slate-700">{linha.codigo}</td>
                <td className="py-2 px-2 text-slate-900 font-medium">
                  {linha.descricao}
                  {linha.lote && (
                    <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                      Lote: {linha.lote}
                    </span>
                  )}
                  {linha.motivoIsencao && (
                    <div className="text-[10px] text-slate-500 italic mt-0.5">
                      {linha.motivoIsencao}
                    </div>
                  )}
                </td>
                <td className="py-2 px-2 text-center text-slate-600">{linha.unidade}</td>
                <td className="py-2 px-2 text-right font-semibold text-slate-800">
                  {linha.quantidade}
                </td>
                {isMonetary && (
                  <td className="py-2 px-2 text-right text-slate-700">
                    {formatCurrency(linha.precoUnitario)}
                  </td>
                )}
                {isMonetary && (
                  <td className="py-2 px-2 text-right text-slate-600">
                    {linha.desconto > 0 ? `${linha.desconto}%` : '-'}
                  </td>
                )}
                {isMonetary && (
                  <td className="py-2 px-2 text-right text-slate-600">{linha.taxaIva}%</td>
                )}
                {isMonetary && (
                  <td className="py-2 px-2 text-right font-semibold text-slate-950">
                    {formatCurrency(linha.totalLinha)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOTAIS E RESUMO DE IVA (Apenas para documentos monetários) */}
      {isMonetary && (
        <div className="grid grid-cols-12 gap-4 mb-4 items-start">
          {/* Resumo de IVA */}
          <div className="col-span-7">
            {documento.totais.resumoIva && documento.totais.resumoIva.length > 0 && (
              <div className="border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 uppercase">
                  Quadro de Resumo de Impostos (IVA)
                </div>
                <table className="w-full text-[10px] text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                      <th className="py-1 px-2 text-left">Taxa</th>
                      <th className="py-1 px-2 text-right">Incidência</th>
                      <th className="py-1 px-2 text-right">Valor Imposto</th>
                      <th className="py-1 px-2 text-left">Motivo de Isenção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {documento.totais.resumoIva.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 px-2 font-medium">{r.taxa}%</td>
                        <td className="py-1 px-2 text-right">{formatCurrency(r.baseIncidencia)}</td>
                        <td className="py-1 px-2 text-right font-semibold">
                          {formatCurrency(r.valorIva)}
                        </td>
                        <td className="py-1 px-2 text-slate-500 italic">
                          {r.motivoIsencao || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totais Gerais */}
          <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-3 space-y-1.5 text-right">
            <div className="flex justify-between text-slate-600">
              <span>Total Ilíquido:</span>
              <span className="font-medium text-slate-800">
                {formatCurrency(documento.totais.totalIliquido)}
              </span>
            </div>
            {documento.totais.totalDesconto > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto Comercial:</span>
                <span className="font-medium">
                  -{formatCurrency(documento.totais.totalDesconto)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Total IVA:</span>
              <span className="font-medium text-slate-800">
                {formatCurrency(documento.totais.totalIva)}
              </span>
            </div>
            {documento.totais.retencaoFonte && documento.totais.retencaoFonte > 0 ? (
              <div className="flex justify-between text-amber-700">
                <span>Retenção na Fonte:</span>
                <span className="font-medium">
                  -{formatCurrency(documento.totais.retencaoFonte)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-bold text-slate-950">
              <span>Total a Pagar:</span>
              <span className="text-base text-slate-900">
                {formatCurrency(documento.totais.totalLiquido)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* COORDENADAS BANCÁRIAS E FORMAS DE PAGAMENTO (SOLICITADO PELO UTILIZADOR) */}
      {contasBancarias.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <span>Contas Bancárias para Pagamento / Transferência</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {contasBancarias.map((conta, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded p-2">
                <div className="font-bold text-slate-900">{conta.banco}</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  <span className="text-slate-500 font-sans text-[10px]">IBAN: </span>
                  {conta.iban}
                </div>
                {conta.swift && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    SWIFT/BIC: {conta.swift}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OBSERVAÇÕES */}
      {documento.observacoes && (
        <div className="border border-slate-200 rounded p-2.5 mb-4 text-[11px] text-slate-700 bg-slate-50/50">
          <span className="font-bold text-slate-800">Observações:</span> {documento.observacoes}
        </div>
      )}

      {/* LIQUIDAÇÃO / ADIANTAMENTO (RC) */}
      {isRecibo && documento.pagamento && (
        <div className="border border-slate-200 rounded p-3 mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Detalhe do Recebimento
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">Meio de Pagamento:</span>
              <span className="font-medium uppercase text-slate-900">
                {documento.pagamento.meioPagamento}
              </span>
            </div>
            {documento.pagamento.contaBancaria && (
              <div className="flex justify-between">
                <span className="text-slate-500">Conta / Referência:</span>
                <span className="font-medium text-slate-900">
                  {documento.pagamento.contaBancaria}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Valor Recebido:</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(documento.pagamento.valorRecebido)}
              </span>
            </div>
            {documento.pagamento.retencaoFonte > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Retenção na Fonte:</span>
                <span className="font-medium text-amber-700">
                  -{formatCurrency(documento.pagamento.retencaoFonte)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Total Imputado:</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(
                  documento.pagamento.imputacoes.reduce((acc, i) => acc + i.valorImputado, 0)
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Saldo em Adiantamento:</span>
              <span className="font-bold text-emerald-700">
                {formatCurrency(documento.pagamento.saldoAdiantamento)}
              </span>
            </div>
          </div>
          {documento.pagamento.imputacoes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                Faturas Liquidadas
              </div>
              <ul className="text-[11px] text-slate-700 space-y-0.5">
                {documento.pagamento.imputacoes.map((imp, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="font-mono">{imp.faturaNumero}</span>
                    <span className="font-medium">{formatCurrency(imp.valorImputado)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* AVISO OBRIGATÓRIO DO TIPO DE DOCUMENTO */}
      {documento.notice && (
        <div className="border-2 border-amber-500 bg-amber-50 rounded p-3 mb-4 text-[11px] font-bold uppercase tracking-wide text-amber-900 text-center">
          {documento.notice}
        </div>
      )}

      {/* RODAPÉ FISCAL E QR CODE AGT */}
      <div className="border-t border-slate-300 pt-3 mt-auto flex justify-between items-center text-[10px] text-slate-500">
        <div className="space-y-0.5 max-w-[70%]">
          <p className="font-medium text-slate-700">
            Processado por programa validado n.º 000/AGT/2026 — SOC TECHNO Desktop
          </p>
          <p>Os bens/serviços foram colocados à disposição do adquirente na data do documento.</p>
          {documento.hashAssinatura && (
            <p className="font-mono text-[9px] text-slate-400 mt-0.5">
              Hash: {documento.hashAssinatura}
            </p>
          )}
        </div>

        {/* QR Code AGT */}
        {documento.qrDataUrl && (
          <div className="flex flex-col items-center">
            <img
              src={documento.qrDataUrl}
              alt="QR Code AGT"
              className="w-20 h-20 border border-slate-200 p-0.5 rounded bg-white"
            />
            <span className="text-[8px] text-slate-400 mt-0.5 uppercase tracking-tighter">
              Verificação AGT
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
