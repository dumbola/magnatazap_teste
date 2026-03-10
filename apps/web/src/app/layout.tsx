import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { BackgroundEffects } from "@/components/BackgroundEffects";

const inter = Inter({
    subsets: ["latin"],
    variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: '--font-display',
});

export const metadata: Metadata = {
    title: "MagnataZap | Automação de Elite",
    description: "A ferramenta de disparo dos grandes players. Poder, velocidade e resultados.",
    icons: {
        icon: '/favicon.ico',
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="pt-BR" className={`${inter.variable} ${spaceGrotesk.variable}`}>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
            </head>
            <body className={inter.className}>
                <BackgroundEffects />
                <div className="relative z-10">
                    {children}
                </div>
            </body>
        </html>
    );
}
