-- Reconcilia o contador MOV com movimentos criados antes da sequência atómica.
-- Sem isto, `proximoNumero` começa em 00001 e colide com `numero` já existente.
INSERT INTO sequencias (id, escopo, ano, valor, updated_at)
SELECT
  md5('MOV-' || ano::text || clock_timestamp()::text || random()::text),
  'MOV',
  ano,
  max_numero,
  now()
FROM (
  SELECT
    substring(numero from '^MOV-([0-9]{4})/')::int AS ano,
    max(substring(numero from '/([0-9]+)$')::int) AS max_numero
  FROM movimentos_stock
  WHERE numero ~ '^MOV-[0-9]{4}/[0-9]+$'
  GROUP BY 1
) AS max_por_ano
ON CONFLICT (escopo, ano) DO UPDATE
SET valor = GREATEST(sequencias.valor, EXCLUDED.valor),
    updated_at = now();
