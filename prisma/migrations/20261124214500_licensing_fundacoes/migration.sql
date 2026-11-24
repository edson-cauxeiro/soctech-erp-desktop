-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_tax_number" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL,
    "not_before" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "installed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_validated_at" TIMESTAMPTZ,
    "payload_json" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "binding_mode" TEXT NOT NULL,
    "installation_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensed_modules" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "licensed_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installations" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "installation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licenses_license_id_key" ON "licenses"("license_id");

-- CreateIndex
CREATE INDEX "licenses_key_id_idx" ON "licenses"("key_id");

-- CreateIndex
CREATE INDEX "licenses_installation_id_idx" ON "licenses"("installation_id");

-- CreateIndex
CREATE INDEX "licensed_modules_module_key_idx" ON "licensed_modules"("module_key");

-- CreateIndex
CREATE UNIQUE INDEX "licensed_modules_license_id_module_key_key" ON "licensed_modules"("license_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "installations_scope_key" ON "installations"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "installations_installation_id_key" ON "installations"("installation_id");

-- AddForeignKey
ALTER TABLE "licensed_modules" ADD CONSTRAINT "licensed_modules_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
