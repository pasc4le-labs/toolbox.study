import { AiFactoryNav } from "./_components/ai-factory-nav";

export default function AiFactoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AiFactoryNav />
      {children}
    </>
  );
}
