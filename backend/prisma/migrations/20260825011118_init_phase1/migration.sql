-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "chain" TEXT NOT NULL,
    "suspectAddress" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'live',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "incidentType" TEXT,
    "victimAmount" TEXT,
    "victimCurrency" TEXT,
    "riskScore" INTEGER,
    "riskBand" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSnapshot" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "balanceWei" TEXT NOT NULL,
    "txCount" INTEGER NOT NULL,
    "firstSeen" TIMESTAMP(3),
    "lastActivity" TIMESTAMP(3),
    "inVolumeWei" TEXT NOT NULL,
    "outVolumeWei" TEXT NOT NULL,
    "counterparties" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionRecord" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastVerified" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskIndicator" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "transactions" JSONB NOT NULL,

    CONSTRAINT "RiskIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSnapshot" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "depth" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowPath" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "hops" JSONB NOT NULL,
    "totalValueWei" TEXT NOT NULL,
    "endpointType" TEXT,

    CONSTRAINT "FlowPath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investigation_status_idx" ON "Investigation"("status");

-- CreateIndex
CREATE INDEX "Investigation_riskBand_idx" ON "Investigation"("riskBand");

-- CreateIndex
CREATE UNIQUE INDEX "Investigation_chain_suspectAddress_createdAt_key" ON "Investigation"("chain", "suspectAddress", "createdAt");

-- CreateIndex
CREATE INDEX "WalletSnapshot_address_chain_idx" ON "WalletSnapshot"("address", "chain");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSnapshot_address_chain_fetchedAt_key" ON "WalletSnapshot"("address", "chain", "fetchedAt");

-- CreateIndex
CREATE INDEX "AttributionRecord_entityType_idx" ON "AttributionRecord"("entityType");

-- CreateIndex
CREATE INDEX "AttributionRecord_entityName_idx" ON "AttributionRecord"("entityName");

-- CreateIndex
CREATE UNIQUE INDEX "AttributionRecord_address_chain_key" ON "AttributionRecord"("address", "chain");

-- CreateIndex
CREATE INDEX "RiskIndicator_investigationId_idx" ON "RiskIndicator"("investigationId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSnapshot_investigationId_key" ON "GraphSnapshot"("investigationId");

-- CreateIndex
CREATE INDEX "FlowPath_investigationId_idx" ON "FlowPath"("investigationId");

-- AddForeignKey
ALTER TABLE "RiskIndicator" ADD CONSTRAINT "RiskIndicator_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSnapshot" ADD CONSTRAINT "GraphSnapshot_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowPath" ADD CONSTRAINT "FlowPath_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
