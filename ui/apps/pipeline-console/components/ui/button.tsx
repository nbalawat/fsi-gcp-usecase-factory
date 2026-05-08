import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/ui";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-ui font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:bg-accent-hov active:bg-accent-pressed",
        secondary:
          "border border-border bg-paper text-ink-1 hover:bg-paper-2",
        ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink-1",
        danger:
          "border border-semantic-danger/40 bg-paper text-semantic-danger hover:bg-semantic-dangerTint/40",
        link: "text-accent-pressed underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-mono-sm",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-body-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
