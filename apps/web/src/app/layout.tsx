import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Common AI — AI college application assistant",
  description:
    "AI prepares your college applications; you review and submit. Pay $5 per application.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
