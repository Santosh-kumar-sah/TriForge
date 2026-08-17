import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TriForge | Hybrid LLM Router",
  description: "Production-grade token-efficient hybrid LLM routing agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-zinc-950 text-zinc-100 antialiased">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans flex h-screen overflow-hidden bg-zinc-950`}>
        {/* Sidebar Layout */}
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-full bg-zinc-900/50 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
