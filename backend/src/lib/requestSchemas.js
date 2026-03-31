import { z } from "zod";

function trimmedString() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim()
  );
}

function requiredString(message) {
  return trimmedString().pipe(z.string().min(1, message));
}

function minLengthString(message, minimumLength) {
  return trimmedString().pipe(z.string().min(minimumLength, message));
}

function requiredEmail(message) {
  return trimmedString().pipe(z.string().min(1, message).email(message));
}

function optionalString() {
  return z.union([z.string(), z.null(), z.undefined()]).optional();
}

export const contactRequestBodySchema = z.object({
  name: requiredString("Name is required"),
  email: requiredEmail("Email is invalid"),
  subject: requiredString("Subject is required"),
  message: minLengthString("Message must contain at least 10 characters", 10),
});

export const registerBodySchema = z.object({
  email: requiredEmail("Valid email is required"),
  username: minLengthString("Username must be at least 3 characters", 3),
  password: minLengthString("Password must be at least 6 characters", 6),
  confirm_password: optionalString(),
  full_name: requiredString("Full name is required"),
  phone: requiredString("WhatsApp number is required"),
  avatar_url: optionalString(),
}).superRefine((value, context) => {
  if (typeof value.confirm_password === "string" && value.confirm_password !== value.password) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirm_password"],
      message: "Passwords do not match",
    });
  }
});

export const loginBodySchema = z.object({
  identifier: optionalString(),
  email: optionalString(),
  password: requiredString("Identifier and password are required"),
}).superRefine((value, context) => {
  const identifier = typeof value.identifier === "string"
    ? value.identifier.trim()
    : typeof value.email === "string"
      ? value.email.trim()
      : "";

  if (!identifier) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifier"],
      message: "Identifier and password are required",
    });
  }
});

export const adminLoginBodySchema = z.object({
  identifier: optionalString(),
  email: optionalString(),
  password: requiredString("Email and password are required"),
}).superRefine((value, context) => {
  const identifier = typeof value.identifier === "string"
    ? value.identifier.trim()
    : typeof value.email === "string"
      ? value.email.trim()
      : "";

  if (!identifier) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifier"],
      message: "Email and password are required",
    });
  }
});

export const refreshTokenBodySchema = z.object({
  refreshToken: requiredString("Refresh token is required"),
});

export const logoutBodySchema = z.object({
  refreshToken: optionalString(),
});

export const forgotPasswordBodySchema = z.object({
  email: requiredEmail("Valid email is required"),
});

export const resetPasswordBodySchema = z.object({
  token: requiredString("Token and a 6 character password are required"),
  password: minLengthString("Token and a 6 character password are required", 6),
});