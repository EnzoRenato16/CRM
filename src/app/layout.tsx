import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advisor Copilot — BI conversacional para assessorias",
  description:
    "Copiloto de dados com RBAC de nível enterprise e geração dinâmica de cards. Assessores e gestores, cada um com sua visão segura.",
};

// Set the theme class before paint to avoid a flash.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('ac-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
