// @ts-nocheck
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        /* Layout */
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",

        /* Header */
        caption: "flex justify-center items-center relative pt-1",
        caption_label: "text-sm font-semibold",

        /* Navigation */
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-7 w-7 opacity-70 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",

        /* Table */
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "w-8 text-[11px] font-medium text-muted-foreground text-center",

        /* Rows */
        row: "flex w-full mt-1",

        /* Cells */
        cell: cn(
          "relative w-8 h-8 text-center text-sm",
          "focus-within:z-20",
          props.mode === "range"
            ? "[&:has(>.day-range-start)]:rounded-l-md [&:has(>.day-range-end)]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),

        /* Day */
        day: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
        ),

        /* States */
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary",
        day_today:
          "bg-secondary text-foreground border border-border",
        day_outside:
          "text-muted-foreground opacity-40 aria-selected:bg-secondary/50",
        day_disabled:
          "text-muted-foreground opacity-30 cursor-not-allowed",
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_range_middle:
          "aria-selected:bg-secondary aria-selected:text-foreground",

        day_hidden: "invisible",

        ...classNames,
      }}

      /* Icons */
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("w-4 h-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("w-4 h-4", className)} {...props} />
        ),
      }}

      {...props}
    />
  );
}