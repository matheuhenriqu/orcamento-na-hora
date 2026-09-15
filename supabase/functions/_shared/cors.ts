// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// MÓDULO COMPARTILHADO: Configuração de CORS para Edge Functions
// ============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

/**
 * Trata requisições preflight OPTIONS automaticamente.
 * Retorna uma Response HTTP 200 com os headers de CORS se for OPTIONS, ou null caso contrário.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }
  return null;
}

/**
 * Cria uma resposta JSON com os headers de CORS inclusos.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Cria uma resposta de erro padronizada com os headers de CORS inclusos.
 */
export function errorResponse(message: string, status = 400, details?: unknown): Response {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    status
  );
}
