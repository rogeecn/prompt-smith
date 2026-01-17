import { redirect } from "next/navigation";
import Dashboard from "../../components/Dashboard";
import { getSession } from "../lib/auth";
import { getUserProjects } from "./actions";

export default async function Page() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const projects = await getUserProjects(session.userId);
  return <Dashboard userId={session.userId} projects={projects} />;
}
