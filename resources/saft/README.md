# SAF-T (AO) — recursos de validação normativa

Esta pasta é o ponto de entrega do **XSD oficial** da versão que o motor
gera. Não é lida em runtime: ver o aviso abaixo.

## Aviso importante

O validador em `src/main/services/saft/saft.validador.ts` é **estrutural**:
confere campos obrigatórios, ordem de elementos, formatos e coerência de
somatórios. **Não** é uma validação normativa contra o XSD.

Isto é uma limitação conhecida e deliberada. Um validador normativo exige o
XSD oficial da AT, que não pode ser redistribuído no repositório
por ser um documento oficial versionado. A validação normativa é, por isso,
um passo operacional a correr à parte.

## Como validar contra o XSD

1. Obter o XSD da **Portuguese Tax Authority** para a versão
   `1.01_01` (`AuditFileVersion`) a partir do endereço oficial de software
   de facturação certificado.
2. Colocar os `.xsd` nesta pasta, mantendo os `include`/import entre eles.
3. Validar o ficheiro gerado:

   ```bash
   xmllint --schema resources/saft/SAFTPT01_01_01.xsd SAFTPT01_2026_03.xml --noout
   ```

   Sem `xmllint`, qualquer validador XSD 1.0 instalado na máquina serve — a
   escolha é da operação, não do projecto. A única exigência é que leia XML
   Schema, não JSON Schema.

4. Se o XSD reportar erros que o validador estrutural não apanha, a
   correcção é no `saft.construcao.ts` — não no validador estrutural, que
   não deve passar a depender do XSD.

> **Não use `ajv-cli` para isto.** O AJV valida JSON Schema, e um ficheiro XSD
> é uma linguagem diferente (XML Schema). Passar um `.xsd` ao `-s` do AJV não
> valida nada: ou dá erro de sintaxe, ou pior, valida um esquema inventado sem
> dizer que o ficheiro XSD nunca chegou a ser lido.

## Ficheiros

| Ficheiro | Papel |
| --- | --- |
| `SAFTPT01_01_01.xsd` | Schema raiz da variante de facturação, versão 1.01_01 |
| `CommonTypesA.xsd` | Tipos base (NIF, moeda, código de país) |
| `HeaderTypesA.xsd` | Estrutura do `Header` |
| `MasterFilesTypesA.xsd` | `MasterFiles` |
| `SourceDocumentsTypesA.xsd` | `SourceDocuments` |
| `ReferenceCodesA.xsd` | Tabelas de referência (TaxTable, PaymentMethod…) |