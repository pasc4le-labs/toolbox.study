import { cn } from "@/lib/utils";

interface BoxedProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "main" | "header" | "footer";
}

export function Boxed({
  children,
  className,
  as: Component = "div",
}: BoxedProps) {
  return (
    <Component className={cn("mx-auto max-w-6xl px-4", className)}>
      {children}
    </Component>
  );
}
