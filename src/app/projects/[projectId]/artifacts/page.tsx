import ArtifactsClient from "../../../../../components/ArtifactsClient";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ArtifactsPage({ params }: PageProps) {
  const resolvedParams = await params;
  return <ArtifactsClient initialProjectId={resolvedParams.projectId} />;
}
