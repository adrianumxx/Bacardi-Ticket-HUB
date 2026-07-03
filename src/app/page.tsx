import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { Dashboard, LoginScreen } from "@/components/dashboard";

export default async function Home() {
  const session = await getServerSession(authOptions);
  return session?.user ? <Dashboard /> : <LoginScreen />;
}
