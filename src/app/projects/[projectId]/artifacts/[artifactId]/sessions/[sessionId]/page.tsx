import ArtifactsClient from "../../../../../../../../components/ArtifactsClient";

type PageProps = {
  params: Promise<{
    projectId: string;
    artifactId: string;
    sessionId: string;
  }>;
};

export default async function ArtifactSessionPage({ params }: PageProps) {
  const resolvedParams = await params;
  return (
    <ArtifactsClient
      initialProjectId={resolvedParams.projectId}
      initialArtifactId={resolvedParams.artifactId}
      initialSessionId={resolvedParams.sessionId}
    />
  );
}
