export const TIPOS_PROCESSAMENTO = [
  "VENCIMENTO",
  "SUBSIDIO_FERIAS",
  "SUBSIDIO_NATAL",
  "EXTRAORDINARIO",
  "FIM_CONTRATO",
] as const;

export type TipoProcessamento = (typeof TIPOS_PROCESSAMENTO)[number];

export const ROTULO_TIPO: Record<TipoProcessamento, string> = {
  VENCIMENTO: "Vencimento",
  SUBSIDIO_FERIAS: "Subsídio de Férias",
  SUBSIDIO_NATAL: "Subsídio de Natal",
  EXTRAORDINARIO: "Extraordinário",
  FIM_CONTRATO: "Fim de Contrato",
};

export const ABREV_TIPO: Record<TipoProcessamento, string> = {
  VENCIMENTO: "Venc.",
  SUBSIDIO_FERIAS: "Sub. Férias",
  SUBSIDIO_NATAL: "Sub. Natal",
  EXTRAORDINARIO: "Extra.",
  FIM_CONTRATO: "Fim Contrato",
};
