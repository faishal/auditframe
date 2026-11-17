import { z } from 'zod';

export const captureModeSchema = z.enum(['window', 'screen', 'all', 'region']);

export const stampOptionsSchema = z.object({
  mode: z.enum(['banner', 'watermark']),
  position: z.enum(['top', 'bottom', 'left', 'right']),
  fields: z.object({
    evidenceId: z.boolean(),
    timestamp: z.boolean(),
    localClock: z.boolean(),
    location: z.boolean(),
    system: z.boolean(),
    note: z.boolean(),
    rawHash: z.boolean()
  }),
  theme: z.enum(['light', 'dark']),
  fontSize: z.number().min(8).max(48),
  opacity: z.number().min(0.1).max(1),
  note: z.string().max(500),
  showLocalTime: z.boolean(),
  timeFormat: z.string().min(1).max(64),
  timeZone: z.enum(['utc', 'utc+local'])
});

const accelerator = z.string().min(1).max(64);

export const settingsSchema = z.object({
  ntpHost: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[A-Za-z0-9.-]+$/, 'Invalid host name'),
  timeFormat: z.string().min(1).max(64),
  timeZone: z.enum(['utc', 'utc+local']),
  includeLocation: z.boolean(),
  reverseGeocode: z.boolean(),
  allScreensStitched: z.boolean(),
  saveDirectory: z.string().max(1024),
  shortcuts: z.object({
    window: accelerator,
    screen: accelerator,
    all: accelerator,
    region: accelerator
  }),
  stamp: stampOptionsSchema
});

export const idSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

export const captureStartSchema = z.object({
  mode: captureModeSchema,
  windowId: z.string().max(256).optional()
});

export const draftStampSchema = z.object({ draftId: idSchema, stamp: stampOptionsSchema });

export const overlaySelectionSchema = z.object({
  displayId: z.number().int(),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive()
});

export const geoResultSchema = z.object({
  ok: z.boolean(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  accuracy: z.number().optional(),
  errorCode: z.number().optional(),
  message: z.string().max(300).optional()
});
