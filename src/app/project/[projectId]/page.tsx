import HomeClient from "../../../../components/HomeClient";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const resolvedParams = await params;
  return <HomeClient initialProjectId={resolvedParams.projectId} />;
}
