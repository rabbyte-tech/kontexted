import { AuthFormProps } from "./types"
import KeycloakSignIn from "./KeycloakSignIn"
import EmailPasswordAuth from "./EmailPasswordAuth"

export default function AuthForm({ authMethod, inviteCodeAvailable }: AuthFormProps) {
  if (authMethod === "keycloak") {
    return <KeycloakSignIn />
  }

  return <EmailPasswordAuth inviteCodeAvailable={inviteCodeAvailable} />
}
