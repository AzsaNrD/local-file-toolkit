import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { CapabilitiesProvider } from "@/context/CapabilitiesProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

// IBM Plex Sans for body text: engineered, readable at 12-14px where this app
// lives (file names, sizes, page counts). JetBrains Mono for headings and
// readouts (sizes, counts, percentages), where its fixed-width digits line up
// like an instrument panel. next/font self-hosts both at build time, so nothing
// loads from a third party at runtime (PRD NF6).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Tool pages set their own title (src/app/tools/<slug>/layout.tsx), so
  // browser tabs and history entries are distinguishable.
  title: { default: "Local File Toolkit", template: "%s | Local File Toolkit" },
  description:
    "Merge, split, compress, and convert PDFs and images entirely on your own machine. Nothing is uploaded.",
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
};

// Runs before hydration so the manual theme toggle (M7) never flashes the
// wrong theme. Dark is the default; only an explicit saved "light" overrides it.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("local-file-toolkit-theme");
    var isDark = stored !== "light";
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground" suppressHydrationWarning>
        {/* Scrolls away with the page on phones, where a fixed button would sit on top of the content;
            pinned in the corner from the sm breakpoint up, where there is room beside the content. */}
        <div className="absolute right-4 top-4 z-10 sm:fixed">
          <ThemeToggle />
        </div>
        <ServiceWorkerRegister />
        <CapabilitiesProvider>{children}</CapabilitiesProvider>
        {/* Styled from the app's tokens instead of sonner's richColors palette, so
            toasts follow the manual light/dark toggle and the AA-checked colors. */}
        <Toaster
          closeButton
          toastOptions={{
            classNames: {
              toast: "!rounded-md !border-border-strong !bg-surface !text-foreground",
              title: "!font-mono",
              description: "!text-muted-foreground",
              closeButton: "!border-border-strong !bg-surface !text-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
