import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SyncProvider } from "@/components/sync-provider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="min-h-screen max-h-screen h-screen overflow-y-auto">
        <SyncProvider>
          <Navbar />
          <main className="flex-1 flex flex-col overflow-y-auto">
            {children}
          </main>
        </SyncProvider>
      </div>
      <Footer />
    </>
  );
}
