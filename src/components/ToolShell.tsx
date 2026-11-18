import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import type { AppError } from "@/lib/errors";
import type { ToolDefinition } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { ToolSwitcher } from "@/components/ToolSwitcher";
import { ToolIcon } from "@/components/ToolIcon";

export interface ToolShellProps {
  tool: ToolDefinition;
  /** PRD 10.5 error state: shown as a persistent alert, files stay put so the user can retry. */
  error?: AppError | null;
  children: React.ReactNode;
}

/** The one vertical flow every tool page shares (PRD Section 10.2). */
export function ToolShell({ tool, error, children }: ToolShellProps) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href="/"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md pr-2 text-sm text-muted-foreground hover:text-accent focus-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to all tools
        </Link>
        <ToolSwitcher currentSlug={tool.slug} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {/* The same icon as the tool card on the home page, so the two read as one place. */}
          <ToolIcon name={tool.icon} className="h-7 w-7 shrink-0 text-accent" />
          <h1 className="font-mono text-2xl font-semibold text-foreground">{tool.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error.message}</p>
        </div>
      )}
      {children}
    </main>
  );
}

export interface ToolStepProps {
  title: string;
  children: React.ReactNode;
}

export function ToolStep({ title, children }: ToolStepProps) {
  return (
    <Card>
      {/* Sentence case, no tracking: DESIGN.md rules out uppercase kicker labels. */}
      <h2 className="mb-4 font-mono text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </Card>
  );
}
