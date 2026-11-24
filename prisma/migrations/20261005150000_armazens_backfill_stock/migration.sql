-- =============================================================================
-- Backfill: liga os armazéns a uma empresa, normaliza os lotes em texto livre
-- para a entidade `lotes` e materializa o saldo em `estoques`.
--
-- Contexto (docs/warehouse/00-current-state.md, decisões D2 e D4):
--   - `armazens` passou a ter `empresa_id`; a tabela tem de ser preenchida.
--   - `movimentos_stock.lote` era texto livre; passa a haver `lote_id`.
--   - O saldo deixou de ser uma `SUM` calculada em cada consulta e passa a
--     viver em `estoques`. Esta migration reconstrói esse saldo a partir do
--     livro-razão, usando exactamente a mesma aritmética que o serviço aplicava
--     antes (`TIPOS_ENTRADA` / `TIPOS_SAIDA`, stock.service.ts).
--
-- A migration é idempotente: volta a correr sem duplicar nada.
--
-- Nenhum movimento legado tem localizações: `localizacao_id` fica NULL
-- e o saldo é materializado ao nível do armazém (decisão D4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `armazens.empresa_id`
--
-- Só é preenchido quando existe uma única empresa. Havendo várias, atribuir um
-- armazém a uma empresa arbitrária seria inventar pertença: nesses casos a
-- coluna fica NULL e a atribuição é uma decisão de negócio, não de migration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    total_empresas INTEGER;
    unica_empresa  TEXT;
BEGIN
    SELECT COUNT(*) INTO total_empresas FROM empresa_config;

    IF total_empresas = 1 THEN
        SELECT id INTO unica_empresa FROM empresa_config LIMIT 1;

        UPDATE armazens
           SET empresa_id = unica_empresa
         WHERE empresa_id IS NULL;

        RAISE NOTICE 'Backfill: % armazém(s) ligado(s) à empresa %.',
            (SELECT COUNT(*) FROM armazens WHERE empresa_id IS NOT NULL), unica_empresa;
    ELSE
        RAISE NOTICE 'Backfill: % empresas configuradas — `armazens.empresa_id` deixado NULL para atribuição manual.',
            total_empresas;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Lotes a partir do texto livre
--
-- Origem: `movimentos_stock.lote`, `linhas_guia_recepcao.lote` e
-- `linhas_guia_entrega.lote`. Só entram valores não vazios. O `id` é derivado de
-- `artigo_id + numero_lote`, o que torna a inserção repetível.
--
-- A validade só existe em `linhas_guia_recepcao`; quando o mesmo lote aparece
-- em várias linhas com validades diferentes, fica a mais antiga, por ser a mais
-- conservadora para o FEFO.
-- -----------------------------------------------------------------------------
INSERT INTO lotes (id, artigo_id, numero_lote, data_validade, preco_custo, created_at, updated_at)
SELECT
    'cl' || substr(md5(l.artigo_id || '|' || l.numero_lote), 1, 23),
    l.artigo_id,
    l.numero_lote,
    l.data_validade,
    l.preco_custo,
    now(),
    now()
FROM (
    SELECT m.artigo_id,
           btrim(m.lote) AS numero_lote,
           NULL::DATE     AS data_validade,
           NULL::NUMERIC  AS preco_custo
      FROM movimentos_stock m
     WHERE m.lote IS NOT NULL AND btrim(m.lote) <> ''

    UNION ALL

    SELECT lr.artigo_id,
           btrim(lr.lote) AS numero_lote,
           MIN(lr.validade)::DATE AS data_validade,
           MIN(lr.preco_custo)    AS preco_custo
      FROM linhas_guia_recepcao lr
     WHERE lr.lote IS NOT NULL AND btrim(lr.lote) <> ''
     GROUP BY lr.artigo_id, btrim(lr.lote)
) l
ON CONFLICT (artigo_id, numero_lote) DO NOTHING;

-- Passa os movimentos a apontar para o lote normalizado. O texto em
-- `movimentos_stock.lote` é preservado: é histórico já registado e o serviço
-- ainda o pode ler durante a transição.
UPDATE movimentos_stock m
   SET lote_id = l.id
  FROM lotes l
 WHERE l.artigo_id = m.artigo_id
   AND l.numero_lote = btrim(m.lote)
   AND m.lote_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Materialização do saldo em `estoques`
--
-- Reproduz a aritmética que `stock.service.ts` aplicava:
--
--   TIPOS_ENTRADA = ['entrada', 'ajuste', 'transferencia']
--                   → somam ao armazém de DESTINO
--   TIPOS_SAIDA   = ['saida', 'consumo_producao', 'ajuste', 'transferencia']
--                   → subtraem ao armazém de ORIGEM
--
-- `ajuste` aparece nas duas listas de propósito: o inventário grava a diferença
-- com sinal implícito, preenchendo só o destino ou só a origem.
--
-- O saldo é reconstruído por agregação a partir de todo o livro-razão, e não
-- por incremento a partir de um total pré-calculado — assim o resultado não
-- depende da ordem de aplicação e a operação é repetível.
--
-- Só são guardadas posições com saldo diferente de zero: uma posição a zero não
-- transporta informação, e `esgotado` é um estado que o serviço atribui quando
-- esvazia uma posição.
--
-- O custo unitário é a média ponderada das entradas, por ser o único valor que
-- se pode reconstruir do livro-razão sem lote. O PMP por artigo continua a ser
-- o de `artigos.preco_custo_medio`.
-- -----------------------------------------------------------------------------
DELETE FROM estoques;

WITH entradas AS (
    -- Entradas somam ao armazém de DESTINO. Uma `saida` não entra aqui: tem o
    -- destino nulo, e o seu armazém é o de origem.
    SELECT m.artigo_id,
           m.armazem_destino_id AS armazem_id,
           m.lote_id,
           m.quantidade        AS qtd_entrada,
           0                   AS qtd_saida,
           m.custo_unitario
      FROM movimentos_stock m
     WHERE m.armazem_destino_id IS NOT NULL
       AND m.tipo IN ('entrada', 'ajuste', 'transferencia')
),
saidas AS (
    -- Saídas subtraem ao armazém de ORIGEM. Uma transferência aparece nos dois
    -- ramos: entra no destino e sai da origem.
    SELECT m.artigo_id,
           m.armazem_origem_id  AS armazem_id,
           m.lote_id,
           0                    AS qtd_entrada,
           m.quantidade         AS qtd_saida,
           0                    AS custo_unitario
      FROM movimentos_stock m
     WHERE m.armazem_origem_id IS NOT NULL
       AND m.tipo IN ('saida', 'consumo_producao', 'ajuste', 'transferencia')
),
saldos AS (
    SELECT
        artigo_id,
        armazem_id,
        lote_id,
        SUM(qtd_entrada) - SUM(qtd_saida) AS quantidade,
        -- Média ponderada das entradas, para o custo unitário da posição.
        CASE
            WHEN SUM(qtd_entrada) > 0
            THEN SUM(qtd_entrada * custo_unitario) / SUM(qtd_entrada)
            ELSE 0
        END AS custo_unitario
      FROM (
          SELECT * FROM entradas
          UNION ALL
          SELECT * FROM saidas
      ) movimentos
     GROUP BY artigo_id, armazem_id, lote_id
)
INSERT INTO estoques (
    id, artigo_id, armazem_id, localizacao_id, lote_id,
    quantidade, quantidade_reservada, custo_unitario, estado,
    created_at, updated_at
)
SELECT
    'cl' || substr(md5(s.artigo_id || '|' || s.armazem_id || '|' ||
                       COALESCE(s.lote_id, '')), 1, 23),
    s.artigo_id,
    s.armazem_id,
    NULL,
    s.lote_id,
    s.quantidade,
    0,
    ROUND(s.custo_unitario, 4),
    'disponivel',
    now(),
    now()
  FROM saldos s
 WHERE s.quantidade <> 0
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Verificação
--
-- O saldo materializado tem de ser exactamente o que o cálculo antigo devolvia.
-- Se divergir, a migration falha e nada é aplicado: um stock errado que passes
-- despercebido é pior do que uma migration que não corre.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    divergentes INTEGER;
BEGIN
    -- Esta verificação é escrita de forma DELIBERADAMENTE diferente da
    -- inserção acima: percorre as Movements numa só passagem, com somas
    -- condicionais, em vez de separar entradas e saídas em dois ramos. Se
    -- voltasse a usar a mesma expressão da inserção, só confirmaria que a
    -- inserção é consistente consigo própria — foi exactamente isso que
    -- deixou passar uma primeira versão que ignorava as saídas.
    WITH pares AS (
        SELECT artigo_id, armazem_destino_id AS armazem_id, lote_id,
               quantidade, tipo, 'destino' AS lado
          FROM movimentos_stock
         WHERE armazem_destino_id IS NOT NULL
        UNION ALL
        SELECT artigo_id, armazem_origem_id, lote_id,
               quantidade, tipo, 'origem'
          FROM movimentos_stock
         WHERE armazem_origem_id IS NOT NULL
    ),
    esperado AS (
        SELECT artigo_id,
               armazem_id,
               lote_id,
               SUM(
                   CASE
                       WHEN lado = 'destino'
                        AND tipo IN ('entrada', 'ajuste', 'transferencia') THEN quantidade
                       WHEN lado = 'origem'
                        AND tipo IN ('saida', 'consumo_producao', 'ajuste', 'transferencia') THEN -quantidade
                       ELSE 0
                   END
               ) AS quantidade
          FROM pares
         GROUP BY artigo_id, armazem_id, lote_id
        HAVING SUM(
                   CASE
                       WHEN lado = 'destino'
                        AND tipo IN ('entrada', 'ajuste', 'transferencia') THEN quantidade
                       WHEN lado = 'origem'
                        AND tipo IN ('saida', 'consumo_producao', 'ajuste', 'transferencia') THEN -quantidade
                       ELSE 0
                   END
               ) <> 0
    ),
    obtido AS (
        SELECT artigo_id, armazem_id, lote_id, quantidade FROM estoques
    )
    SELECT COUNT(*) INTO divergentes
      FROM (
        (SELECT artigo_id, armazem_id, lote_id, quantidade FROM esperado
         EXCEPT
         SELECT artigo_id, armazem_id, lote_id, quantidade FROM obtido)
        UNION ALL
        (SELECT artigo_id, armazem_id, lote_id, quantidade FROM obtido
         EXCEPT
         SELECT artigo_id, armazem_id, lote_id, quantidade FROM esperado)
      ) divergencia;

    IF divergentes > 0 THEN
        RAISE EXCEPTION
            'Backfill de stock inconsistente: % posição(ões) divergem entre o livro-razão e `estoques`. Nenhuma alteração foi aplicada.',
            divergentes;
    END IF;

    -- Um armazém pode ficar a dever stock negativo: os movimentos já o
    -- diziam antes desta fase e materializá-los não é o momento para corrigir
    -- o histórico. Deixa-se registado em vez de falhar a migration.
    IF EXISTS (SELECT 1 FROM estoques WHERE quantidade < 0) THEN
        RAISE WARNING
            'Backfill: % posição(ões) com saldo negativo — o livro-razão já permitia esse estado antes desta fase.',
            (SELECT COUNT(*) FROM estoques WHERE quantidade < 0);
    END IF;

    RAISE NOTICE 'Backfill: % posição(ões) de stock materializadas e verificadas.',
        (SELECT COUNT(*) FROM estoques);
END $$;