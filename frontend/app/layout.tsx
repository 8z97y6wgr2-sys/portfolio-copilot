import "./style.css";
export const metadata = {
  title: "EA Inversión · Portfolio Copilot",
  description: "Tus posiciones, rendimiento y riesgo en un solo lugar.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
