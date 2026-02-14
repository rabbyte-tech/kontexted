import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth";

export const Route = createFileRoute("/consent")({
  component: ConsentPage,
});

function ConsentPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const scope = searchParams.get("scope") || "";

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConsent = async (accept: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authClient.oauth2.consent({
        accept,
        scope,
      });

      if (response.data?.uri) {
        window.location.href = response.data.uri;
      } else if (response.error) {
        setError(response.error.message || "Failed to process consent");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Authorize CLI Access
        </h1>
        <p className="text-gray-600 mb-6">
          Do you want to allow Kontexted CLI to access your account?
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        <div className="flex gap-4">
          <button
            onClick={() => handleConsent(false)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Deny"}
          </button>
          <button
            onClick={() => handleConsent(true)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Authorize"}
          </button>
        </div>
      </div>
    </div>
  );
}
