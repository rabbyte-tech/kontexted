"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const authClient = createAuthClient();

export default function EmailPasswordSignUp({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState({
    name: "",
    email: "",
    password: "",
    inviteCode: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const newErrors = { name: "", email: "", password: "", inviteCode: "" };
    let isValid = true;

    if (!name.trim()) {
      newErrors.name = "Name is required";
      isValid = false;
    }

    if (!email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    }

    if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
      isValid = false;
    }

    if (!inviteCode.trim()) {
      newErrors.inviteCode = "Invite code is required";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({ name: "", email: "", password: "", inviteCode: "" });

    if (!validate()) return;
    setIsLoading(true);

    try {
      const res = await authClient.signUp.email({
        name,
        email,
        password,
        inviteCode,
      } as Parameters<typeof authClient.signUp.email>[0] & { inviteCode: string });

      if (res.error) {
        switch (res.error.status) {
          case 400:
            if (res.error.message?.includes("invite code")) {
              setErrors({ name: "", email: "", password: "", inviteCode: res.error.message || "Invalid invite code" });
            } else {
              setErrors((prev) => ({
                ...prev,
                email: res.error.message || "Failed to create account",
              }));
            }
            break;
          case 409:
            setErrors((prev) => ({ ...prev, email: "Email already exists" }));
            break;
          default:
            setErrors((prev) => ({
              ...prev,
              email: res.error.message || "Sign up failed",
            }));
        }
      } else {
        router.replace("/workspaces");
      }
    } catch {
      setErrors((prev) => ({ ...prev, email: "An unexpected error occurred" }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium">Name</label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          required
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="•••••••••"
          required
          minLength={8}
          aria-invalid={!!errors.password}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="inviteCode" className="text-sm font-medium">Invite Code</label>
        <Input
          id="inviteCode"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Enter your invite code"
          required
          aria-invalid={!!errors.inviteCode}
        />
        {errors.inviteCode && <p className="text-sm text-destructive">{errors.inviteCode}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Creating account..." : "Sign Up"}
      </Button>

      {onSwitchToSignIn && (
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="text-primary hover:underline"
          >
            Sign in
          </button>
        </p>
      )}
    </form>
  );
}
