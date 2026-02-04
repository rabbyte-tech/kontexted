/**
 * Login route
 *
 * Public authentication page.
 * Checks for existing session and redirects to /workspaces if authenticated,
 * otherwise renders the auth form.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import AuthForm from "@/components/auth/AuthForm";
import { sessionQueryOptions } from "@/features/auth/queries";
import { useServerCapabilities } from "@/features/config";

export const Route = createFileRoute('/login')({
  component: LoginComponent,
});

function LoginComponent() {
  const navigate = useNavigate();

  const { data: session, isLoading: isChecking } = useQuery(sessionQueryOptions);
  const { data: config, isLoading: isConfigLoading } = useServerCapabilities();

  useEffect(() => {
    if (session) {
      navigate({ to: '/workspaces', replace: true });
    }
  }, [session, navigate]);

  if (isChecking) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Checking session...</div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  if (isConfigLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    );
  }

  const authMethod = config?.authMethod ?? 'email-password';
  const inviteCodeAvailable = config?.inviteCodeAvailable ?? false;

  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="w-full max-w-md">
        <AuthForm authMethod={authMethod} inviteCodeAvailable={inviteCodeAvailable} />
      </div>
    </div>
  );
}
