"use client";

import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import { useEffect } from "react";
import Image from "next/image";

import logo from "./logo.png";
import { Button } from "@/components/ui/button";

const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session?.user) {
      router.replace("/workspaces");
    }
  }, [router, session?.user]);

  const handleSignIn = async () => {
    await authClient.signIn.oauth2({
      providerId: "keycloak",
    });
  };

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <Image src={logo} alt="Kontexted" className="h-8 w-auto" />
            <h1 className="text-xl font-bold">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Access your workspaces and start collaborating.
            </p>
          </div>
          {isPending ? (
            <p className="text-center text-sm text-muted-foreground">Loading session...</p>
          ) : (
            <Button type="button" onClick={handleSignIn} className="w-full">
              Continue with Keycloak
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
