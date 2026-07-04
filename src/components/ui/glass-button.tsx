import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassButtonVariants = cva(
  "relative isolate all-unset cursor-pointer rounded-full transition-all",
  {
    variants: {
      size: {
        default: "text-sm font-semibold",
        sm: "text-xs font-semibold",
        lg: "text-base font-semibold",
        icon: "h-10 w-10",
      },
      tone: {
        dark: "glass-button--dark",
        light: "glass-button--light",
        gold: "glass-button--gold",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "dark",
    },
  },
);

const glassButtonTextVariants = cva(
  "glass-button-text relative flex select-none items-center justify-center gap-2 tracking-tight",
  {
    variants: {
      size: {
        default: "px-4 py-2.5",
        sm: "px-3 py-2",
        lg: "px-6 py-3",
        icon: "flex h-10 w-10 items-center justify-center",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, tone, contentClassName, ...props }, ref) => {
    return (
      <div className={cn("glass-button-wrap cursor-pointer rounded-full", className)}>
        <button
          className={cn("glass-button", glassButtonVariants({ size, tone }))}
          ref={ref}
          {...props}
        >
          <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>{children}</span>
        </button>
        <div className="glass-button-shadow rounded-full" />
      </div>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };
