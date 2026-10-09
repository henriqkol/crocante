// Função "crocante" — servidor do app Crocante (Supabase Edge Function / Deno), no projeto do Finanças da Casa.
//
// Rotas (POST com JSON):
//   GET  /saude                         → teste simples
//   POST /chave                         → chave pública VAPID (a mesma do Finanças) para o aparelho assinar os avisos
//   POST /nfce        {texto}           → lê o QR da NFC-e e devolve os itens da nota (consulta a SEFAZ; não grava nada)
//   POST /testar      {endpoint_hash}   → aviso de teste para o próprio aparelho
//   POST /avisar      {tipo: "compra", compra_id} | {tipo: "entrou"} → avisa os outros moradores (e o orçamento, se apertar)
//   POST /lembretes   (agendado, x-cron-secret) → descongelar, mercado, preparo, nota, jantar
//
// A leitura da nota e o Web Push reaproveitam o código do Finanças da Casa (fixado num commit do repositório público).
// A lógica do plano (cardápio, compras, lembretes) vem de app/logica.js deste repositório, a mesma que o app usa.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decodificarHtml, extrairDoPortal, lerQr, urlsDeConsulta } from "https://raw.githubusercontent.com/henriqkol/financas-casa/02053ac561fae07add9a5e164c03a8cae8d8892f/supabase/functions/api/lib/nfce.ts";
import { enviarPush, gerarChavesVapid, type AssinaturaPush, type ChavesVapid } from "https://raw.githubusercontent.com/henriqkol/financas-casa/02053ac561fae07add9a5e164c03a8cae8d8892f/supabase/functions/api/lib/webpush.ts";
// @ts-ignore módulo JavaScript do app
import * as L from "../../../app/logica.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const adm = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const CONTATO_PUSH = "https://henriqkol.github.io/crocante/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
class HttpErro extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
function ok<T>(r: { data: T; error: any }): T {
  if (r.error) throw new HttpErro(500, r.error.message ?? String(r.error));
  return r.data;
}

// ------------------------------------------------------------------ quem chamou
type Quem = { cron: true } | { cron: false; email: string; nome: string; db: SupabaseClient; casa: number };
async function autorizar(req: Request): Promise<Quem> {
  const segredo = req.headers.get("x-cron-secret");
  if (segredo) {
    const c = ok(await adm.from("app_config").select("valor").eq("chave", "cron_secret").maybeSingle()) as any;
    if (c?.valor && segredo === c.valor) return { cron: true };
    throw new HttpErro(401, "Segredo inválido");
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpErro(401, "Faça login no app");
  const { data, error } = await adm.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) throw new HttpErro(401, "Sessão expirada, entre de novo com o Google");
  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  let casa = ok(await db.rpc("casa_atual")) as number | null;
  if (!casa) casa = (ok(await db.rpc("entrar")) as any).casa_id as number;
  const meta = data.user!.user_metadata ?? {};
  return { cron: false, email, nome: String(meta.full_name ?? meta.name ?? email.split("@")[0]).split(" ")[0], db, casa };
}

// ------------------------------------------------------------------ Web Push
async function chavesVapid(): Promise<ChavesVapid> {
  const linhas = ok(await adm.from("app_config").select("chave, valor").in("chave", ["vapid_publica", "vapid_privada"])) as any[];
  const c = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  if (c.vapid_publica && c.vapid_privada) return { publica: c.vapid_publica, privadaJwk: JSON.parse(c.vapid_privada) };
  const novas = await gerarChavesVapid();
  ok(await adm.from("app_config").upsert([{ chave: "vapid_privada", valor: JSON.stringify(novas.privadaJwk) }, { chave: "vapid_publica", valor: novas.publica }], { onConflict: "chave" }));
  return novas;
}
type Inscricao = { endpoint_hash: string; casa_id: number; email: string; assinatura: AssinaturaPush; prefs: Record<string, any> };
async function inscricoes(casa?: number): Promise<Inscricao[]> {
  let qb = adm.from("croc_push").select("endpoint_hash, casa_id, email, assinatura, prefs");
  if (casa) qb = qb.eq("casa_id", casa);
  return ok(await qb) as Inscricao[];
}
/** Envia e devolve se chegou. Inscrição que não existe mais (404/410) é apagada. */
async function enviar(i: Inscricao, msg: { titulo: string; corpo: string; tag?: string; url?: string }, chaves: ChavesVapid): Promise<boolean> {
  try {
    const st = await enviarPush(i.assinatura, msg, chaves, CONTATO_PUSH, 12 * 3600);
    if (st === 404 || st === 410) { await adm.from("croc_push").delete().eq("endpoint_hash", i.endpoint_hash); return false; }
    return st >= 200 && st < 300;
  } catch (e) { console.warn("push:", e); return false; }
}
/** Marca um aviso como enviado; false se já tinha sido (não repete). */
async function primeiraVez(casa: number, chave: string): Promise<boolean> {
  const { error } = await adm.from("croc_avisos").insert({ casa_id: casa, chave });
  return !error;
}

