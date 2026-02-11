import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = oauthProviderAuthServerMetadata(auth as any);
