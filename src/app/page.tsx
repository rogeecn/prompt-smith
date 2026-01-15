import HomeClient from "../../components/HomeClient";

type PageProps = {
  searchParams?: Promise<{
    projectId?: string | string[];
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const rawProjectId = resolvedSearchParams?.projectId;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : null;

  return <HomeClient initialProjectId={projectId} />;
}
