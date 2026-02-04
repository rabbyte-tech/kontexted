import { oAuthDiscoveryMetadata } from "better-auth/plugins"
import { auth } from "@/auth"

export const handler = oAuthDiscoveryMetadata(auth)
