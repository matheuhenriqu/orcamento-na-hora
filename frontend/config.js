// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// CONFIGURAÇÃO DO FRONTEND
// ============================================================================

window.APP_CONFIG = {
  // URL base para as Edge Functions do Supabase Cloud
  SUPABASE_FUNCTIONS_URL: window.localStorage.getItem('orcamento_functions_url') || 'https://odfvajqnaeodwzaljxzm.supabase.co/functions/v1',

  // Chave pública anônima do Supabase (opcional para gateway)
  SUPABASE_ANON_KEY: window.localStorage.getItem('orcamento_anon_key') || '',

  // Modo offline/demo desativado por padrão para usar backend real
  DEMO_MODE: window.localStorage.getItem('orcamento_demo_mode') === 'true' ? true : false,
};

