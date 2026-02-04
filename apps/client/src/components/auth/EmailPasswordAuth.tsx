import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import EmailPasswordSignIn from "./EmailPasswordSignIn"
import EmailPasswordSignUp from "./EmailPasswordSignUp"

export default function EmailPasswordAuth({ inviteCodeAvailable }: { inviteCodeAvailable: boolean }) {
  const [activeTab, setActiveTab] = useState<"sign-in" | "sign-up">("sign-in")

  return (
    <Tabs defaultValue="sign-in" value={activeTab} onValueChange={(v) => setActiveTab(v as "sign-in" | "sign-up")}>
      <div className="flex flex-col items-center gap-2 text-center mb-4">
        <img src="/logo.png" alt="Kontexted" className="h-8 w-auto" />
        <h1 className="text-xl font-bold">
          {activeTab === "sign-in" ? "Sign in" : "Sign up"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeTab === "sign-in"
            ? "Access your workspaces and start collaborating."
            : "Create an account to get started."}
        </p>
      </div>

      {inviteCodeAvailable && (
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sign-in">Sign In</TabsTrigger>
          <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="sign-in">
        <EmailPasswordSignIn onSwitchToSignUp={inviteCodeAvailable ? () => setActiveTab("sign-up") : undefined} />
      </TabsContent>

      {inviteCodeAvailable && (
        <TabsContent value="sign-up">
          <EmailPasswordSignUp onSwitchToSignIn={() => setActiveTab("sign-in")} />
        </TabsContent>
      )}
    </Tabs>
  )
}
