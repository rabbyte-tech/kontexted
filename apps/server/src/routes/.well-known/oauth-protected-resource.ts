import { oAuthProtectedResourceMetadata } from "better-auth/plugins"
import { auth } from "@/auth"

export const handler = oAuthProtectedResourceMetadata(auth)
