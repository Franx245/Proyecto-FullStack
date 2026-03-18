// @ts-nocheck
import * as React from "react";
import * as Context from "@radix-ui/react-context-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

interface ContextMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  inset?: boolean;
}

interface ContextMenuCheckboxItemProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children: React.ReactNode;
  checked: boolean;
}

interface ContextMenuRadioItemProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children: React.ReactNode;
}

interface ContextMenuSubTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  inset?: boolean;
  children: React.ReactNode;
}

interface ContextMenuSubContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

interface ContextMenuSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

interface ContextMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const ContextMenu = Context.Root;
const ContextMenuTrigger = Context.Trigger;
const ContextMenuGroup = Context.Group;
const ContextMenuPortal = Context.Portal;
const ContextMenuSub = Context.Sub;
const ContextMenuRadioGroup = Context.RadioGroup;

/* CONTENT */
const ContextMenuContent = React.forwardRef<HTMLDivElement, ContextMenuContentProps>(
  ({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <Context.Content
      ref={ref}
      className={cn(
        "z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md",
        "animate-in fade-in zoom-in-95",
        className
      )}
      {...props}
    />
  </ContextMenuPortal>
  )
);

/* ITEM */
const ContextMenuItem = React.forwardRef<HTMLDivElement, ContextMenuItemProps>(
  ({ className, inset, ...props }, ref) => (
  <Context.Item
    ref={ref}
    className={cn(
      "flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer",
      "focus:bg-accent focus:text-accent-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
  )
);

/* CHECKBOX */
const ContextMenuCheckboxItem = React.forwardRef<HTMLDivElement, ContextMenuCheckboxItemProps>(
  ({ className, children, checked, ...props }, ref) => (
  <Context.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn("flex items-center pl-8 pr-2 py-1.5 text-sm rounded-md", className)}
    {...props}
  >
    <span className="absolute left-2">
      <Context.ItemIndicator>
        <Check className="w-4 h-4" />
      </Context.ItemIndicator>
    </span>
    {children}
  </Context.CheckboxItem>
));

/* RADIO */
const ContextMenuRadioItem = React.forwardRef<HTMLDivElement, ContextMenuRadioItemProps>(
  ({ className, children, ...props }, ref) => (
  <Context.RadioItem
    ref={ref}
    className={cn("flex items-center pl-8 pr-2 py-1.5 text-sm rounded-md", className)}
    {...props}
  >
    <span className="absolute left-2">
      <Context.ItemIndicator>
        <Circle className="w-4 h-4 fill-current" />
      </Context.ItemIndicator>
    </span>
    {children}
  </Context.RadioItem>
  )
);

/* SUB */
const ContextMenuSubTrigger = React.forwardRef<HTMLDivElement, ContextMenuSubTriggerProps>(
  ({ className, inset, children, ...props }, ref) => (
  <Context.SubTrigger
    ref={ref}
    className={cn("flex items-center px-2 py-1.5 text-sm rounded-md", inset && "pl-8", className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto w-4 h-4" />
  </Context.SubTrigger>
  )
);

const ContextMenuSubContent = React.forwardRef<HTMLDivElement, ContextMenuSubContentProps>(
  ({ className, ...props }, ref) => (
  <Context.SubContent
    ref={ref}
    className={cn("min-w-[180px] rounded-md border bg-popover p-1 shadow-lg", className)}
    {...props}
  />
  )
);

/* EXTRA */
const ContextMenuSeparator = React.forwardRef<HTMLDivElement, ContextMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
  <Context.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
  )
);

const ContextMenuLabel = ({ className, ...props }: ContextMenuLabelProps) => (
  <div className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />
);

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};