import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "bg-foreground text-background": variant === "default",
          "bg-muted text-foreground": variant === "secondary",
          "border border-input": variant === "outline",
          "bg-red-500 text-white dark:bg-red-600": variant === "destructive",
        },
        className
      )}
      {...props}
    />
  );
}
