import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { db } from './admin.js';

/**
 * Microsoft Teams posts via a Workflows webhook (architecture ADR-8). The secret holds the URL;
 * the placeholder value "unset" (or any non-https value) turns posting off without a redeploy.
 */
export const TEAMS_WEBHOOK_URL = defineSecret('TEAMS_WEBHOOK_URL');

export type TeamsPostType = 'digest' | 'unoHour' | 'newLeader' | 'matchResults';

export interface CardLine {
  text: string;
  bold?: boolean;
  subtle?: boolean;
}

export function adaptiveCard(title: string, lines: CardLine[], link?: { title: string; url: string }) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Large', wrap: true },
            ...lines.map((l) => ({
              type: 'TextBlock',
              text: l.text,
              wrap: true,
              ...(l.bold ? { weight: 'Bolder' } : {}),
              ...(l.subtle ? { isSubtle: true } : {}),
            })),
          ],
          actions: link ? [{ type: 'Action.OpenUrl', title: link.title, url: link.url }] : [],
        },
      },
    ],
  };
}

/** Post to Teams if configured and this post type is enabled in config/app.teams. */
export async function postToTeams(
  type: TeamsPostType,
  card: ReturnType<typeof adaptiveCard>,
  urlOverride?: string,
): Promise<'sent' | 'disabled' | 'unconfigured' | 'failed'> {
  let url = urlOverride;
  if (!url) {
    try {
      url = TEAMS_WEBHOOK_URL.value();
    } catch {
      url = '';
    }
  }
  if (!url || !url.startsWith('https://')) return 'unconfigured';
  const toggles = (await db.doc('config/app').get()).get('teams') ?? {};
  if (toggles[type] === false) return 'disabled';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return 'sent';
  } catch (err) {
    logger.warn('Teams post failed', { type, err: String(err) });
    return 'failed';
  }
}

export const appUrl = () => process.env.NUE_UNO_APP_URL ?? `https://${process.env.GCLOUD_PROJECT}.web.app`;
