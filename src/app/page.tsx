"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ToolIcon } from "@/components/ToolIcon";
import { CategoryFilter } from "@/components/CategoryFilter";
import { TOOLS, requiredCapabilities } from "@/lib/tools";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  parseCategoryFilter,
  type CategoryFilterValue,
} from "@/lib/categories";
import type { ToolDefinition } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { Capability } from "@/lib/types";

const CAPABILITY_LABELS: Record<Capability, string> = {
  libreoffice: "LibreOffice",
  ghostscript: "Ghostscript",
  word: "Microsoft Word",
};

function ToolCard({ tool }: { tool: ToolDefinition }) {
  const { capabilities, loading } = useCapabilities();
  const required = requiredCapabilities(tool);
  const unavailable =
    required.length > 0 && !loading && !required.some((name) => capabilities[name].available);

  const requiredLabel =
    required.length > 0 ? required.map((name) => CAPABILITY_LABELS[name]).join(" or ") : null;

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group block h-full rounded-lg focus-visible:outline-none"
      title={unavailable ? `${requiredLabel} is not installed on this computer` : undefined}
    >
      {/* Focus lands on the <a>, so the ring is driven by group-focus-visible.
          No dimming when unavailable: the "Needs X" badge carries that state
          and faded text would drop below AA. */}
      <Card className="flex h-full flex-col gap-3 transition-colors hover:border-accent hover:shadow-glow group-focus-visible:border-accent group-focus-visible:shadow-glow group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring">
        <div className="flex items-start justify-between gap-2">
          <ToolIcon name={tool.icon} className="h-6 w-6 text-accent" />
          {unavailable && requiredLabel && (
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              Needs {requiredLabel}
            </span>
          )}
        </div>
        <div>
          <h3 className="font-mono text-sm font-semibold text-foreground">{tool.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </Card>
    </Link>
  );
}

const FILTER_PARAM = "category";
const QUERY_PARAM = "q";

/** Every word typed must appear in the tool's name, description, or address. */
function matchesQuery(tool: ToolDefinition, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${tool.title} ${tool.description} ${tool.slug.replace(/-/g, " ")}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function countsFor(query: string): Record<CategoryFilterValue, number> {
  const matching = TOOLS.filter((tool) => matchesQuery(tool, query));
  return {
    all: matching.length,
    pdf: matching.filter((tool) => tool.category === "pdf").length,
    image: matching.filter((tool) => tool.category === "image").length,
    convert: matching.filter((tool) => tool.category === "convert").length,
    utility: matching.filter((tool) => tool.category === "utility").length,
  };
}

/** The filter bar plus the grid, with no URL hooks so it can also be the Suspense fallback. */
function ToolBrowserView({
  filter,
  onChange,
  query,
  onQueryChange,
}: {
  filter: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const counts = countsFor(query);
  const visibleCategories = CATEGORY_ORDER.filter(
    (category) => filter === "all" || category === filter,
  );

  // "/" and Ctrl+K jump to the search box, unless the person is already typing in a field.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const wantsSearch =
        (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) ||
        (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey));
      if (!wantsSearch) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const sections = visibleCategories
    .map((category) => ({
      category,
      tools: TOOLS.filter((tool) => tool.category === category && matchesQuery(tool, query)),
    }))
    .filter((section) => section.tools.length > 0);

  return (
    <>
      {/* Solid background, not blur: the bar stays readable over the card grid when it sticks.
          From sm up the theme toggle is fixed in the corner, so the bar keeps right padding clear of it until lg. */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6 sm:pr-16 lg:pr-6">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                onQueryChange("");
              }
            }}
            aria-label="Search tools"
            aria-keyshortcuts="/ Control+K"
            placeholder="Search tools (press / to focus)"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-ring focus-visible:border-accent"
          />
        </div>
        <CategoryFilter value={filter} onChange={onChange} counts={counts} />
        <p role="status" className="sr-only">
          Showing {counts[filter]} {counts[filter] === 1 ? "tool" : "tools"}
        </p>
      </div>

      {sections.length === 0 && (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-foreground">
            No tool matches <span className="font-mono">&ldquo;{query}&rdquo;</span>
            {filter !== "all" ? ` in ${CATEGORY_LABELS[filter]}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              onChange("all");
            }}
            className="inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground hover:border-accent hover:text-accent focus-ring"
          >
            Show all tools
          </button>
        </div>
      )}

      {sections.map(({ category, tools }) => (
        <section key={category} className="flex flex-col gap-4">
          <h2 className="font-mono text-lg font-semibold text-foreground">
            {CATEGORY_LABELS[category]}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Reads and writes the filter in the URL, so a filtered view can be bookmarked and Back behaves. */
function ToolBrowser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = parseCategoryFilter(searchParams.get(FILTER_PARAM));
  // The box holds its own text so typing never waits on the router; the URL follows it.
  const [query, setQuery] = useState(searchParams.get(QUERY_PARAM) ?? "");

  function writeUrl(nextFilter: CategoryFilterValue, nextQuery: string) {
    const params = new URLSearchParams();
    if (nextFilter !== "all") params.set(FILTER_PARAM, nextFilter);
    if (nextQuery.trim() !== "") params.set(QUERY_PARAM, nextQuery);
    const text = params.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  return (
    <ToolBrowserView
      filter={filter}
      onChange={(next) => writeUrl(next, query)}
      query={query}
      onQueryChange={(next) => {
        setQuery(next);
        writeUrl(filter, next);
      }}
    />
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 pr-12 sm:pr-0">
        <h1 className="font-mono text-2xl font-semibold text-foreground sm:text-3xl">
          <span aria-hidden="true" className="text-accent">&gt;_ </span>
          Local File Toolkit
        </h1>
        <p className="text-lg text-muted-foreground">
          Everyday PDF and image tasks, done on your own machine.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Most tools run entirely in your browser: files are never uploaded anywhere. A few
          hand the file to a program installed on this computer (Microsoft Office, LibreOffice
          or Ghostscript). The file still never leaves it.
        </p>
      </header>

      {/* useSearchParams needs a Suspense boundary on a prerendered page. The fallback
          is the same unfiltered grid, so first paint is not empty. */}
      <Suspense fallback={<ToolBrowserView filter="all" onChange={() => {}} query="" onQueryChange={() => {}} />}>
        <ToolBrowser />
      </Suspense>
    </main>
  );
}
