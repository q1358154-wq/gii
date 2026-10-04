import "./globals.css";

export const metadata = {
  title: "Crypto AI OS",
  description: "Real-time Crypto AI Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}