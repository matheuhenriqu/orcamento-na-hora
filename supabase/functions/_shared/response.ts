// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// MÓDULO COMPARTILHADO: Padronização de Respostas e Logs (DX / Contrato C1 & M6)
// ============================================================================

import { getCorsHeaders, corsHeaders } from './cors.ts';

export interface ApiSuccessResponse<T> {
  ok: true;
  success: true;
  sucesso: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  ok: false;
  success: false;
  sucesso: false;
  error: {
    code: string;
    message: string;
    action?: string;
    details?: unknown;
    requestId: string;
    timestamp: string;
  };
  message: string;
  [key: string]: unknown;
}

/**
 * Gera ou recupera o identificador único da requisição (RequestId) para rastreabilidade
 */
export function getRequestId(req?: Request): string {
  if (req) {
    const headerId = req.headers.get('x-request-id') || req.headers.get('idempotency-key');
    if (headerId && headerId.length >= 8 && headerId.length <= 64) {
      return headerId;
    }
  }
  return crypto.randomUUID();
}

/**
 * Cria uma resposta padronizada de sucesso com headers de CORS
 */
export function ok<T>(
  data: T,
  meta?: Record<string, unknown>,
  req?: Request,
  deprecatedAliases?: Record<string, unknown>
): Response {
  const requestId = getRequestId(req);
  const timestamp = new Date().toISOString();
  const headers = req ? getCorsHeaders(req) : corsHeaders;

  const payload: ApiSuccessResponse<T> = {
    ok: true,
    success: true,
    sucesso: true,
    data,
    meta: {
      requestId,
      timestamp,
      ...(meta || {}),
    },
    // Suporte retrocompatível para clientes legados que inspecionam a raiz do objeto
    ...(deprecatedAliases || {}),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': requestId,
    },
  });
}

/**
 * Cria uma resposta padronizada de erro com headers de CORS e ação corretiva (C1 & C2)
 */
export function fail(
  code: string,
  message: string,
  action = 'Verifique os dados informados e tente novamente.',
  status = 400,
  details?: unknown,
  req?: Request
): Response {
  const requestId = getRequestId(req);
  const timestamp = new Date().toISOString();
  const headers = req ? getCorsHeaders(req) : corsHeaders;

  const payload: ApiErrorResponse = {
    ok: false,
    success: false,
    sucesso: false,
    error: {
      code,
      message,
      action,
      ...(details ? { details } : {}),
      requestId,
      timestamp,
    },
    // Compatibilidade com clientes legados que esperam error como string
    message,
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': requestId,
    },
  });
}

/**
 * Logger estruturado (M6) que nunca expõe PII (telefones inteiros, nomes completos)
 */
export function createLogger(context: string, req?: Request) {
  const requestId = getRequestId(req);

  function maskPii(data: unknown): unknown {
    if (typeof data === 'string') {
      // Mascara números de telefone brasileiros (ex: (11) 98765-4321 -> (11) *****-4321)
      return data.replace(/(\(?\d{2}\)?\s?)(\d{4,5})([-\s]?)(\d{4})/g, '$1*****$3$4');
    }
    if (Array.isArray(data)) {
      return data.map(maskPii);
    }
    if (data !== null && typeof data === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
          sanitized[key] = '[REDACTED]';
        } else if (key.toLowerCase().includes('telefone') || key.toLowerCase().includes('phone')) {
          sanitized[key] = typeof value === 'string' ? value.replace(/(\d{2})(\d{4,5})(\d{4})/, '$1*****$3') : '[MASKED]';
        } else {
          sanitized[key] = maskPii(value);
        }
      }
      return sanitized;
    }
    return data;
  }

  return {
    info: (msg: string, extra?: unknown) => {
      console.log(`[${new Date().toISOString()}] [INFO] [${context}] [${requestId}] ${msg}`, extra ? maskPii(extra) : '');
    },
    warn: (msg: string, extra?: unknown) => {
      console.warn(`[${new Date().toISOString()}] [WARN] [${context}] [${requestId}] ${msg}`, extra ? maskPii(extra) : '');
    },
    error: (msg: string, err?: unknown) => {
      const errSafe = err instanceof Error ? { message: err.message, name: err.name } : maskPii(err);
      console.error(`[${new Date().toISOString()}] [ERROR] [${context}] [${requestId}] ${msg}`, errSafe || '');
    },
  };
}
