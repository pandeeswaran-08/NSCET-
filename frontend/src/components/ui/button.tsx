import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium leading-none select-none cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-white rounded-[10px] hover:bg-primary-600 active:scale-[0.98]",
        destructive:
          "bg-danger text-white rounded-[10px] hover:bg-danger/90 focus-visible:ring-danger active:scale-[0.98]",
        outline:
          "border border-v-border bg-surface text-text rounded-[10px] hover:bg-bg-page hover:text-text",
        secondary:
          "bg-bg-page text-text rounded-[10px] border border-v-border hover:bg-primary-soft",
        ghost:
          "text-text-muted rounded-[10px] hover:bg-bg-page hover:text-text",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-sm [&_svg]:size-4",
        sm: "h-8 rounded-lg px-3 text-xs gap-1.5 [&_svg]:size-3.5",
        lg: "h-12 rounded-[10px] px-8 text-base [&_svg]:size-5",
        icon: "h-9 w-9 rounded-[10px] p-0 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
