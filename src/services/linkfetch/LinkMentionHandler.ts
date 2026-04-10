/**
 * Phase 17.3 — Link Mention Handler
 */
import { LinkFetchService } from './LinkFetchService';
import { FetchedPage } from './LinkFetchTypes';
import { Logger } from '../../utils/Logger';

export class LinkMentionHandler {
  private static instance: LinkMentionHandler;
  private constructor() {}
  static getInstance(): LinkMentionHandler {
    if (!LinkMentionHandler.instance) LinkMentionHandler.instance = new LinkMentionHandler();
    return LinkMentionHandler.instance;
  }

  async handleMention(url: string): Promise<string> {
    const service = LinkFetchService.getInstance();
    const page = await service.fetch(url);
    return service.formatForContext([page]);
  }

  async handleAutoDetect(message: string): Promise<string | null> {
    const service = LinkFetchService.getInstance();
    const urls = service.detectUrls(message);
    if (urls.length === 0) return null;
    const pages = await service.fetchMultiple(urls.slice(0, 3));
    return pages.length > 0 ? service.formatForContext(pages) : null;
  }

  getCompletions(_partial: string): { label: string; detail: string }[] {
    return [{ label: '@link:', detail: 'Paste a URL to fetch its content' }];
  }
}
