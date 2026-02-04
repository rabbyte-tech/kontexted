import { useCallback, useState } from "react"

declare module 'react' {
  interface HTMLAttributes<T> extends React.DOMAttributes<T> {
    webkitdirectory?: string
    directory?: string
  }
}

import { CloudUpload, FileText, XCircle, CheckCircle, Loader2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadEntry } from "@/lib/directory-tree"
import { parseDirectoryStructure, parseDirectoryStructureWithPath, flattenDirectoryTree } from "@/lib/markdown-parser"
import type { FileWithPath } from "@/lib/markdown-parser"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUploadWorkspaceEntries } from "@/features/workspaces/mutations"
import type { UploadWorkspaceEntriesRequest } from "@/types"

type MarkdownUploadProps = {
  workspaceSlug: string
  targetFolderPublicId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type UploadStatus = {
  uploading: boolean
  progress: number
  created: number
  errors: Array<{ path: string; error: string }>
}

type UploadMode = 'files' | 'folder' | null

export default function MarkdownUpload({
  workspaceSlug,
  targetFolderPublicId,
  open,
  onOpenChange,
  onSuccess,
}: MarkdownUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [uploadMode, setUploadMode] = useState<UploadMode>(null)
  const [status, setStatus] = useState<UploadStatus>({
    uploading: false,
    progress: 0,
    created: 0,
    errors: [],
  })

  const resetState = useCallback(() => {
    setEntries([])
    setUploadMode(null)
    setStatus({
      uploading: false,
      progress: 0,
      created: 0,
      errors: [],
    })
  }, [])

  const handleClose = useCallback(() => {
    if (status.uploading) return
    onOpenChange(false)
    setTimeout(resetState, 300)
  }, [status.uploading, onOpenChange, resetState])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
  }, [])

  const traverseFileSystemEntry = useCallback(async (
    entry: FileSystemEntry,
    files: FileWithPath[],
    basePath: string = ''
  ): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file((f) => resolve(f), reject)
      })

      const relativePath = basePath ? `${basePath}/${file.name}` : file.name
      files.push({ file, relativePath })
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(resolve, reject)
      })

      const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name

      for (const childEntry of entries) {
        await traverseFileSystemEntry(childEntry, files, currentPath)
      }
    }
  }, [])

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const directoryTree = parseDirectoryStructure(files)
    const uploadEntries = flattenDirectoryTree(directoryTree, null)

    const entriesWithContent: UploadEntry[] = []

    for (const entry of uploadEntries) {
      try {
        const content = await entry.file.text()
        entriesWithContent.push({
          ...entry,
          content,
        })
      } catch (error) {
        console.error(`Failed to read file ${entry.file.name}:`, error)
      }
    }

    setEntries(entriesWithContent)
  }, [])

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)

    const items = Array.from(event.dataTransfer.items || [])
    const files = Array.from(event.dataTransfer.files || [])

    if (items.length === 0) {
      processFiles(files)
      return
    }

    let hasDirectory = false

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        hasDirectory = true
        break
      }
    }

    if (hasDirectory) {
      const filesWithPath: FileWithPath[] = []

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          await traverseFileSystemEntry(entry, filesWithPath)
        }
      }

      setUploadMode('folder')

      const directoryTree = parseDirectoryStructureWithPath(filesWithPath)
      const uploadEntries = flattenDirectoryTree(directoryTree, null)

      const entriesWithContent: UploadEntry[] = []

      for (const entry of uploadEntries) {
        try {
          const content = await entry.file.text()
          entriesWithContent.push({
            ...entry,
            content,
          })
        } catch (error) {
          console.error(`Failed to read file ${entry.file.name}:`, error)
        }
      }

      setEntries(entriesWithContent)
    } else {
      setUploadMode('files')
      processFiles(files)
    }
  }, [traverseFileSystemEntry, processFiles])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const mode = event.target.id === 'markdown-upload-files' ? 'files' : 'folder'
    setUploadMode(mode)

    const files = Array.from(event.target.files || [])
    processFiles(files)
  }, [processFiles])

  const uploadMutation = useUploadWorkspaceEntries()

  const handleUpload = useCallback(async () => {
    if (entries.length === 0) return

    setStatus((prev) => ({ ...prev, uploading: true, progress: 0, errors: [] }))

    try {
      const request: UploadWorkspaceEntriesRequest = {
        entries: entries.map((e) => ({
          name: e.name,
          title: e.title,
          content: e.content,
          folderPath: e.folderPath,
        })),
        targetFolderPublicId,
      }

      const result = await uploadMutation.mutateAsync({ workspaceSlug, request })

      setStatus((prev) => ({
        ...prev,
        uploading: false,
        progress: 100,
        created: result.created || 0,
        errors: result.errors || [],
      }))

      if (result.errors.length === 0 && onSuccess) {
        setTimeout(() => {
          onSuccess()
          handleClose()
        }, 1000)
      }
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        uploading: false,
        errors: [{ path: "upload", error: error instanceof Error ? error.message : "Upload failed" }],
      }))
    }
  }, [entries, workspaceSlug, targetFolderPublicId, uploadMutation, onSuccess, handleClose])

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Upload Markdown Files</SheetTitle>
          <SheetDescription>
            Upload single or multiple markdown files, or entire folder structures to your workspace
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden p-2">
          {entries.length === 0 && !status.uploading ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4 transition-colors p-4 h-full",
                dragOver ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <div className="text-center flex flex-col items-center">
                <CloudUpload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Drop markdown files or folder here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse
                </p>
              </div>
              <input
                id="markdown-upload-files"
                type="file"
                multiple
                accept=".md,.markdown"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                id="markdown-upload-folder"
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                onChange={handleFileSelect}
                className="hidden"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Select Files or Folder
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuItem
                    onClick={() => document.getElementById('markdown-upload-files')?.click()}
                  >
                    Select Files
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => document.getElementById('markdown-upload-folder')?.click()}
                  >
                    Select Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          {entries.length > 0 && !status.uploading ? (
            <div className="flex-1 overflow-auto">
              <div className="px-2 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {uploadMode && (
                      <Badge variant="secondary">
                        {uploadMode === 'folder' ? 'Folder Upload' : 'Files Upload'}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {entries.length} {entries.length === 1 ? "file" : "files"} ready to upload
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetState}
                    disabled={status.uploading}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-1">
                  {entries.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate text-foreground">
                        {entry.title}
                      </span>
                      {entry.folderPath && (
                        <span className="text-xs text-muted-foreground">
                          {entry.folderPath}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {status.uploading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Uploading {entries.length} {entries.length === 1 ? "file" : "files"}...
              </p>
            </div>
          ) : null}

          {status.created > 0 && status.errors.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-sm text-foreground">
                Successfully uploaded {status.created} {status.created === 1 ? "file" : "files"}
              </p>
            </div>
          ) : null}

          {status.errors.length > 0 ? (
            <div className="flex-1 overflow-auto">
              <p className="text-sm font-medium text-foreground mb-2">
                {status.errors.length} {status.errors.length === 1 ? "error" : "errors"} occurred
              </p>
              <div className="px-2 space-y-1">
                {status.errors.map((error, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-sm p-2 rounded-md bg-destructive/10 border border-destructive/20"
                  >
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-destructive font-medium truncate">{error.path}</p>
                      <p className="text-destructive/80 text-xs">{error.error}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {entries.length > 0 && !status.uploading && status.errors.length === 0 ? (
          <div className="flex gap-2 p-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={resetState}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              className="flex-1"
            >
              Upload {entries.length} {entries.length === 1 ? "File" : "Files"}
            </Button>
          </div>
        ) : null}

        {status.errors.length > 0 && !status.uploading ? (
          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={resetState}
              className="flex-1"
            >
              Close
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
