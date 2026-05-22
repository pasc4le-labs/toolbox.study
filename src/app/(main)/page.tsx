import { Boxed } from "@/components/boxed";

export default function Home() {
  return (
    <Boxed className="py-24">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-4 -top-16 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative">
          <h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl">
            Welcome to{" "}
            <span className="text-primary">StudyToolbox</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            Your study companion. More coming soon.
          </p>
        </div>
      </div>
    </Boxed>
  );
}
