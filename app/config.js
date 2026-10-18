// Endereço e chave pública do Supabase (mesmo projeto do Finanças da Casa). A chave "anon" é pública por natureza:
// o acesso aos dados é protegido pelo login com Google e pelas regras de segurança do banco (cada casa vê só o que é dela).
export const SUPABASE_URL = "https://hisraarbwhuhovommgqo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc3JhYXJid2h1aG92b21tZ3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjE5NDEsImV4cCI6MjEwNTkzNzk0MX0.D15qaWKU88Y0KRYGRiKsjt2rZU9qrXS_kyfibXPpm4k";
export const FUNCAO = `${SUPABASE_URL}/functions/v1/crocante`;
export const VERSAO = "1.10.0";
// Trocado pelo commit na publicação (publicar-app.yml); o app compara com versao.txt para se atualizar sozinho.
export const PUBLICACAO = "local";
