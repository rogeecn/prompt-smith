import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/auth";
import ArtifactsClient from "../../../../../components/ArtifactsClient";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ArtifactsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <ArtifactsClient initialProjectId={resolvedParams.projectId} />;
}
