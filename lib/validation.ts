import { z } from "zod";

// Server-side validation for every public form. Applied in the API route
// handlers — never trust client-side validation alone.

// Honeypot: a hidden field real users never fill in. Any value = bot.
export const honeypotSchema = z.object({
  website: z.string().max(0, "Spam detected").optional().default(""),
});

// Vendor business account signup — not tied to any event. `category` is
// normally one of VENDOR_CATEGORIES, but "Other" reveals a free-text field
// on the client, so this stays a generic string rather than a strict enum.
export const vendorRegisterSchema = honeypotSchema.extend({
  businessName: z.string().trim().min(2).max(150),
  contactName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(5).max(30),
  category: z.string().trim().min(2).max(100),
  instagram: z.string().trim().max(150).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  password: z.string().min(8).max(200),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  tradeLicenseFileUrl: z.string().trim().max(500).optional().or(z.literal("")),
  // Must be explicitly true — checked server-side regardless of what the
  // signup form's checkbox UI does, per the platform's terms-acceptance rule.
  agreedToTerms: z.boolean().refine((v) => v === true, {
    message: "You must agree to the Vendor Terms & Conditions and Privacy Policy.",
  }),
});

// Vendor editing their own business profile (see /vendor/profile). Every
// field optional so a partial save works; the route only ever updates the
// session's own vendorId, never a client-supplied id.
export const vendorProfileUpdateSchema = z.object({
  businessName: z.string().trim().min(2).max(150).optional(),
  contactName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  instagram: z.string().trim().max(150).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  tradeLicenseNumber: z.string().trim().max(100).optional().or(z.literal("")),
  tradeLicenseFileUrl: z.string().trim().max(500).optional().or(z.literal("")),
  tradeLicenseExpiry: z.string().trim().max(30).optional().or(z.literal("")),
});

export const applyToEventSchema = z.object({
  eventId: z.string().min(1),
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
