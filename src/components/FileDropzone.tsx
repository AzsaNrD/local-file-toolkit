"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { takeHandoff } from "@/lib/handoff";

export interface FileDropzoneProps {
  accept: Record<string, string[]>;
  multiple: boolean;
  maxFiles: number;
  maxFileSizeMB: number;
  /** How many files the caller already holds, so a fresh drop can top up to maxFiles. */
  currentCount: number;
  onAccepted: (files: File[]) => void;
  disabled?: boolean;
  /** Appended to the message when a file is rejected for its type, e.g. pointing at another tool. */
  unsupportedTypeHint?: string;
}

function describeRejection(
  rejection: FileRejection,
  maxFileSizeMB: number,
  unsupportedTypeHint?: string,
): string {
  const reasons = rejection.errors.map((error) => {
    switch (error.code) {
      case "file-invalid-type":
        return unsupportedTypeHint
          ? `unsupported file type. ${unsupportedTypeHint}`
          : "unsupported file type";
      case "file-too-large":
        return `larger than the ${maxFileSizeMB} MB limit`;
      case "too-many-files":
        return "too many files at once";
      default:
        return error.message;
    }
  });
  return `${rejection.file.name}: ${reasons.join(", ")}`;
}

export function FileDropzone({
  accept,
  multiple,
  maxFiles,
  maxFileSizeMB,
  currentCount,
  onAccepted,
  disabled,
  unsupportedTypeHint,
}: FileDropzoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setError(
          rejections.map((r) => describeRejection(r, maxFileSizeMB, unsupportedTypeHint)).join("; "),
        );
      } else {
        setError(null);
      }

      if (accepted.length === 0) return;

      const room = multiple ? Math.max(0, maxFiles - currentCount) : 1;
      if (room <= 0) {
        setError(`You already have the maximum of ${maxFiles} files for this tool.`);
        return;
      }

      const toAdd = accepted.slice(0, room);
      if (toAdd.length < accepted.length) {
        setError(
          `Only added ${toAdd.length} of ${accepted.length} files: the limit for this tool is ${maxFiles}.`,
        );
      }
      onAccepted(toAdd);
    },
    [multiple, maxFiles, currentCount, maxFileSizeMB, onAccepted, unsupportedTypeHint],
  );

  // Files sent here from another tool's result ("Use in another tool") arrive as if dropped.
  // Read once on mount; the latest onDrop is reached through a ref so this never re-runs.
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });
  useEffect(() => {
    if (disabled) return;
    const files = takeHandoff(accept);
    if (files.length > 0) onDropRef.current(files, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once, on mount
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple,
    maxFiles: multiple ? maxFiles : 1,
    maxSize: maxFileSizeMB * 1024 * 1024,
    disabled,
    onDrop,
  });

  const acceptsImages = Object.keys(accept).some((type) => type.startsWith("image/"));

  const handlePastedFiles = useCallback(
    (files: File[]) => {
      const maxBytes = maxFileSizeMB * 1024 * 1024;
      const tooLarge = files.filter((file) => file.size > maxBytes);
      const valid = files.filter((file) => file.size <= maxBytes);

      if (tooLarge.length > 0) {
        setError(
          tooLarge
            .map((file) => `${file.name || "Pasted image"}: larger than the ${maxFileSizeMB} MB limit`)
            .join("; "),
        );
      } else {
        setError(null);
      }
      if (valid.length === 0) return;

      const room = multiple ? Math.max(0, maxFiles - currentCount) : 1;
      if (room <= 0) {
        setError(`You already have the maximum of ${maxFiles} files for this tool.`);
        return;
      }

      const toAdd = valid.slice(0, room);
      if (toAdd.length < valid.length) {
        setError(`Only added ${toAdd.length} of ${valid.length} files: the limit for this tool is ${maxFiles}.`);
      }
      onAccepted(toAdd);
    },
    [maxFileSizeMB, multiple, maxFiles, currentCount, onAccepted],
  );

  // PRD 10.3 (SHOULD): pasting a copied/screenshotted image should work like
  // a drop, not just drag-and-drop. Listens on the window rather than the
  // dropzone element so Ctrl+V works without first clicking into the zone.
  useEffect(() => {
    if (disabled || !acceptsImages) return;
    function handleWindowPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      handlePastedFiles(files);
    }
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [disabled, acceptsImages, handlePastedFiles]);

  const extensions = Object.values(accept).flat().join(", ");

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps({ role: "button" })}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 focus-ring ${
          isDragActive ? "border-accent bg-accent/10 shadow-glow" : "border-border-strong bg-surface"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <input {...getInputProps()} />
        <UploadCloud aria-hidden="true" className={`h-8 w-8 ${isDragActive ? "text-accent" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium text-foreground">
          Drag files here, click to browse{acceptsImages ? ", or paste an image" : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          Accepted: {extensions || "any file type"} &middot; Up to {formatBytes(maxFileSizeMB * 1024 * 1024)} per file
          {multiple ? ` · up to ${maxFiles} files` : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
