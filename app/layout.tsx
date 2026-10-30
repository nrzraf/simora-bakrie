import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SIMORA — Ruang Kolaborasi Mahasiswa",
  description:
    "Kelola organisasi, kegiatan, dan kehadiran mahasiswa dalam satu ruang.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
