import type { Metadata } from 'next';
import AppSidebar from '../src/components/app_sidebar';
import FeedbackWrapper from '../src/components/feedback_wrapper';
import './globals.css';

export const metadata: Metadata = {
  title: 'hazo_feedback test-app',
  description: 'Test and demonstration app for the hazo_feedback npm package',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <FeedbackWrapper>
          <div className="flex min-h-screen">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto bg-gray-50">
              {children}
            </main>
          </div>
        </FeedbackWrapper>
      </body>
    </html>
  );
}
