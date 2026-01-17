import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const resolvedParams = await params;
  redirect(`/projects/${resolvedParams.projectId}/wizard`);
}
