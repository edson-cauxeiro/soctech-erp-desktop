# Emissão de licenças .erplic

Processo interno do fornecedor. A ferramenta de assinatura e a chave privada
**nunca** são distribuídas com a aplicação do cliente: `tools/` e
`.license-keys/` estão excluídos do instalador por `electron-builder.yml`.

## 1. Processo comercial

1. Receber o pedido com a empresa, o NIF e os módulos adquiridos.
2. Confirmar que os módulos pedidos existem no catálogo real
   (`src/shared/licensing/modules.ts`). Não inventar chaves.
3. Definir a validade (dias) e, se aplicável, limites de utilizadores e
   dispositivos.
4. Decidir a vinculação: por omissão, `none` (sem vínculo); usar
   `installation` apenas quando o identificador da instalação for conhecido.
   O administrador vê esse identificador na aba **Licenciamento**.
5. Assinar o payload com a chave privada num ambiente controlado.
6. Entregar apenas o ficheiro `.erplic` ao cliente.
7. O cliente importa o ficheiro em **Configurações › Licenciamento**, sem
   Internet.

## 2. Ferramenta

```bash
npm run licenca:emitir -- \
  --cliente "Nome da Empresa, Lda." \
  --nif 500000000 \
  --modulos vendas,estoque,configuracoes \
  --private-key /caminho/controlado/vendor-ed25519-2026-01.private.pem \
  --out licencas/empresa.erplic \
  --dias 365 \
  --max-users 20
```

A chave privada também pode vir da variável de ambiente
`LICENSING_PRIVATE_KEY` (com `\n` convertidos em quebras de linha), por exemplo
num cofre de segredos de CI. Nunca escrever a chave em `src/`, `resources/`,
`.env`, ficheiros de teste ou mensagens de commit.

Opções:

| Opção | Descrição |
| --- | --- |
| `--cliente` | Nome do titular, obrigatório. |
| `--nif` | NIF opcional do titular. |
| `--modulos` | Lista separada por vírgulas, obrigatória. |
| `--key-id` | Identificador da chave; por omissão `vendor-ed25519-2026-01`. |
| `--private-key` | Caminho local da chave privada. |
| `--out` | Caminho do ficheiro `.erplic` gerado, obrigatório. |
| `--dias` | Validade a partir de agora; por omissão 365. |
| `--installation-id` | Activa a vinculação a uma instalação específica. |
| `--max-users`, `--max-devices` | Limites opcionais; sem valor ficam livres. |
| `--license-id` | Identificador estável; por omissão é gerado um UUID. |

## 3. Formato

O ficheiro é JSON com dois campos:

```json
{
  "payload": { "...": "..." },
  "signature": "base64"
}
```

A assinatura cobre a serialização canónica do payload (chaves ordenadas
recursivamente por `src/shared/licensing/canonical.ts`). Alterar qualquer
campo — módulos, datas, cliente, produto, limites ou vinculação — invalida a
assinatura. O `schemaVersion` actual é `1` e o `productId` é `ERP_DESKTOP`.

## 4. Rotação de chaves

A aplicação confia nas chaves públicas de
`src/main/services/licensing/public-keys.ts`, seleccionadas pelo `keyId` do
payload. Para rodar:

1. Gerar um novo par Ed25519 no ambiente do fornecedor.
2. Acrescentar a nova chave pública com um `keyId` novo à lista, sem remover a
   antiga enquanto existirem licenças emitidas com ela.
3. Emitir novas licenças com `--key-id` novo.
4. Remover a chave antiga apenas quando nenhuma licença válida a usar.

## 5. Verificação local

Antes de entregar um ficheiro ao cliente, confirme que ele é aceite:

```bash
npx tsx -e "import { readFileSync } from 'node:fs'; import { validateLicenseDocument } from './src/main/services/licensing/license-validator.service'; import { LICENSE_PUBLIC_KEYS } from './src/main/services/licensing/public-keys'; const doc = JSON.parse(readFileSync('licencas/empresa.erplic', 'utf8')); console.log(validateLicenseDocument(doc, { publicKeys: LICENSE_PUBLIC_KEYS, currentInstallationId: 'qualquer' }).valid);"
```

O resultado tem de ser `true`. A verificação é inteiramente local e não
requer a base de dados nem a aplicação em execução.

## 6. Limites do modelo

- A licença é verificada no cliente, não num servidor. Quem tiver acesso
  físico à máquina e conseguir alterar o binário pode tentar contornar a
  verificação: o modelo protege contra adulteração casual do ficheiro e da
  base de dados, não contra um atacante com controlo total do posto.
- Não há revogação online nem contagem de utilizadores em tempo real; os
  limites são contratuais e constam do documento assinado.
- A expiração bloqueia novas operações dos módulos comerciais, mas nunca
  apaga dados nem impede consultar, exportar ou importar uma licença nova.
