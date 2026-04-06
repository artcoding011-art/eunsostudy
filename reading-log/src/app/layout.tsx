import type { Metadata } from "next";
import { Quicksand, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "수리플젝 일지",
  description: "네이버 블로그 연동 프리미엄 독서 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${quicksand.variable} ${notoSansKr.variable}`}>
      <body>{children}</body>
    </html>
  );
}
