import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INU 벽돌깨기",
  description: "물리학과 김기태의 INU 벽돌깨기 게임",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
