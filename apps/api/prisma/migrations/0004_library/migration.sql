-- CreateTable
CREATE TABLE "library_components" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "component_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "thumbnail" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_by_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_components_workspace_id_idx" ON "library_components"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_components_workspace_id_document_id_component_id_key" ON "library_components"("workspace_id", "document_id", "component_id");

-- AddForeignKey
ALTER TABLE "library_components" ADD CONSTRAINT "library_components_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

