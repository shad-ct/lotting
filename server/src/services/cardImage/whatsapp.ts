import { DEFAULT_WHATSAPP_TEMPLATE } from '@lotto/shared/types.js';

/**
 * WhatsApp sharing helpers (03 §1, §5). Honest constraint: wa.me opens a chat
 * with PRE-FILLED TEXT ONLY — it cannot attach an image. The admin flow is:
 * download PNG + open wa.me chat, then attach manually (or Web Share on mobile).
 */

export interface MessageVars {
  name: string;
  gameName: string;
  serial: number;
  appUrl: string;
  loginId: string;
  pin: string;
}

export function buildMessage(template: string | null | undefined, vars: MessageVars): string {
  const t = template && template.length > 0 ? template : DEFAULT_WHATSAPP_TEMPLATE;
  return t
    .replaceAll('{{name}}', vars.name)
    .replaceAll('{{gameName}}', vars.gameName)
    .replaceAll('{{serial}}', String(vars.serial).padStart(3, '0'))
    .replaceAll('{{appUrl}}', vars.appUrl)
    .replaceAll('{{loginId}}', vars.loginId)
    .replaceAll('{{pin}}', vars.pin);
}

/** wa.me chat link, or null when the player has no phone. */
export function buildWhatsappLink(phoneDigits: string | null, message: string): string | null {
  if (!phoneDigits) return null;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
