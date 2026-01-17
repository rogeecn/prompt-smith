import { redirect } from "next/navigation";
import { getSession } from "../../../../../../lib/auth";
import HomeClient from "../../../../../../../components/HomeClient";

type PageProps = {
  params: Promise<{
    projectId: string;
    sessionId: string;
  }>;
};

export default async function WizardSessionPage({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <HomeClient
      initialProjectId={resolvedParams.projectId}
      initialSessionId={resolvedParams.sessionId}
    />
  );
}
