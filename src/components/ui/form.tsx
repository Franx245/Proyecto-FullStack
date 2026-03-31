"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Controller, FormProvider, useFormContext, type ControllerProps, type FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  name: string;
  [key: string]: any;
}

interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  className?: string;
}

interface FormControlProps extends React.HTMLAttributes<HTMLElement> {
  [key: string]: any;
}

interface FormDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  className?: string;
}

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  className?: string;
  children?: React.ReactNode;
}

/* ROOT */
const Form = FormProvider;

/* FIELD CONTEXT */
const FormFieldContext = React.createContext<{ name?: string }>({});

const FormField = <T extends FieldValues = FieldValues>({ name, ...props }: ControllerProps<T>) => (
  <FormFieldContext.Provider value={{ name }}>
    <Controller name={name} {...props} />
  </FormFieldContext.Provider>
);

/* ITEM CONTEXT */
const FormItemContext = React.createContext<{ id?: string }>({});

/* HOOK */
const useFormField = () => {
  const field = React.useContext(FormFieldContext);
  const item = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!field?.name) {
    throw new Error("useFormField must be used inside <FormField>");
  }

  const state = getFieldState(field.name, formState);

  return {
    ...state,
    id: item.id,
    name: field.name,
    formItemId: `${item.id}-input`,
    descriptionId: `${item.id}-desc`,
    messageId: `${item.id}-error`,
  };
};

/* ITEM */
const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});

/* LABEL */
const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, ...props }, ref) => {
  const { formItemId, error } = useFormField();

  return (
    <Label
      ref={ref}
      htmlFor={formItemId}
      className={cn(error && "text-destructive", className)}
      {...props}
    />
  );
});

/* CONTROL */
const FormControl = React.forwardRef<HTMLElement, FormControlProps>(
  ({ ...props }, ref) => {
  const { formItemId, descriptionId, messageId, error } = useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={error ? `${descriptionId} ${messageId}` : descriptionId}
      aria-invalid={!!error}
      {...props}
    />
  );
});

/* DESCRIPTION */
const FormDescription = React.forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ className, ...props }, ref) => {
  const { descriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={descriptionId}
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
});

/* ERROR */
const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, ...props }, ref) => {
  const { error, messageId } = useFormField();

  const body = error?.message || children;
  if (!body) return null;

  return (
    <p
      ref={ref}
      id={messageId}
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
});

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};