// ------------------------------------------------------------------ plano de uma casa (para lembretes e orçamento)
async function planoDaCasa(casa: number, hoje: string) {
  const planos = ok(await adm.from("croc_planos").select("id, inicio, orcamento").eq("casa_id", casa)
    .lte("inicio", L.addDias(hoje, 7)).gte("inicio", L.addDias(hoje, -27)).order("inicio", { ascending: false }).limit(2)) as any[];
  const p = planos.find((x) => x.inicio <= hoje) ?? planos[0];
  if (!p) return null;
  const [compras, cardapio, notas] = await Promise.all([
    adm.from("croc_compras").select("id, tipo, semana, data, pago, croc_itens(id, nome, qtd, preco, congela)").eq("plano_id", p.id).then(ok) as Promise<any[]>,
    adm.from("croc_cardapio").select("data, refeicao, prato").eq("plano_id", p.id).then(ok) as Promise<any[]>,
    adm.from("croc_notas").select("compra_id").eq("casa_id", casa).then(ok) as Promise<any[]>,
  ]);
  return {
    id: p.id, inicio: p.inicio, orcamento: Number(p.orcamento), cardapio,
    compras: compras.map((c) => ({ ...c, itens: c.croc_itens ?? [], notas: notas.filter((n) => n.compra_id === c.id).length })),
  };
}

// ------------------------------------------------------------------ rotas
async function lerNota(texto: string) {
  const qr = lerQr(texto);
  if (!qr.chave && !/^https?:/i.test(qr.urlOriginal)) throw new HttpErro(400, "Não reconheci o QR code da nota. Aponte para o QR no rodapé da NFC-e.");
  const urls = urlsDeConsulta(qr);
  if (!urls.length) throw new HttpErro(422, "A consulta automática ainda não funciona para notas deste estado. Use “Sem nota: digitar o total”.");
  let erro = "";
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36", Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
        redirect: "follow", signal: AbortSignal.timeout(25000),
      });
      const ex = extrairDoPortal(decodificarHtml(await r.arrayBuffer(), r.headers.get("content-type")));
      if (ex.itens.length) return { ...ex, chave: ex.chave ?? (qr.chave || null) };
      erro = `A SEFAZ respondeu (${r.status}), mas não encontrei os itens na página. A nota pode ainda não estar disponível: tente de novo em alguns minutos.`;
    } catch (e) {
      erro = `Não consegui falar com a SEFAZ: ${e instanceof Error ? e.message : e}`;
    }
  }
  throw new HttpErro(502, erro);
}

async function avisarCasa(quem: Extract<Quem, { cron: false }>, corpo: any) {
  const chaves = await chavesVapid();
  const todas = await inscricoes(quem.casa);
  const outros = todas.filter((i) => i.email !== quem.email && i.prefs?.casa !== false);
  let enviados = 0;
  if (corpo.tipo === "entrou") {
    for (const i of outros) enviados += Number(await enviar(i, { titulo: "Morador novo", corpo: `${quem.nome} entrou na casa e agora vê o cardápio e as compras.`, tag: `entrou-${quem.email}`, url: "./#casa" }, chaves));
    return { enviados };
  }
  if (corpo.tipo === "compra") {
    const c = ok(await quem.db.from("croc_compras").select("id, tipo, semana, pago, plano_id").eq("id", corpo.compra_id).single()) as any;
    const nome = c.tipo === "mes" ? "a compra do mês" : `a compra da semana ${c.semana}`;
    for (const i of outros) enviados += Number(await enviar(i, { titulo: "Compra salva", corpo: `${quem.nome} salvou ${nome}: ${L.brl(c.pago)} no plano.`, tag: `compra-${c.id}`, url: "./#grana" }, chaves));
    // Orçamento: avisa todos (inclusive quem salvou) uma vez por faixa, quando a sobra prevista fica abaixo de R$ 30 ou negativa
    const p = await planoDaCasa(quem.casa, L.hojeBrasilia());
    if (p) {
      const r = L.resumoOrcamento(p.compras, p.orcamento);
      const faixa = r.sobra < 0 ? "estourou" : r.sobra < 30 ? "apertado" : null;
      if (faixa && await primeiraVez(quem.casa, `orc-${p.id}-${faixa}`)) {
        const msg = faixa === "estourou"
          ? { titulo: "Orçamento estourado", corpo: `O fechamento previsto é ${L.brl(r.previsto)}, ${L.brl(-r.sobra)} acima dos ${L.brl(p.orcamento)}. Veja onde cortar.` }
          : { titulo: `Sobra prevista: ${L.brl(r.sobra)}`, corpo: `Ainda dentro dos ${L.brl(p.orcamento)}, mas no limite. Veja onde cortar.` };
        for (const i of todas.filter((x) => x.prefs?.orc !== false)) enviados += Number(await enviar(i, { ...msg, tag: `orc-${p.id}`, url: "./#grana" }, chaves));
      }
    }
    return { enviados };
  }
  throw new HttpErro(400, "Tipo de aviso desconhecido");
}

