export type AuthMethod = "keycloak" | "email-password"

export interface AuthFormProps {
  authMethod: AuthMethod
  inviteCodeAvailable: boolean
}
