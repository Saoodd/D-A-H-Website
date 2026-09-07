import { z } from "zod";

// Server-side validation for every public form. Applied in the API route
// handlers — never trust client-side validation alone.

// Honeypot: a hidden field real users never fill in. Any value = bot.
export const honeypotSchema = z.object({
  website: z.string().max(0, "Spam detected").optional().default(""),
});

export const applicationSchema = honeypotSchema.extend({
  eventId: z.string().min(1),
  businessName: z.string().trim().min(2).max(150),
  contactName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(5).max(30),
  category: z.string().trim().min(2).max(100),
  instagram: z.string().trim().max(150).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  password: z.string().min(8).max(200),
});

export const contactSchema = honeypotSchema.extend({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(5).max(2000),
});

export const vendorLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});
