import { z } from 'zod';
import { CARD_SIZE, MAX_NUMBER, MAX_PLAYERS, PLAYER_COUNT_DEFAULT } from './constants.js';

const winRulesSchema = z
  .object({
    fullCard: z.object({ enabled: z.boolean() }).optional(),
    anyRow: z.object({ enabled: z.boolean() }).optional(),
    anyColumn: z.object({ enabled: z.boolean() }).optional(),
    fourCorners: z.object({ enabled: z.boolean() }).optional(),
    diagonals: z.object({ enabled: z.boolean() }).optional(),
    firstToMarks: z.object({ enabled: z.boolean(), marks: z.number().int().min(1).max(110) }).optional(),
    stopAtFirstFullCard: z.boolean().optional(),
  })
  .strict()
  .optional();

export const createGameSchema = z
  .object({
    name: z.string().min(1).max(120),
    maxNumber: z.number().int().min(2).max(500).default(MAX_NUMBER),
    cardSize: z.number().int().min(1).max(100).default(CARD_SIZE),
    playerCount: z.number().int().min(1).max(MAX_PLAYERS).default(PLAYER_COUNT_DEFAULT),
    gameMode: z.enum(['housefull', 'cross']).default('housefull'),
    maxPrizePlaces: z.number().int().min(1).max(10).default(3),
    winRules: winRulesSchema,
  })
  .strict();

export const updateGameSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    winRules: winRulesSchema,
  })
  .strict();

export const playerInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().max(30).optional().nullable(),
  })
  .strict();

export const importPlayersSchema = z.array(playerInputSchema).min(1).max(1000);

export const createPlayerSchema = playerInputSchema;

export const updatePlayerSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().max(30).optional().nullable(),
    loginId: z.string().min(1).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const drawSchema = z.object({ number: z.number() }).strict();

export const undoSchema = z.object({ reason: z.string().max(280).optional() }).strict();

export const verifyClaimSchema = z
  .object({
    serial: z.number().int().min(1).optional(),
    verifyCode: z.string().min(1).max(20).optional(),
    loginId: z.string().min(1).max(20).optional(),
  })
  .strict()
  .refine((v) => v.serial != null || v.verifyCode != null || v.loginId != null, {
    message: 'Provide serial, verifyCode or loginId',
  });

export const sentFlagsSchema = z
  .object({
    cardImageSent: z.boolean().optional(),
    credentialsSent: z.boolean().optional(),
  })
  .strict();

export const confirmResetSchema = z.object({ confirm: z.literal('RESET') }).strict();
export const confirmWipeSchema = z.object({ confirm: z.literal('WIPE') }).strict();
export const confirmTrueSchema = z.object({ confirm: z.literal(true) }).strict();

export type CreateGameInput = z.infer<typeof createGameSchema>;
