import './globals.css';

export const metadata = {
  title: 'WhatsApp Control • Dashboard',
  description: 'Auto-reply, group extraction and broadcast control center.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-backdrop" aria-hidden="true">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="orb orb-c" />
        </div>
        {children}
      </body>
    </html>
  );
}
