import { redirect } from "next/navigation";
import ArtifactsClient from "../../../components/ArtifactsClient";

type PageProps = {
  searchParams?: Promise<{
    projectId?: string | string[];
  }>;
};

export default async function ArtifactsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const rawProjectId = resolvedSearchParams?.projectId;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : null;

  if (!projectId) {
    redirect("/");
  }

  return <ArtifactsClient initialProjectId={projectId} />;
}
