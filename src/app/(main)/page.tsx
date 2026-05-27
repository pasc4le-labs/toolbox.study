import Link from "next/link";
import { RiBookOpenLine, RiMagicLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <Boxed className="py-24">
      <div className="relative mb-16">
        <div className="pointer-events-none absolute -inset-4 -top-16 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative">
          <h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl">
            Welcome to{" "}
            <span className="text-primary">StudyToolbox</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            Your study companion. Review flashcards, take exams, and generate
            cards with AI.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/study-dome">
          <Card className="group cursor-pointer transition-all hover:border-primary hover:shadow-lg">
            <CardHeader>
              <RiBookOpenLine className="mb-2 h-10 w-10 text-primary" />
              <CardTitle className="text-2xl">Study Dome</CardTitle>
              <CardDescription className="text-base">
                Review cards, take exams, track your progress with spaced
                repetition.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary group-hover:underline">
                Enter Study Dome &rarr;
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/ai-factory">
          <Card className="group cursor-pointer transition-all hover:border-primary hover:shadow-lg">
            <CardHeader>
              <RiMagicLine className="mb-2 h-10 w-10 text-primary" />
              <CardTitle className="text-2xl">AI Factory</CardTitle>
              <CardDescription className="text-base">
                Generate flashcards from content using AI. Supports
                any OpenAI-compatible provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary group-hover:underline">
                Enter AI Factory &rarr;
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </Boxed>
  );
}
