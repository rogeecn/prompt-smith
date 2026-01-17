import { redirect } from "next/navigation";
import { getSession } from "../../../../../lib/auth";
import { loadArtifactContext } from "../../../../actions";

type PageProps = {
  params: Promise<{
    projectId: string;
    artifactId: string;
  }>;
};

export default async function ArtifactEntryPage({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const context = await loadArtifactContext(
    resolvedParams.projectId,
    resolvedParams.artifactId
  );

  redirect(
    `/projects/${resolvedParams.projectId}/artifacts/${resolvedParams.artifactId}/sessions/${context.currentSessionId}`
  );
}
