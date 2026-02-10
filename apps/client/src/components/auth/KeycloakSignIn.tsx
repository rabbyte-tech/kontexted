import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api-client"
import { sessionQueryOptions } from "@/features/auth/queries"

export default function KeycloakSignIn() {
  const navigate = useNavigate()

  const { data: session, isLoading } = useQuery(sessionQueryOptions)

  useEffect(() => {
    // Check session on mount and redirect if already authenticated
    if (session?.user) {
      navigate({ to: '/' })
    }
  }, [session, navigate])

  const handleSignIn = async () => {
    const baseUrl = apiClient.getBaseUrl()
    try {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/oauth2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: 'keycloak',
          callbackURL: '/',
        }),
      })

      // Parse JSON response from Better Auth
      const data = await response.json()

      // Check if redirect is enabled and navigate to the OAuth URL
      if (data.redirect === true && data.url) {
        window.location.href = data.url
      } else {
        console.error('Unexpected OAuth response:', data)
      }
    } catch (error) {
      console.error('Error initiating OAuth flow:', error)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <img src="/logo.png" alt="Kontexted" className="h-8 w-auto" />
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="text-sm text-muted-foreground">
        Access your workspaces and start collaborating.
      </p>
      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Loading session...</p>
      ) : (
        <Button type="button" onClick={handleSignIn} className="w-full">
          Continue with Keycloak
        </Button>
      )}
    </div>
  )
}
