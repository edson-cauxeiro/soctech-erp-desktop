/**
 * @file schemas.ts
 * @description Schemas Zod do envelope e do payload assinado da licença.
 * Partilhados entre Main e Renderer; os bytes canónicos assinados saem de
 * `canonical.ts`, não da representação reconstruída pelo Zod.
 */

import { z } from 'zod';
import { isLicensingModule } from './modules';

export const LICENSE_SCHEMA_VERSION = 1;
export const LICENSE_PRODUCT_ID = 'ERP_DESKTOP';

export const licenseModuleSchema = z
  .object({
    key: z.string().refine(isLicensingModule, 'Módulo desconhecido'),
    enabled: z.boolean(),
  })
  .strict();

export const licenseLimitsSchema = z
  .object({
    maxUsers: z.number().int().positive().nullable(),
    maxDevices: z.number().int().positive().nullable(),
  })
  .strict();

export const licenseInstallationSchema = z
  .object({
    bindingMode: z.enum(['none', 'installation']),
    installationId: z.string().min(1).nullable(),
  })
  .strict();

export const licensePayloadSchema = z
  .object({
    schemaVersion: z.literal(LICENSE_SCHEMA_VERSION),
    licenseId: z.string().min(1).max(128),
    productId: z.string().min(1).max(64),
    customer: z
      .object({
        name: z.string().min(1).max(200),
        taxNumber: z.string().min(1).max(50).nullable().optional(),
      })
      .strict(),
    issuedAt: z.string().datetime(),
    notBefore: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    modules: z.array(licenseModuleSchema).min(1),
    limits: licenseLimitsSchema,
    installation: licenseInstallationSchema,
    keyId: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const keys = payload.modules.map((module) => module.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules'],
        message: 'Módulos duplicados na licença.',
      });
    }

    const issuedAt = Date.parse(payload.issuedAt);
    const notBefore = Date.parse(payload.notBefore);
    if (notBefore < issuedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notBefore'],
        message: 'A data de início não pode ser anterior à data de emissão.',
      });
    }

    if (payload.expiresAt && Date.parse(payload.expiresAt) <= notBefore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'A data de expiração deve ser posterior ao início da licença.',
      });
    }

    const { bindingMode, installationId } = payload.installation;
    if (bindingMode === 'installation' && !installationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installation', 'installationId'],
        message: 'Licenças vinculadas exigem um identificador de instalação.',
      });
    }
    if (bindingMode === 'none' && installationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installation', 'installationId'],
        message: 'Licenças não vinculadas não devem indicar instalação.',
      });
    }
  });

/** Envelope na forma `{ payload, signature }` entregue ao cliente. */
export const licenseEnvelopeSchema = z
  .object({
    payload: z.record(z.unknown()),
    signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

/** Identificação mínima do payload, lida antes da verificação da assinatura. */
export const licensePayloadKeySchema = z.object({ keyId: z.string().min(1) });

export type LicensePayload = z.infer<typeof licensePayloadSchema>;
export type LicenseEnvelope = z.infer<typeof licenseEnvelopeSchema>;
