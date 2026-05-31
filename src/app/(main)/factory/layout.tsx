import { FactoryNav } from "./_components/factory-nav";

export default function FactoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FactoryNav />
      {children}
    </>
  );
}
