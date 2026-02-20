import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Clipboard, Check, Info } from "lucide-react"
import { CliCommandBuilder } from "@/lib/cli-command-builder"
import { slugify } from "@/lib/markdown-parser"

/**
 * Supported CLI command types
 * Currently only 'login' is supported; extensible for future commands
 */
type CliCommandType = "login" // Future: | 'config' | 'workspace'

/**
 * Configuration for a single form field
 */
interface CommandFieldConfig {
  /** Unique key for the field */
  key: string
  /** Display label for the field */
  label: string
  /** Field type */
  type: "text" | "switch"
  /** Placeholder text for text inputs */
  placeholder?: string
  /** Default value for the field */
  defaultValue?: string | boolean
}

/**
 * Configuration for a CLI command
 */
interface CommandConfig {
  /** Display name for the command */
  name: string
  /** Description shown in the sheet */
  description: string
  /** Form field configurations */
  fields: CommandFieldConfig[]
  /** Function to build the CLI command string */
  buildCommand: (values: Record<string, string | boolean>) => string
  /** Function to build single-line command for clipboard */
  buildSingleLineCommand: (values: Record<string, string | boolean>) => string
}

/**
 * Command configurations - extendable for new commands
 */
const commandConfigs: Record<CliCommandType, CommandConfig> = {
  login: {
    name: "Login",
    description: "Generate a login command for the Kontexted CLI.",
    fields: [
      {
        key: "serverUrl",
        label: "Server URL",
        type: "text",
        placeholder: "https://example.com",
      },
      {
        key: "workspaceSlug",
        label: "Workspace",
        type: "text",
        placeholder: "workspace-slug",
      },
      {
        key: "profileAlias",
        label: "Profile Alias",
        type: "text",
        placeholder: "profile-alias",
      },
      {
        key: "enableWrite",
        label: "Enable write operations",
        type: "switch",
        defaultValue: false,
      },
    ],
    buildCommand: (values) => {
      return new CliCommandBuilder()
        .command("login")
        .option("url", values.serverUrl as string)
        .option("workspace", values.workspaceSlug as string)
        .option("alias", values.profileAlias as string)
        .flag("write", values.enableWrite as boolean)
        .build("multi")
    },
    buildSingleLineCommand: (values) => {
      return new CliCommandBuilder()
        .command("login")
        .option("url", values.serverUrl as string)
        .option("workspace", values.workspaceSlug as string)
        .option("alias", values.profileAlias as string)
        .flag("write", values.enableWrite as boolean)
        .build("single")
    },
  },
}

/**
 * Initial values for login command
 */
const getLoginInitialValues = (
  workspaceSlug: string,
  workspaceName: string
): Record<string, string | boolean> => ({
  serverUrl: typeof window !== "undefined" ? window.location.origin : "",
  workspaceSlug,
  profileAlias: slugify(workspaceName),
  enableWrite: false,
})

/**
 * Props for the CliHelperSheet component
 */
interface CliHelperSheetProps {
  /** Controls whether the sheet is open */
  open: boolean
  /** Callback when sheet open state changes */
  onOpenChange: (open: boolean) => void
  /** Current workspace slug */
  workspaceSlug: string
  /** Current workspace name (used for alias suggestion) */
  workspaceName: string
}

/**
 * Sheet component for generating CLI commands.
 * Allows users to configure various CLI commands with dynamic fields.
 * Currently supports 'login' command; extensible for future commands.
 */
export function CliHelperSheet({
  open,
  onOpenChange,
  workspaceSlug,
  workspaceName,
}: CliHelperSheetProps) {
  const config = commandConfigs.login

  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    getLoginInitialValues(workspaceSlug, workspaceName)
  )
  const [copySuccess, setCopySuccess] = useState(false)

  // Update values when props change
  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      workspaceSlug: workspaceSlug,
      profileAlias: slugify(workspaceName),
    }))
  }, [workspaceSlug, workspaceName])

  // Reset copy success state after 2 seconds
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        setCopySuccess(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copySuccess])

  /**
   * Handle text input changes
   */
  const handleInputChange = useCallback((key: string) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [key]: e.target.value }))
    }
  }, [])

  /**
   * Handle switch toggle changes
   */
  const handleSwitchChange = useCallback((key: string) => {
    return (checked: boolean) => {
      setValues((prev) => ({ ...prev, [key]: checked }))
    }
  }, [])

  /**
   * Build the CLI command based on current values
   */
  const commandPreview = useMemo(
    () => config.buildCommand(values),
    [config, values]
  )

  /**
   * Build single-line command for clipboard
   */
  const singleLineCommand = useMemo(
    () => config.buildSingleLineCommand(values),
    [config, values]
  )

  /**
   * Copy command to clipboard
   */
  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(singleLineCommand)
      setCopySuccess(true)
    } catch (err) {
      console.error("Failed to copy command:", err)
    }
  }, [singleLineCommand])

  /**
   * Get field value with type safety
   */
  const getFieldValue = (key: string): string | boolean => {
    return values[key] ?? ""
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>CLI Setup</SheetTitle>
          <SheetDescription>{config.description}</SheetDescription>
        </SheetHeader>

        {/* Form Fields */}
        <div className="mt-4 px-6 space-y-4">
          {config.fields.map((field) => {
            if (field.type === "text") {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label
                    htmlFor={`cli-login-${field.key}`}
                    className="text-sm font-medium"
                  >
                    {field.label}
                  </label>
                  <Input
                    id={`cli-login-${field.key}`}
                    type="text"
                    value={getFieldValue(field.key) as string}
                    onChange={handleInputChange(field.key)}
                    placeholder={field.placeholder}
                  />
                </div>
              )
            }

            if (field.type === "switch") {
              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between"
                >
                  <label
                    htmlFor={`cli-login-${field.key}`}
                    className="text-sm font-medium"
                  >
                    {field.label}
                  </label>
                  <Switch
                    id={`cli-login-${field.key}`}
                    checked={getFieldValue(field.key) as boolean}
                    onCheckedChange={handleSwitchChange(field.key)}
                  />
                </div>
              )
            }

            return null
          })}
        </div>

        {/* Command Preview */}
        <div className="px-6 pb-6 mt-4">
          <pre className="bg-muted font-mono text-sm p-4 rounded-md overflow-x-auto">
            <code>{`$ ${commandPreview}`}</code>
          </pre>
        </div>

        {/* Copy Button */}
        <div className="px-6 pb-6">
          <Button
            onClick={handleCopyCommand}
            className="w-full"
            variant={copySuccess ? "secondary" : "default"}
          >
            {copySuccess ? (
              <>
                <Check className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <Clipboard className="size-4" />
                Copy Command
              </>
            )}
          </Button>
        </div>

        {/* Info Note */}
        <div className="px-6 pb-6 flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0 mt-0.5" />
          <span>Requires kontexted CLI to be installed</span>
        </div>
      </SheetContent>
    </Sheet>
  )
}
