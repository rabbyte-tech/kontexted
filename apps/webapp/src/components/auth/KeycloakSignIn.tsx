"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import logo from "../../app/logo.png";

const authClient = createAuthClient({ plugins: [genericOAuthClient()] });

export default function KeycloakSignIn() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session?.user) {
      router.replace("/workspaces");
    }
  }, [router, session?.user]);

  const handleSignIn = async () => {
    await authClient.signIn.oauth2({ providerId: "keycloak" });
  };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Image src={logo} alt="Kontexted" className="h-8 w-auto" />
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="text-sm text-muted-foreground">
        Access your workspaces and start collaborating.
      </p>
      {isPending ? (
        <p className="text-center text-sm text-muted-foreground">Loading session...</p>
      ) : (
        <Button type="button" onClick={handleSignIn} className="w-full">
          Continue with Keycloak
        </Button>
      )}
    </div>
  );
}
