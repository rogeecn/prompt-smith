import HomeClient from "../../../../../../../components/HomeClient";

type PageProps = {
  params: Promise<{
    projectId: string;
    sessionId: string;
  }>;
};

export default async function WizardSessionPage({ params }: PageProps) {
  const resolvedParams = await params;
  return (
    <HomeClient
      initialProjectId={resolvedParams.projectId}
      initialSessionId={resolvedParams.sessionId}
    />
  );
}
