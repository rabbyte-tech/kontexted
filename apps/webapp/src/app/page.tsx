import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { headers } from "next/headers";
import AuthForm from "@/components/auth/AuthForm";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user) {
    redirect("/workspaces");
  }

  const authMethod = process.env.AUTH_METHOD || "keycloak";
  const keycloakConfigured = !!(
    process.env.AUTH_KEYCLOAK_ID &&
    process.env.AUTH_KEYCLOAK_SECRET &&
    process.env.AUTH_KEYCLOAK_ISSUER
  );

  const effectiveAuthMethod =
    authMethod === "keycloak" && !keycloakConfigured ? "email-password" :
    authMethod === "email-password" ? "email-password" :
    keycloakConfigured ? "keycloak" : "email-password";

  const inviteCodeAvailable = !!process.env.INVITE_CODE;

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <AuthForm
            authMethod={effectiveAuthMethod}
            inviteCodeAvailable={inviteCodeAvailable}
          />
        </div>
      </div>
    </div>
  );
}