async function lembretesAgendados() {
  const agora = new Date();
  const hora = L.horaBrasilia(agora), hoje = L.hojeBrasilia(agora);
  const momento = hora === 14 ? "tarde" : hora === 18 ? "jantar" : hora >= 19 && hora <= 21 ? "noite" : null;
  if (!momento) return { hora, enviados: 0, motivo: "fora dos horários de aviso" };
  const todas = await inscricoes();
  const porCasa = new Map<number, Inscricao[]>();
  for (const i of todas) {
    if (momento === "noite" && Number(i.prefs?.hora ?? 20) !== hora) continue;
    porCasa.set(i.casa_id, [...(porCasa.get(i.casa_id) ?? []), i]);
  }
  if (!porCasa.size) return { hora, momento, enviados: 0 };
  const chaves = await chavesVapid();
  let enviados = 0;
  for (const [casa, inscs] of porCasa) {
    try {
      const plano = await planoDaCasa(casa, hoje);
      if (!plano) continue;
      const lista = L.lembretes(hoje, momento, plano) as { tipo: string; tag: string; titulo: string; corpo: string; url: string }[];
      for (const i of inscs) {
        for (const l of lista) {
          if (i.prefs?.[l.tipo] === false || (l.tipo === "jantar" && !i.prefs?.jantar)) continue;
          if (!(await primeiraVez(casa, `${l.tag}:${i.endpoint_hash}`))) continue;
          enviados += Number(await enviar(i, l, chaves));
        }
      }
    } catch (e) { console.error("lembretes casa", casa, e); }
  }
  return { hora, momento, hoje, enviados };
}

async function rotear(rota: string, quem: Quem, corpo: any): Promise<Response> {
  if (rota === "/lembretes") {
    if (!quem.cron) throw new HttpErro(403, "Só o agendamento chama esta rota");
    return json(await lembretesAgendados());
  }
  if (quem.cron) throw new HttpErro(403, "Rota só para o app");
  switch (rota) {
    case "/chave": return json({ publica: (await chavesVapid()).publica });
    case "/nfce": return json({ nota: await lerNota(String(corpo.texto ?? "")) });
    case "/testar": {
      const i = (ok(await adm.from("croc_push").select("endpoint_hash, casa_id, email, assinatura, prefs").eq("endpoint_hash", String(corpo.endpoint_hash ?? "")).eq("email", quem.email)) as Inscricao[])[0];
      if (!i) throw new HttpErro(404, "Este aparelho não está com os avisos ligados");
      const chegou = await enviar(i, { titulo: "Avisos ligados", corpo: "É assim que o Crocante vai lembrar de descongelar, do mercado e do preparo de domingo.", tag: "teste", url: "./#avisos" }, await chavesVapid());
      if (!chegou) throw new HttpErro(502, "O serviço de notificações do navegador recusou o aviso. Desligue e ligue de novo.");
      return json({ ok: true });
    }
    case "/avisar": return json(await avisarCasa(quem, corpo));
    default: throw new HttpErro(404, `Rota desconhecida: ${rota}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const rota = new URL(req.url).pathname.replace(/^.*?\/crocante(?=\/|$)/, "") || "/";
  try {
    if (rota === "/saude") return json({ ok: true, hora: new Date().toISOString() });
    const quem = await autorizar(req);
    const corpo = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    return await rotear(rota, quem, corpo);
  } catch (e) {
    const status = e instanceof HttpErro ? e.status : 500;
    if (status >= 500) console.error(rota, e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, status);
  }
});
