"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon, Plus, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type TriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  /** If true, show + / − instead of the chevron */
  usePlusMinus?: boolean;
  /** If true, rotate the icon container on open/close (works for both modes) */
  spin?: boolean;
};

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  usePlusMinus = false,
  spin = true,
  ...props
}: TriggerProps) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
          !usePlusMinus && "[&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}

        {usePlusMinus ? (
          <span
            className={cn(
              "relative size-4 shrink-0 pointer-events-none",
              spin &&
                "transition-transform duration-250 group-data-[state=open]:rotate-360"
            )}
            aria-hidden
          >
            <Plus className="absolute inset-0 opacity-100 scale-75 transition-all duration-200 group-data-[state=open]:opacity-0 group-data-[state=open]:scale-50" />
            <Minus className="absolute inset-0 opacity-0 scale-50 transition-all duration-200 group-data-[state=open]:opacity-100 group-data-[state=open]:scale-90" />
          </span>
        ) : (
          // Default chevron indicator
          <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
