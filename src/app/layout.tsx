import type { Metadata } from "next";
import { Inter, Raleway } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { DbReset } from "@/components/db-reset";

const ralewayHeading = Raleway({ subsets: ["latin"], variable: "--font-heading" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "StudyToolbox",
  description: "Your study companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased font-sans", inter.variable, ralewayHeading.variable)}
    >
      <body className="min-h-full">
        {children}
        <Toaster richColors closeButton />
        <DbReset />
      </body>
    </html>
  );
}
