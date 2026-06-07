import type { Metadata, Viewport } from "next";
import { Inter, Raleway } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { DbReset } from "@/components/db-reset";
import { ThemeProvider } from "@/components/theme-provider";

const ralewayHeading = Raleway({ subsets: ["latin"], variable: "--font-heading" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "toolbox.study",
    template: "%s | toolbox.study",
  },
  description: "Your study companion",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", inter.variable, ralewayHeading.variable)}
    >
      <head>
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="toolbox" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors closeButton />
          <DbReset />
        </ThemeProvider>
      </body>
    </html>
  );
}
