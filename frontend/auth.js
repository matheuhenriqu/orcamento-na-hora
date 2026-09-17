// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// MÓDULO: auth.js
// DESCRIÇÃO: Cliente de autenticação corporativa via Supabase Auth (GoTrue REST API)
//            com validação de sessão server-side, política de senha (min 12 chars,
//            zxcvbn/entropia), rate-limiting e lockout após 5 tentativas falhas.
// ============================================================================

(function () {
  'use strict';

  const STORAGE_KEYS = {
    ACCESS_TOKEN: 'sb_admin_access_token',
    REFRESH_TOKEN: 'sb_admin_refresh_token',
    SESSION_EXPIRES_AT: 'sb_admin_session_expires_at',
    USER_DATA: 'sb_admin_user_data',
    FAILED_ATTEMPTS: 'sb_admin_failed_attempts',
    LOCKOUT_UNTIL: 'sb_admin_lockout_until',
  };

  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueio
  const ABSOLUTE_SESSION_MAX_MS = 4 * 60 * 60 * 1000; // 4 horas de sessão máxima

  function getSupabaseBaseUrl() {
    const fnUrl = window.APP_CONFIG?.SUPABASE_FUNCTIONS_URL || '';
    try {
      const url = new URL(fnUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return 'https://odfvajqnaeodwzaljxzm.supabase.co';
    }
  }

  function getAnonKey() {
    return window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
  }

  // --------------------------------------------------------------------------
  // 1. POLÍTICA DE SENHAS E ANÁLISE DE COMPLEXIDADE (A2)
  // --------------------------------------------------------------------------
  function avaliarComplexidadeSenha(senha) {
    const s = String(senha || '');
    const erros = [];

    if (s.length < 12) {
      erros.push('Mínimo de 12 caracteres.');
    }
    if (!/[a-z]/.test(s)) {
      erros.push('Pelo menos uma letra minúscula.');
    }
    if (!/[A-Z]/.test(s)) {
      erros.push('Pelo menos uma letra maiúscula.');
    }
    if (!/[0-9]/.test(s)) {
      erros.push('Pelo menos um número.');
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(s)) {
      erros.push('Pelo menos um caractere especial (!@#$...).');
    }

    // Checagem de sequências triviais
    const padroesFracos = [
      /12345/i,
      /password/i,
      /senha/i,
      /admin/i,
      /qwerty/i,
      /(.)\1{3,}/, // 4 caracteres idênticos repetidos
    ];

    if (padroesFracos.some((p) => p.test(s))) {
      erros.push('Evite sequências previsíveis ou repetições excessivas.');
    }

    let score = 0;
    if (s.length >= 12) score++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
    if (/[0-9]/.test(s)) score++;
    if (/[^a-zA-Z0-9]/.test(s)) score++;
    if (erros.length === 0 && s.length >= 14) score++;

    return {
      isValid: erros.length === 0,
      score: Math.min(score, 4),
      errors: erros,
    };
  }

  // --------------------------------------------------------------------------
  // 2. RATE-LIMITING E PROTEÇÃO CONTRA FORÇA BRUTA (LOCKOUT)
  // --------------------------------------------------------------------------
  function verificarBloqueio() {
    const lockoutUntil = Number(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL) || 0);
    const agora = Date.now();

    if (lockoutUntil && agora < lockoutUntil) {
      const restantesSegundos = Math.ceil((lockoutUntil - agora) / 1000);
      const restantesMinutos = Math.ceil(restantesSegundos / 60);
      return {
        bloqueado: true,
        segundosRestantes: restantesSegundos,
        mensagem: `Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em ${restantesMinutos} minuto(s).`,
      };
    }

    if (lockoutUntil && agora >= lockoutUntil) {
      // Período de bloqueio expirou
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    }

    return { bloqueado: false, segundosRestantes: 0, mensagem: '' };
  }

  function registrarTentativaFalha() {
    let falhas = Number(localStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS) || 0) + 1;
    localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, String(falhas));

    if (falhas >= MAX_FAILED_ATTEMPTS) {
      const lockoutTimestamp = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(lockoutTimestamp));
      return {
        bloqueado: true,
        mensagem: `Limite de 5 tentativas excedido. Acesso bloqueado por 15 minutos por segurança.`,
      };
    }

    const tentativasRestantes = MAX_FAILED_ATTEMPTS - falhas;
    return {
      bloqueado: false,
      mensagem: `Credenciais incorretas. ${tentativasRestantes} tentativa(s) restante(s) antes do bloqueio.`,
    };
  }

  function resetarTentativasFalhas() {
    localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
  }

  // --------------------------------------------------------------------------
  // 3. SESSÃO E SUPABASE AUTH (GOTRUE API)
  // --------------------------------------------------------------------------
  function salvarSessao(authData) {
    const agora = Date.now();
    const expiresAt = agora + ABSOLUTE_SESSION_MAX_MS; // 4h máxima

    sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, authData.access_token || '');
    if (authData.refresh_token) {
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, authData.refresh_token);
    }
    sessionStorage.setItem(STORAGE_KEYS.SESSION_EXPIRES_AT, String(expiresAt));

    const userData = {
      id: authData.user?.id,
      email: authData.user?.email,
      nome: authData.user?.user_metadata?.nome || authData.user?.email?.split('@')[0] || 'Operador',
      role: authData.user?.app_metadata?.role || authData.user?.user_metadata?.role || 'admin',
    };

    sessionStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
  }

  function limparSessao() {
    sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_EXPIRES_AT);
    sessionStorage.removeItem(STORAGE_KEYS.USER_DATA);

    // Remove chaves legadas para prevenir qualquer bypass
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_session_expires');
  }

  function obterToken() {
    const expiresAt = Number(sessionStorage.getItem(STORAGE_KEYS.SESSION_EXPIRES_AT) || 0);
    if (!expiresAt || Date.now() > expiresAt) {
      limparSessao();
      return null;
    }
    return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  function obterUsuarioLocal() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.USER_DATA) || 'null');
    } catch {
      return null;
    }
  }

  /**
   * Realiza login no Supabase Auth usando email e senha
   */
  async function signInWithPassword(email, password) {
    const statusBloqueio = verificarBloqueio();
    if (statusBloqueio.bloqueado) {
      throw new Error(statusBloqueio.mensagem);
    }

    const emailLimpo = String(email || '').trim().toLowerCase();
    const passLimpa = String(password || '');

    if (!emailLimpo || !passLimpa) {
      throw new Error('Informe o e-mail e a senha corporativa.');
    }

    const baseUrl = getSupabaseBaseUrl();
    const anonKey = getAnonKey();

    try {
      const resp = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({
          email: emailLimpo,
          password: passLimpa,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.access_token) {
        const falha = registrarTentativaFalha();
        throw new Error(falha.mensagem || 'Credenciais inválidas.');
      }

      resetarTentativasFalhas();
      salvarSessao(data);
      return data.user;
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Falha ao autenticar com o servidor de acesso.');
    }
  }

  /**
   * Valida a autenticidade do token JWT atual diretamente contra o backend do Supabase
   */
  async function getUser() {
    const token = obterToken();
    if (!token) return null;

    const baseUrl = getSupabaseBaseUrl();
    const anonKey = getAnonKey();

    try {
      const resp = await fetch(`${baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        // Tentar renovar sessão se houver refresh token
        const renovou = await renovarSessao();
        if (!renovou) {
          limparSessao();
          return null;
        }
        return obterUsuarioLocal();
      }

      const userData = await resp.json().catch(() => null);
      if (!userData || !userData.id) {
        limparSessao();
        return null;
      }

      return {
        id: userData.id,
        email: userData.email,
        nome: userData.user_metadata?.nome || userData.email?.split('@')[0] || 'Operador',
        role: userData.app_metadata?.role || userData.user_metadata?.role || 'admin',
      };
    } catch (_) {
      limparSessao();
      return null;
    }
  }

  /**
   * Renova o token de acesso via refresh_token
   */
  async function renovarSessao() {
    const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return false;

    const baseUrl = getSupabaseBaseUrl();
    const anonKey = getAnonKey();

    try {
      const resp = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.access_token) {
        salvarSessao(data);
        return true;
      }
    } catch (_) {}

    limparSessao();
    return false;
  }

  /**
   * Encerra a sessão atual invalidando o token no Supabase GoTrue
   */
  async function signOut() {
    const token = obterToken();
    const baseUrl = getSupabaseBaseUrl();
    const anonKey = getAnonKey();

    if (token) {
      try {
        await fetch(`${baseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (_) {
        // Prossegue com limpeza local mesmo se falhar rede
      }
    }

    limparSessao();
  }

  // Exportação pública no escopo window
  window.AdminAuth = {
    signInWithPassword,
    getUser,
    getSession: () => (obterToken() ? { token: obterToken(), user: obterUsuarioLocal() } : null),
    getToken: obterToken,
    signOut,
    avaliarComplexidadeSenha,
    verificarBloqueio,
    limparSessao,
  };
})();
