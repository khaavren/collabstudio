import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Band Joes Studio",
  description: "Collaborative product development workspace for AI-generated concept images."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
