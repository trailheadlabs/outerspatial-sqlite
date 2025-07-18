import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OuterSpatial SQLite Export Service',
  description: 'SQLite database export service for OuterSpatial',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}