import { ExchangeCenterNav } from "./_components/exchange-center-nav";

export default function ExchangeCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ExchangeCenterNav />
      {children}
    </div>
  );
}
