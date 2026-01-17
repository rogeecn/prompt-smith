import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/auth";
import { createSession, loadProjectContext } from "../../../actions";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function WizardEntryPage({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const context = await loadProjectContext(resolvedParams.projectId);
  if (context.currentSessionId) {
    redirect(
      `/projects/${resolvedParams.projectId}/wizard/sessions/${context.currentSessionId}`
    );
  }

  const sessionId = await createSession(resolvedParams.projectId);
  redirect(`/projects/${resolvedParams.projectId}/wizard/sessions/${sessionId}`);
}
