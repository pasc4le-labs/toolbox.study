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
    <Component className={cn("mx-auto w-full max-w-7xl px-4 md:px-8", className)}>
      {children}
    </Component>
  );
}
