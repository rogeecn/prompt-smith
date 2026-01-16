import ArtifactEditorClient from "../../../../../components/ArtifactEditorClient";

type PageProps = {
  params: Promise<{
    artifactId: string;
  }>;
  searchParams?: Promise<{
    projectId?: string | string[];
  }>;
};

export default async function ArtifactEditorPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const rawProjectId = resolvedSearchParams?.projectId;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : null;

  return (
    <ArtifactEditorClient
      initialProjectId={projectId}
      initialArtifactId={resolvedParams.artifactId}
    />
  );
}
