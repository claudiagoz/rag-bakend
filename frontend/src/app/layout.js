import "./globals.css";

export const metadata = {
  title: "Ragbase - AI Knowledge Hub",
  description: "Enterprise knowledge assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
