import ArtifactsClient from "../../../../../../components/ArtifactsClient";

type PageProps = {
  params: Promise<{
    projectId: string;
    artifactId: string;
  }>;
};

export default async function ArtifactEntryPage({ params }: PageProps) {
  const resolvedParams = await params;
  return (
    <ArtifactsClient
      initialProjectId={resolvedParams.projectId}
      initialArtifactId={resolvedParams.artifactId}
    />
  );
}
