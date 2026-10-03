import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[6px] px-2 py-1 font-mono text-[10px] leading-none font-semibold uppercase tracking-wide whitespace-nowrap transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        secondary: "bg-bg-page border border-v-border text-text-muted",
        destructive: "bg-danger-soft text-danger-text",
        outline: "border border-v-border text-text-muted bg-surface",
        warning: "bg-warning-soft text-warning-text",
        info: "bg-info-soft text-info-text",
        violet: "bg-violet-soft text-violet-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
