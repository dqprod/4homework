import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";
import ConditionalLayout from "@/components/ConditionalLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "4homework - 宿題ヘルパー",
  description: "日本小学生向け学習補助アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        <ErrorBoundary>
          <AuthGuard>
            <ConditionalLayout>{children}</ConditionalLayout>
          </AuthGuard>
        </ErrorBoundary>
        <div id="toast-root" />
      </body>
    </html>
  );
}