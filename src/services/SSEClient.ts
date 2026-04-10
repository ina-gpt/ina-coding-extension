import { Logger } from '../utils/Logger';

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

export async function* streamSSE(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    signal?: AbortSignal;
  }
): AsyncGenerator<SSEEvent, void, unknown> {
  const { method = 'POST', headers = {}, body, timeout = 120000, signal } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { break; }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          if (!chunk.trim()) { continue; }

          const event: SSEEvent = { data: '' };
          const dataLines: string[] = [];

          for (const line of chunk.split('\n')) {
            if (line.startsWith(':')) { continue; } // Comment/heartbeat
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) { continue; }

            const field = line.substring(0, colonIdx);
            let val = line.substring(colonIdx + 1);
            if (val.startsWith(' ')) { val = val.substring(1); }

            switch (field) {
              case 'event': event.event = val; break;
              case 'data': dataLines.push(val); break;
              case 'id': event.id = val; break;
            }
          }

          event.data = dataLines.join('\n');

          if (event.data || event.event) {
            yield event;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      Logger.debug('SSE: Aborted');
    }
    throw error;
  }
}
