import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List className={cn("search-mode", className)} {...props} />
  );
}
export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn("tab-trigger", className)}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
