-- =============================================================================
-- Verificação do saldo materializado de stock
--
-- Corre: `estoques` (o saldo corrente) tem de coincidir, posição a posição, com
-- o que se obtém do livro-razão (`movimentos_stock`) aplicando a aritmética que o
-- serviço usava antes de `estoques` existir:
--
--   entradas somam ao armazém de DESTINO     → entrada, ajuste, transferencia
--   saídas   subtraem ao armazém de ORIGEM  → saida, consumo_producao, ajuste,
--                                               transferencia
--
-- Esta verificação é escrita de propósito de forma diferente da migration que
-- construiu `estoques`: percorre os movimentos numa só passagem, com somas
-- condicionais, em vez de separar entradas e saídas em dois ramos. Escrever
-- ambas com a mesma expressão não serviria para nada — apenas confirmaria que a
-- inserção é consistente consigo própria. Foi exactamente esse o defeito da
-- primeira versão da migration, que ignorava as saídas e que a verificação,
-- escrita à sua imagem, aprovou sem reparar.
--
-- Uso:
--   docker exec -i doraerp_postgres psql -U doraerp_user -d doraerp -f - < prisma/verificar_stock.sql
--
-- Sai com código != 0 e imprime as divergências se algo estiver errado.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    divergentes   INTEGER;
    resumo        TEXT;
BEGIN
    WITH pares AS (
        SELECT artigo_id, armazem_destino_id AS armazem_id, lote_id, quantidade, tipo, 'destino' AS lado
          FROM movimentos_stock
         WHERE armazem_destino_id IS NOT NULL
        UNION ALL
        SELECT artigo_id, armazem_origem_id, lote_id, quantidade, tipo, 'origem'
          FROM movimentos_stock
         WHERE armazem_origem_id IS NOT NULL
    ),
    esperado AS (
        SELECT artigo_id,
               armazem_id,
               lote_id,
               SUM(CASE
                       WHEN lado = 'destino' AND tipo IN ('entrada', 'ajuste', 'transferencia') THEN quantidade
                       WHEN lado = 'origem'  AND tipo IN ('saida', 'consumo_producao', 'ajuste', 'transferencia') THEN -quantidade
                       ELSE 0
                   END) AS quantidade
          FROM pares
         GROUP BY artigo_id, armazem_id, lote_id
        HAVING SUM(CASE
                       WHEN lado = 'destino' AND tipo IN ('entrada', 'ajuste', 'transferencia') THEN quantidade
                       WHEN lado = 'origem'  AND tipo IN ('saida', 'consumo_producao', 'ajuste', 'transferencia') THEN -quantidade
                       ELSE 0
                   END) <> 0
    ),
    obtido AS (
        SELECT artigo_id, armazem_id, lote_id, quantidade FROM estoques
    ),
    divergencia AS (
        (SELECT * FROM esperado EXCEPT SELECT * FROM obtido)
        UNION ALL
        (SELECT * FROM obtido EXCEPT SELECT * FROM esperado)
    )
    SELECT COUNT(*) INTO divergentes FROM divergencia;

    IF divergentes > 0 THEN
        SELECT string_agg(
                   format('artigo=%s armazem=%s lote=%s esperado=%s',
                          d.artigo_id, d.armazem_id, COALESCE(d.lote_id, '-'), d.quantidade),
                   E'\n  ')
          INTO resumo
          FROM divergencia d;

        RAISE EXCEPTION E'% posição(ões) divergem entre o livro-razão e `estoques`:\n  %',
            divergentes, resumo;
    END IF;

    -- As constraints abaixo são a rede de segurança final. Se alguma vez
    -- falhar, o saldo já está corrompido e o problema não é de aritmética.
    IF EXISTS (SELECT 1 FROM estoques WHERE quantidade < 0) THEN
        RAISE EXCEPTION 'Há % posição(ões) com saldo negativo.', (SELECT COUNT(*) FROM estoques WHERE quantidade < 0);
    END IF;

    IF EXISTS (SELECT 1 FROM estoques WHERE quantidade_reservada > quantidade) THEN
        RAISE EXCEPTION 'Há % posição(ões) com reserva acima do disponível.',
            (SELECT COUNT(*) FROM estoques WHERE quantidade_reservada > quantidade);
    END IF;

    RAISE NOTICE 'OK: % posição(ões) de stock conferem com o livro-razão.',
        (SELECT COUNT(*) FROM estoques);
END $$;

-- Saldo por artigo e armazém, para leitura directa.
SELECT a.codigo                    AS artigo,
       ar.codigo                   AS armazem,
       e.quantidade                AS quantidade,
       e.quantidade_reservada      AS reservada,
       e.quantidade - e.quantidade_reservada AS disponivel,
       e.custo_unitario,
       e.estado,
       l.numero_lote               AS lote
  FROM estoques e
  JOIN artigos  a  ON a.id  = e.artigo_id
  JOIN armazens ar ON ar.id = e.armazem_id
  LEFT JOIN lotes l ON l.id  = e.lote_id
 ORDER BY a.codigo, ar.codigo, l.numero_lote NULLS FIRST;