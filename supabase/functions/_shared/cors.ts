// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// MÓDULO COMPARTILHADO: Configuração de CORS para Edge Functions
// ============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-session, x-telegram-bot-api-secret-token, idempotency-key, x-admin-key, x-request-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

/**
 * Valida a origem da requisição e retorna os cabeçalhos CORS adequados.
 * Permite localhost, 127.0.0.1, Cloudflare Pages (*.pages.dev) e domínios configurados.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin');
  let allowedOrigin = '*';

  if (origin) {
    const allowedPatterns = [
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      /^https:\/\/.*\.pages\.dev$/,
    ];

    try {
      // @ts-ignore: Deno global may not be recognized in standard TS
      const customOrigin = typeof Deno !== 'undefined' ? Deno.env.get('ALLOWED_ORIGIN') : null;
      if (customOrigin && (origin === customOrigin || customOrigin === '*')) {
        allowedOrigin = origin;
      } else if (allowedPatterns.some((pattern) => pattern.test(origin))) {
        allowedOrigin = origin;
      }
    } catch {
      if (allowedPatterns.some((pattern) => pattern.test(origin))) {
        allowedOrigin = origin;
      }
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-session, x-telegram-bot-api-secret-token, idempotency-key, x-admin-key, x-request-id',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Vary': 'Origin',
  };
}

/**
 * Trata requisições preflight OPTIONS automaticamente com validação de origem.
 * Retorna uma Response HTTP 200 com os headers de CORS se for OPTIONS, ou null caso contrário.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }
  return null;
}

/**
 * Cria uma resposta JSON com os headers de CORS inclusos.
 */
export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Cria uma resposta de erro padronizada com os headers de CORS inclusos.
 */
export function errorResponse(message: string, status = 400, details?: unknown, req?: Request): Response {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    status,
    req
  );
}
