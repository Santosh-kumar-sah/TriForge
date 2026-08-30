import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppLayout from "@/components/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "TriForge | Intelligent Hybrid LLM Router",
  description: "Production-grade token-efficient hybrid LLM routing agent with local execution, cloud escalation, and sub-second latency.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-zinc-950 text-zinc-100 antialiased">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans min-h-screen bg-zinc-950 text-zinc-100`}>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
