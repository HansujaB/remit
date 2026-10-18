import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

// shadcn/ui composition pattern, with Remit's CSS design tokens.
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "button primary",
      outline: "button secondary",
      ghost: "button plain",
      unstyled: "",
    },
    size: { default: "", icon: "icon-button", small: "button-small" },
  },
  defaultVariants: { variant: "unstyled", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
