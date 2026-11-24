-- Uma conta bancária passa a pertencer obrigatoriamente a uma empresa.
-- Sem `empresa_id` não há como saber de quem é o dinheiro que o saldo mede.
--
-- Só se preenche quando existe uma única empresa: se houver mais do que uma,
-- adivinhar a empresa errada é pior do que travar a migração e pedir ao
-- operador que atribua cada conta à mão.
DO $$
DECLARE
    orfas      INTEGER;
    empresas   INTEGER;
    alvo       TEXT;
BEGIN
    SELECT COUNT(*) INTO orfas FROM contas_bancarias WHERE empresa_id IS NULL;

    IF orfas > 0 THEN
        SELECT COUNT(*) INTO empresas FROM empresa_config;

        IF empresas <> 1 THEN
            RAISE EXCEPTION
                'Contas bancárias sem empresa (%) e existem % empresas: atribua cada uma manualmente antes de continuar.',
                orfas, empresas;
        END IF;

        SELECT id INTO alvo FROM empresa_config LIMIT 1;
        UPDATE contas_bancarias SET empresa_id = alvo WHERE empresa_id IS NULL;
    END IF;
END $$;

ALTER TABLE contas_bancarias
    ALTER COLUMN empresa_id SET NOT NULL;
