/**
 * @file emitir-licenca.ts
 * @description Utilitário interno do fornecedor para emitir ficheiros `.erplic`.
 *
 * Nunca é distribuído com a aplicação: `electron-builder.yml` exclui `tools/`
 * e `.license-keys/`. A chave privada é lida de um ficheiro local ou da
 * variável de ambiente `LICENSING_PRIVATE_KEY` e nunca é escrita no repositório.
 *
 * Exemplo:
 *   npx tsx tools/emitir-licenca.ts \
 *     --cliente "Empresa Exemplo, Lda." --nif 500000000 \
 *     --modulos vendas,estoque,configuracoes \
 *     --private-key .license-keys/vendor-ed25519-2026-01.private.pem \
 *     --out licencas/empresa-exemplo.erplic
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sign } from 'node:crypto';
import { canonicalize } from '../src/shared/licensing/canonical';
import {
  LICENSE_PRODUCT_ID,
  LICENSE_SCHEMA_VERSION,
  licensePayloadSchema,
} from '../src/shared/licensing/schemas';
import { LICENSING_MODULE_KEYS } from '../src/shared/licensing/modules';
import type { LicensingModuleKey } from '../src/shared/licensing/types';

interface Opcoes {
  cliente: string;
  nif?: string;
  modulos: string[];
  keyId: string;
  privateKeyPath?: string;
  dias: number;
  installationId?: string;
  maxUsers?: number;
  maxDevices?: number;
  licenseId?: string;
  out: string;
}

function valor(argv: string[], chave: string): string | undefined {
  const indice = argv.indexOf(`--${chave}`);
  if (indice === -1) return undefined;
  return argv[indice + 1];
}

function inteiro(valorTexto: string | undefined, nome: string, obrigatorio: boolean): number | undefined {
  if (!valorTexto) {
    if (obrigatorio) throw new Error(`--${nome} é obrigatório.`);
    return undefined;
  }
  const numero = Number(valorTexto);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`--${nome} deve ser um inteiro positivo.`);
  }
  return numero;
}

function lerOpcoes(argv: string[]): Opcoes {
  const cliente = valor(argv, 'cliente');
  const modulosTexto = valor(argv, 'modulos');
  const out = valor(argv, 'out');
  const dias = inteiro(valor(argv, 'dias') ?? '365', 'dias', false) ?? 365;

  if (!cliente) throw new Error('--cliente é obrigatório.');
  if (!modulosTexto) throw new Error('--modulos é obrigatório (ex.: vendas,estoque).');
  if (!out) throw new Error('--out é obrigatório (ex.: licencas/cliente.erplic).');

  const modulos = modulosTexto.split(',').map((modulo) => modulo.trim()).filter(Boolean);
  if (modulos.length === 0) throw new Error('--modulos não pode ser vazio.');
  const desconhecidos = modulos.filter((modulo) => !LICENSING_MODULE_KEYS.includes(modulo as LicensingModuleKey));
  if (desconhecidos.length > 0) {
    throw new Error(`Módulos desconhecidos: ${desconhecidos.join(', ')}.`);
  }

  return {
    cliente,
    nif: valor(argv, 'nif'),
    modulos,
    keyId: valor(argv, 'key-id') ?? 'vendor-ed25519-2026-01',
    privateKeyPath: valor(argv, 'private-key'),
    dias,
    installationId: valor(argv, 'installation-id'),
    maxUsers: inteiro(valor(argv, 'max-users'), 'max-users', false),
    maxDevices: inteiro(valor(argv, 'max-devices'), 'max-devices', false),
    licenseId: valor(argv, 'license-id'),
    out,
  };
}

async function privateKey(opcoes: Opcoes): Promise<string> {
  if (opcoes.privateKeyPath) {
    return readFile(resolve(opcoes.privateKeyPath), 'utf8');
  }
  const ambiente = process.env.LICENSING_PRIVATE_KEY;
  if (!ambiente) {
    throw new Error(
      'Indique --private-key ou defina LICENSING_PRIVATE_KEY. A chave privada nunca deve ser commitada.'
    );
  }
  return ambiente.replace(/\\n/g, '\n');
}

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const chavePrivada = await privateKey(opcoes);

  const agora = new Date();
  const ate = new Date(agora.getTime() + opcoes.dias * 24 * 60 * 60 * 1000);

  const payload = licensePayloadSchema.parse({
    schemaVersion: LICENSE_SCHEMA_VERSION,
    licenseId: opcoes.licenseId ?? randomUUID(),
    productId: LICENSE_PRODUCT_ID,
    customer: {
      name: opcoes.cliente,
      ...(opcoes.nif ? { taxNumber: opcoes.nif } : {}),
    },
    issuedAt: agora.toISOString(),
    notBefore: agora.toISOString(),
    expiresAt: ate.toISOString(),
    modules: opcoes.modulos.map((key) => ({ key, enabled: true })),
    limits: {
      maxUsers: opcoes.maxUsers ?? null,
      maxDevices: opcoes.maxDevices ?? null,
    },
    installation: opcoes.installationId
      ? { bindingMode: 'installation', installationId: opcoes.installationId }
      : { bindingMode: 'none', installationId: null },
    keyId: opcoes.keyId,
  });

  const assinatura = sign(null, Buffer.from(canonicalize(payload), 'utf8'), chavePrivada).toString('base64');
  const destino = resolve(opcoes.out);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, `${JSON.stringify({ payload, signature: assinatura }, null, 2)}\n`, 'utf8');

  // Não imprimir a assinatura: em ambientes de CI estes logs ficam guardados.
  console.log(`Licença ${payload.licenseId} emitida para ${opcoes.cliente} em ${destino}.`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : 'Falha ao emitir licença.');
  process.exitCode = 1;
});
