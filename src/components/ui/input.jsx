import { cn } from "../../lib/utils";
export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("ui-input", className)}
      {...props}
    />
  );
}
export function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("ui-textarea", className)}
      {...props}
    />
  );
}
