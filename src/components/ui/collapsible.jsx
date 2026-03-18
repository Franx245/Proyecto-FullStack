// @ts-nocheck
"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = React.forwardRef(
  ({ className, ...props }, ref) => (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={cn("cursor-pointer", className)}
      {...props}
    />
  )
);

const CollapsibleContent = React.forwardRef(
  ({ className, ...props }, ref) => (
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        className
      )}
      {...props}
    />
  )
);

export { Collapsible, CollapsibleTrigger, CollapsibleContent };