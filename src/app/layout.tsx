import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Планировщик помещения — проектирование комнаты онлайн",
  description:
    "Простой планировщик помещения: нарисуйте стены произвольной формы, расставьте мебель из каталога или задайте свои размеры. Вид сверху, сетка с привязкой, экспорт PNG и JSON, автосохранение.",
  keywords: ["планировщик помещения", "планировка комнаты", "дизайн интерьера", "план квартиры", "room planner"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Планировщик помещения",
    description: "Нарисуйте стены, расставьте мебель — простой планировщик комнаты с видом сверху.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
