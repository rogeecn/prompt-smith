import { redirect } from "next/navigation";
import AccountClient from "../../../components/AccountClient";
import { getSession } from "../lib/auth";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <AccountClient email={session.email} />;
}
