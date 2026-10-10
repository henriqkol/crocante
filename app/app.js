// Crocante — app (PWA). Sem build: módulos ES direto no navegador, como o Finanças da Casa.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCAO, VERSAO } from "./config.js";
import { iniciarLeitor } from "./scanner.js";
import * as L from "./logica.js";
import { PRATOS, RECEITAS, PREPARO, COMO, SORTEIO, CAFE, LANCHE, DOCES, DICAS, TIPO, CAT } from "./dados.js";
import { LOCAIS } from "./compras.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const HASH_INICIAL = location.hash;

// ------------------------------------------------------------------ utilidades
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app"), abas = $("#abas"), folha = $("#folha"), caixaAviso = $("#aviso");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const R = (v) => L.brl(v);
const R0 = (v) => "R$" + Math.round(Number(v || 0)).toLocaleString("pt-BR");
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const hoje = () => L.hojeBrasilia();
const nomeMes = (dia) => new Date(dia + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
const dataLonga = (dia) => `${L.DIAS[L.diaSemana(dia)]} · ${Number(dia.slice(8, 10))} de ${nomeMes(dia)}`;
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const SETA_VOLTAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const ICONE_X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICONE_DESFAZER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 3v5.6h5.6"/></svg>`;
const ICONE_SINO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/></svg>`;
const ICONE_GIRAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>`;
const ICONE_CADEADO = (fechado) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10"/><path d="${fechado ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"}"/></svg>`;

let timerAviso = null;
function avisar(msg, erro = false) {
  caixaAviso.textContent = msg;
  caixaAviso.className = erro ? "erro" : "";
  caixaAviso.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { caixaAviso.hidden = true; }, erro ? 6000 : 3200);
}
/** Resultado de uma consulta do Supabase (ou erro legível). */
async function q(p) {
  const { data, error } = await p;
  if (error) throw new Error(traduzirErro(error.message ?? String(error)));
  return data;
}
function traduzirErro(m) {
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem internet. Tente de novo quando a conexão voltar.";
  if (/JWT|token/i.test(m)) return "Sua sessão expirou. Entre de novo com o Google.";
  if (/duplicate key.*croc_notas/i.test(m)) return "Essa nota já foi salva antes.";
  if (/duplicate key.*membros/i.test(m)) return "Essa pessoa já foi convidada para esta casa.";
  return m;
}
/** Chamada à função do servidor (leitura da nota, avisos). */
async function fn(rota, corpo = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(FUNCAO + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `O servidor respondeu ${r.status}`);
  return j;
}

// ------------------------------------------------------------------ estado
const estado = {
  email: null, nome: "", foto: null,
  casa: null, config: null, plano: null, compras: [], cardapio: [], notas: [],
  moradores: null, sorteio: null, passos: {}, rascunho: null, filtroPratos: "todos", aprendidos: {},
};
const compraPorId = (id) => estado.compras.find((c) => c.id === id);
const nomeCompra = (c) => (c.tipo === "mes" ? "Compra do mês" : `Semana ${c.semana}`);
const indiceCompra = (c) => (c.tipo === "mes" ? 0 : c.semana);
const pratoDo = (dia, ref) => estado.cardapio.find((x) => x.data === dia && x.refeicao === ref);
function proximaCompra() {
  return [...estado.compras].filter((c) => c.pago == null).sort((a, b) => a.data.localeCompare(b.data) || indiceCompra(a) - indiceCompra(b))[0] ?? null;
}
function statusCompra(c) {
  if (c.pago != null) return { txt: "FEITA", tipo: "feita" };
  const h = hoje();
  if (c.data === h) return { txt: "HOJE", tipo: "alerta" };
  if (c.data === L.addDias(h, 1)) return { txt: "AMANHÃ", tipo: "alerta" };
  if (c.data < h) return { txt: "PENDENTE", tipo: "alerta" };
  return { txt: "PLANEJADA", tipo: "" };
}
function iniciais(nome, email) {
  const n = (nome || email || "?").trim();
  return n[0].toUpperCase();
}
function avatarHtml(classe = "") {
  return `<a href="#casa" class="avatar ${classe}" aria-label="Casa ${esc(estado.casa?.nome ?? "")}">${estado.foto ? `<img src="${esc(estado.foto)}" alt="" referrerpolicy="no-referrer">` : esc(iniciais(estado.nome, estado.email))}</a>`;
}
function resumo() {
  return L.resumoOrcamento(estado.compras, Number(estado.plano?.orcamento ?? estado.config?.orcamento ?? 1600));
}

// ------------------------------------------------------------------ carregar dados
async function carregarTudo() {
  let cfg = await q(sb.from("croc_config").select("*").maybeSingle());
  if (!cfg) cfg = await q(sb.from("croc_config").insert({}).select().single());
  estado.config = cfg;
  const planos = await q(sb.from("croc_planos").select("*").order("inicio", { ascending: false }).limit(8));
  const h = hoje();
  const atual = planos.find((p) => p.inicio <= h && h <= L.addDias(p.inicio, 27))
    ?? [...planos].filter((p) => p.inicio > h).sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
    ?? planos[0] ?? null;
  estado.plano = atual;
  estado.compras = []; estado.cardapio = []; estado.notas = [];
  if (!atual) return;
  const [compras, cardapio] = await Promise.all([
    q(sb.from("croc_compras").select("*, croc_itens(*)").eq("plano_id", atual.id)),
    q(sb.from("croc_cardapio").select("*").eq("plano_id", atual.id).order("data")),
  ]);
  estado.compras = compras.map((c) => ({ ...c, itens: (c.croc_itens ?? []).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => indiceCompra(a) - indiceCompra(b));
  estado.compras.forEach((c) => delete c.croc_itens);
  estado.cardapio = cardapio;
  const ids = estado.compras.map((c) => c.id);
  estado.notas = ids.length ? await q(sb.from("croc_notas").select("id, compra_id, conta_no_plano, total, emitente, emissao, criado_em, criado_por, linhas").in("compra_id", ids).order("criado_em")) : [];
  const ap = await q(sb.from("croc_aprendizado").select("texto, destino"));
  estado.aprendidos = Object.fromEntries(ap.map((a) => [a.texto, a.destino]));
  estado.compras.forEach((c) => { c.notas = estado.notas.filter((n) => n.compra_id === c.id).length; });
  ouvirCarrinho();
}

/** Plano novo: 4 semanas, 5 compras e o cardápio, gerados pela lógica e gravados de uma vez. */
async function criarPlano(inicio) {
  const cfg = estado.config;
  const p = L.gerarPlano(inicio, cfg.pessoas);
  const plano = await q(sb.from("croc_planos").insert({ inicio, orcamento: cfg.orcamento, pessoas: cfg.pessoas, criado_por: estado.email }).select().single());
  try {
    const compras = await q(sb.from("croc_compras").insert(p.compras.map((c) => ({ plano_id: plano.id, tipo: c.tipo, semana: c.semana, data: c.data }))).select());
    const itens = [];
    for (const c of p.compras) {
      const id = compras.find((x) => x.tipo === c.tipo && (x.semana ?? null) === (c.semana ?? null)).id;
      for (const it of c.itens) itens.push({ compra_id: id, chave: it.chave, nome: it.nome, qtd: it.qtd, unidade: it.unidade, preco: it.preco, local: it.local, coringa: it.coringa, congela: it.congela, ordem: it.ordem });
    }
    await q(sb.from("croc_itens").insert(itens));
    await q(sb.from("croc_cardapio").insert(p.cardapio.map((x) => ({ ...x, plano_id: plano.id }))));
  } catch (e) {
    await sb.from("croc_planos").delete().eq("id", plano.id);
    throw e;
  }
}

// Marcações do carrinho chegam ao vivo de quem está no mercado
let canal = null;
function ouvirCarrinho() {
  if (canal || !estado.casa) return;
  canal = sb.channel("carrinho")
    .on("postgres_changes", { event: "*", schema: "public", table: "croc_itens", filter: `casa_id=eq.${estado.casa.casa_id}` }, (ev) => {
      const novo = ev.new, velho = ev.old;
      if (ev.eventType === "UPDATE") {
        for (const c of estado.compras) {
          const i = c.itens.findIndex((x) => x.id === novo.id);
          if (i >= 0) c.itens[i] = { ...c.itens[i], ...novo };
        }
      } else if (ev.eventType === "INSERT") {
        const c = compraPorId(novo.compra_id);
        if (c && !c.itens.some((x) => x.id === novo.id)) c.itens.push(novo);
      } else if (ev.eventType === "DELETE") {
        for (const c of estado.compras) c.itens = c.itens.filter((x) => x.id !== velho.id);
      }
      if (rotaAtual().nome === "compras" && folha.hidden) desenhar();
    })
    .subscribe();
}

// ------------------------------------------------------------------ navegação
function rotaAtual() {
  const partes = (location.hash.replace(/^#/, "") || "hoje").split("/");
  return { nome: partes[0], args: partes.slice(1) };
}
const TELAS_SEM_ABAS = new Set(["escanear", "nota", "comparar", "novo-plano", "prato", "casa", "avisos"]);
const ABA_DA_TELA = { hoje: "hoje", semana: "semana", compras: "compras", ideias: "ideias", grana: "grana" };
let pararCamera = null;
let vezDesenho = 0; // cada desenho tem um número: telas que esperam a rede não pintam por cima da tela seguinte
async function desenhar() {
  vezDesenho++;
  if (pararCamera) { pararCamera(); pararCamera = null; }
  const { nome, args } = rotaAtual();
  const semAbas = TELAS_SEM_ABAS.has(nome);
  abas.hidden = semAbas;
  document.body.classList.toggle("sem-abas", semAbas);
  for (const a of abas.querySelectorAll("a")) {
    if (a.dataset.aba === ABA_DA_TELA[nome]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const telas = { hoje: telaHoje, semana: telaSemana, prato: telaPrato, compras: telaCompras, ideias: telaIdeias, grana: telaGrana,
    escanear: telaEscanear, nota: telaNota, comparar: telaComparar, casa: telaCasa, avisos: telaAvisos, "novo-plano": telaNovoPlano };
  const tela = telas[nome] ?? telaHoje;
  if (!estado.plano && !["novo-plano", "casa", "avisos", "ideias", "prato"].includes(nome)) return telaNovoPlano();
  try { await tela(...args); }
  catch (e) { app.innerHTML = `<div class="vazio"><strong>Algo deu errado</strong>${esc(e.message)}<button class="pilula" data-acao="recarregar">Tentar de novo</button></div>`; }
}
window.addEventListener("hashchange", () => { fecharFolha(); desenhar(); window.scrollTo(0, 0); });
const ir = (hash) => { if (location.hash === hash) desenhar(); else location.hash = hash; };

// ações por data-acao (clique) e data-muda (mudança)
const acoes = {}, mudancas = {};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-acao]");
  if (!el) return;
  const f = acoes[el.dataset.acao];
  if (f) { e.preventDefault(); f(el, e); }
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-muda]");
  if (el && mudancas[el.dataset.muda]) mudancas[el.dataset.muda](el, e);
});
acoes.recarregar = () => location.reload();
acoes.voltar = () => (history.length > 1 ? history.back() : ir("#hoje"));

function abrirFolha(html) {
  folha.innerHTML = `<div class="folha" role="dialog" aria-modal="true"><div class="puxador"></div>${html}</div>`;
  folha.hidden = false;
  folha.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
}
function fecharFolha() { folha.hidden = true; folha.innerHTML = ""; }
folha.addEventListener("click", (e) => { if (e.target === folha) fecharFolha(); });
acoes.fecharFolha = fecharFolha;
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !folha.hidden) fecharFolha(); });

function topo({ voltar = null, titulo = "", direita = "" } = {}) {
  if (voltar === null) {
    const sem = estado.plano ? L.semanaDoDia(estado.plano.inicio, hoje()) : null;
    return `<header class="topo">
      <a href="#hoje" class="logo" aria-label="Crocante, início"><img src="icons/crocante-192.png" alt=""><span>CROCANTE<b>*</b></span></a>
      <div class="topo-acoes">${sem != null && appInstalado() ? `<span class="etiqueta">SEM ${sem + 1}/4</span>` : ""}
        ${appInstalado() ? "" : `<button class="redondo" data-acao="instalarApp" aria-label="Instalar o app">${ICONE_INSTALAR}</button>`}
        <a href="#avisos" class="redondo" aria-label="Avisos">${ICONE_SINO}</a>${avatarHtml()}</div></header>`;
  }
  return `<header class="topo">
    <a href="${voltar}" class="redondo" aria-label="Voltar">${SETA_VOLTAR}</a>
    <span class="titulo-mono">${titulo}</span>
    ${direita || `<span style="width:44px"></span>`}</header>`;
}

// ------------------------------------------------------------------ HOJE
async function telaHoje() {
  const h = hoje(), p = estado.plano;
  const r = resumo();
  const prox = proximaCompra();
  const fim = L.addDias(p.inicio, 27);
  let corpo = "";
  if (h < p.inicio) {
    corpo = `<div class="cabeca"><div class="eyebrow">${esc(dataLonga(h))}</div>
      <h1 class="h1">O plano começa <span class="destaque">domingo ${L.dataCurta(p.inicio)}</span></h1>
      <p class="lead">Antes, a compra do mês e a da semana 1, no sábado ${L.dataCurta(L.addDias(p.inicio, -1))}. No domingo vocês fazem o primeiro preparo.</p></div>`;
  } else if (h > fim) {
    corpo = `<div class="cabeca"><div class="eyebrow">${esc(dataLonga(h))}</div>
      <h1 class="h1">O plano de 4 semanas <span class="destaque">acabou</span></h1>
      <p class="lead">Monte o próximo mês: o cardápio volta para a semana 1 e as compras são geradas de novo com o orçamento da casa.</p>
      <a class="botao" href="#novo-plano">Montar o próximo mês</a></div>`;
  } else {
    const jantar = pratoDo(h, "jantar"), almoco = pratoDo(h, "almoco");
    const J = PRATOS[jantar?.prato], A = PRATOS[almoco?.prato];
    const noite = L.lembretes(h, "noite", planoParaLogica());
    corpo = `<div class="cabeca"><div class="eyebrow">${esc(dataLonga(h))}</div>
      <h1 class="h1">Hoje à noite tem <span class="destaque">${esc((J?.nome ?? "").toLowerCase())}</span></h1></div>
      ${J ? `<section class="papel">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="rotulo">JANTAR · PRATO ${J.id}</span><span class="rotulo vermelho">${esc(J.tempo.toUpperCase())}</span></div>
        <h2 class="h2">${esc(J.nome)}</h2>
        <p class="pequeno">${esc(J.resumo)}</p>
        <div style="display:flex;gap:10px;align-items:flex-start;border-top:1px solid var(--line-paper);padding-top:12px"><span class="asterisco" aria-hidden="true">*</span><span style="font-size:14px"><b style="font-weight:600">Crocância:</b> ${esc(J.crocancia.toLowerCase())}</span></div>
        <a class="botao escuro" href="#prato/${J.id}/${h}/jantar">Começar a cozinhar ↗</a>
      </section>` : ""}
      <section class="lista">
        ${A ? `<a class="linha" href="#prato/${A.id}/${h}/almoco"><span class="cresce"><span class="rotulo">ALMOÇO</span><span class="h3">${esc(A.nome)}</span></span><span class="valor">${esc(A.tempo)} ↗</span></a>` : ""}
        ${noite.map((l) => `<div class="linha"><span class="ponto"></span><span class="cresce"><span class="rotulo">HOJE À NOITE · ${l.tipo === "desc" ? "DESCONGELAR" : l.tipo === "merc" ? "MERCADO AMANHÃ" : "PREPARO AMANHÃ"}</span><span class="pequeno">${esc(l.tipo === "desc" ? l.corpo : `${l.titulo}. ${l.corpo}`)}</span></span></div>`).join("")}
      </section>`;
  }
  const proxTxt = prox ? (prox.data === h ? "HOJE · MERCADO" : prox.data === L.addDias(h, 1) ? "AMANHÃ · MERCADO" : `MERCADO · ${L.DIAS_CURTOS[L.diaSemana(prox.data)]} ${L.dataCurta(prox.data)}`) : "COMPRAS";
  const rasc = estado.rascunho && compraPorId(estado.rascunho.compra_id);
  app.innerHTML = `${topo()}<div class="conteudo">${corpo}
    ${rasc ? `<a class="contorno alerta" href="#nota" style="text-decoration:none"><span class="rotulo alerta">NOTA EM REVISÃO · NÃO SALVA</span><span>${esc(estado.rascunho.emitente ?? "Nota fiscal")} · ${esc(nomeCompra(rasc).toLowerCase())}. Continuar ↗</span></a>` : ""}
    <section class="grade">
      <a href="#grana"><span class="rotulo">SOBRA PREVISTA</span><span class="numero ${r.dentro ? "vermelho" : ""}">${R0(r.sobra)}</span><span class="pequeno">de ${R0(estado.plano.orcamento)} no mês</span></a>
      <a href="#compras/${prox ? indiceCompra(prox) : 1}"><span class="rotulo ${prox && prox.data <= L.addDias(h, 1) ? "alerta" : ""}">${proxTxt}</span><span class="numero">${prox ? R0(L.somaItens(prox.itens)) : "✓"}</span><span class="pequeno">${prox ? `${esc(nomeCompra(prox).toLowerCase())} · ${pl(prox.itens.length, "item", "itens")}` : "tudo comprado"}</span></a>
    </section>
    ${cartaoInstalar()}
    <a class="contorno" href="#ideias" style="text-decoration:none"><span class="rotulo">NADA AGRADA HOJE?</span><span>Sorteie uma combinação ou veja os 30 pratos, cafés e doces ↗</span></a>
  </div>`;
}
function planoParaLogica() {
  return { inicio: estado.plano.inicio, compras: estado.compras, cardapio: estado.cardapio, orcamento: estado.plano.orcamento };
}

// ------------------------------------------------------------------ SEMANA
async function telaSemana(n) {
  const p = estado.plano, h = hoje();
  const atual = L.semanaDoDia(p.inicio, h);
  const w = Math.min(3, Math.max(0, Number(n) ? Number(n) - 1 : (atual ?? 0)));
  const prep = PREPARO[w];
  const compra = estado.compras.find((c) => c.tipo === "semana" && c.semana === w + 1);
  const domingo = L.addDias(p.inicio, w * 7);
  const congel = L.congeladorDaSemana(w, compra?.itens, planoParaLogica());
  const calc = L.preparoDaSemana(p.inicio, w, estado.cardapio);
  const dias = Array.from({ length: 7 }, (_, d) => L.addDias(domingo, d));
  const bloco = (titulo, itens) => itens?.length ? `<div class="caixa"><span class="rotulo">${titulo}</span><ul class="simples">${itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  app.innerHTML = `${topo()}<div class="conteudo">
    <div class="cabeca"><div class="eyebrow">CARDÁPIO</div><h1 class="h1">Semana a semana</h1></div>
    <div class="segmentos" role="group" aria-label="Escolher semana">
      ${[0, 1, 2, 3].map((i) => `<button type="button" aria-pressed="${i === w}" data-acao="irSemana" data-n="${i + 1}">Semana ${i + 1}<small>${L.dataCurta(L.addDias(p.inicio, i * 7))}</small></button>`).join("")}
    </div>
    <div class="papel quadrado" style="padding:0;gap:0">
      ${compra ? `<a href="#compras/${w + 1}" class="linha" style="padding:14px 16px;border-color:var(--line-paper);color:var(--on-paper)">
        <span class="cresce"><span class="rotulo">1 · MERCADO · SÁB ${L.dataCurta(compra.data)}</span><span style="font-weight:500">${pl(compra.itens.length, "item", "itens")} · congelador ${congel}/${estado.config.congelador} ↗</span></span>
        <span class="numero m vermelho">${compra.pago != null ? "✓" : R0(L.somaItens(compra.itens))}</span></a>` : ""}
      <details class="mais">
        <summary class="linha" style="padding:14px 16px;border:0;color:var(--on-paper)">
          <span class="cresce"><span class="rotulo">2 · PREPARO · DOM ${L.dataCurta(domingo)}</span><span style="font-weight:500">Bases da semana, os dois juntos · ver ▾</span></span>
          <span class="numero m vermelho">${esc(prep.tempo)}</span></summary>
        <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:10px;color:var(--on-paper)">
          <p class="pequeno">Primeira leva (fogão e pressão)</p>
          <ul class="simples">${prep.p1.map(([n, q, c]) => `<li><b style="font-weight:600">${esc(n)}:</b> ${esc(q)}<br><span class="pequeno">${esc(COMO[c] ?? "")}</span></li>`).join("")}</ul>
          <p class="pequeno">Segunda leva</p>
          <ul class="simples">${prep.p2.map(([n, q, c]) => `<li><b style="font-weight:600">${esc(n)}:</b> ${esc(q)}<br><span class="pequeno">${esc(COMO[c] ?? "")}</span></li>`).join("")}</ul>
        </div>
      </details>
    </div>
    <details class="mais"><summary class="link-mono">O QUE SEPARAR, GUARDAR E DESCONGELAR ▾</summary>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
        <p class="pequeno">Calculado pelo cardápio desta semana: se um prato muda de dia, a geladeira, o congelador e o descongelar mudam junto.</p>
        ${bloco("SEPARE NO DOMINGO", prep.separe)}${bloco("USA NO PRÓPRIO DOMINGO (FAÇA ANTES DA REFEIÇÃO)", calc.fresco)}
        ${bloco("VAI PARA A GELADEIRA", calc.gel)}${bloco(`VAI PARA O CONGELADOR · ${calc.saquinhos} ${calc.saquinhos === 1 ? "SAQUINHO" : "SAQUINHOS"}`, calc.frz)}
        ${bloco("DESCONGELAR NA VÉSPERA", calc.desc.map((d) => `${d.quando}: ${d.o}`))}${bloco("CONFIRA QUE TEM EM CASA", calc.conf)}
      </div></details>
    <section class="lista">
      ${dias.map((dia, d) => {
        const a = pratoDo(dia, "almoco"), j = pratoDo(dia, "jantar");
        const eHoje = dia === h;
        return `<div class="linha ${eHoje ? "realce" : ""}" style="align-items:flex-start">
          <span style="width:46px;flex:0 0 auto;display:flex;flex-direction:column;gap:2px"><span class="rotulo ${eHoje ? "alerta" : ""}">${L.DIAS_CURTOS[d]}</span><span class="rotulo">${eHoje ? "HOJE" : L.dataCurta(dia)}</span></span>
          <span class="cresce" style="gap:6px">
            ${a ? `<a href="#prato/${a.prato}/${dia}/almoco" style="display:flex;justify-content:space-between;gap:8px;text-decoration:none"><span>${esc(PRATOS[a.prato].nome)}</span><span class="rotulo">ALMOÇO</span></a>` : ""}
            ${j ? `<a href="#prato/${j.prato}/${dia}/jantar" style="display:flex;justify-content:space-between;gap:8px;text-decoration:none;color:var(--fg-dim)"><span>${esc(PRATOS[j.prato].nome)}</span><span class="rotulo">JANTAR</span></a>` : ""}
          </span></div>`;
      }).join("")}
    </section>
    <p class="pequeno">Quer comer um prato em outro dia? Abra o prato e toque em “Mudar de dia”: ele troca de lugar com outro da mesma semana, e as compras continuam cobertas.</p>
  </div>`;
}
acoes.irSemana = (el) => ir(`#semana/${el.dataset.n}`);

// ------------------------------------------------------------------ PRATO
async function telaPrato(id, dia, ref) {
  const P = PRATOS[Number(id)], D = RECEITAS[Number(id)];
  if (!P) return ir("#hoje");
  const feitos = estado.passos[id] ?? new Set();
  const nada = D.pre.length === 1 && D.pre[0].startsWith("Nada");
  const voltar = dia ? "#semana" : "#ideias/pratos";
  let guarda = "";
  if (dia && estado.plano) {
    const w = L.semanaDoDia(estado.plano.inicio, dia);
    if (w != null) {
      const d = L.diasEntre(L.addDias(estado.plano.inicio, 7 * w), dia);
      const linhas = L.basesDoPrato(id).map((b) => {
        const g = L.guardaDaBase(b, d), nome = maiuscula(L.BASES[b].nome);
        if (g === "fresco") return `${nome}: feita no preparo de hoje, antes ${ref === "almoco" ? "do almoço" : "do jantar"}`;
        if (g === "geladeira") return `${nome}: na geladeira desde domingo`;
        if (g === "comprado") return `${nome}: vem do congelador da compra, descongele na noite anterior (${L.DIAS[(d + 6) % 7]})`;
        if (L.BASES[b].tipo === "empanado") return `${nome}: direto do congelador, sem descongelar`;
        return `${nome}: no congelador, descongele na noite anterior (${L.DIAS[(d + 6) % 7]})`;
      });
      if (linhas.length) guarda = `<div class="caixa"><span class="rotulo">ONDE ESTÁ A BASE</span><ul class="simples">${linhas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    }
  }
  app.innerHTML = `${topo({ voltar, titulo: `PRATO ${P.id} · ${esc(CAT[P.cat].toUpperCase())}` })}<div class="conteudo">
    <div class="cabeca"><h1 class="h1">${esc(P.nome)}</h1>
      <div class="pilulas">${[TIPO[P.tipo], P.tempo, `${estado.config?.pessoas ?? 2} pessoas`].map((t) => `<span class="etiqueta">${esc(t.toUpperCase())}</span>`).join("")}</div>
      ${dia ? `<p class="pequeno">${esc(maiuscula(dataLonga(dia)))} · ${ref === "almoco" ? "almoço" : "jantar"}</p>` : ""}</div>
    <section class="grade escura">
      <div><span class="rotulo">PRONTO DO DOMINGO</span><span style="font-size:14px">${esc(nada ? D.pre[0] : D.pre.join(" · "))}</span></div>
      <div><span class="rotulo">SEPARE NA HORA</span><span style="font-size:14px">${esc(D.ing.join(" · "))}</span></div>
    </section>
    ${guarda}
    <section style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center"><div class="eyebrow">PASSO A PASSO</div><span class="mono pequeno">${feitos.size}/${D.p.length}</span></div>
      <ol class="passos lista">${D.p.map((t, i) => `<li><button class="linha" type="button" data-acao="passo" data-prato="${id}" data-i="${i}" aria-pressed="${feitos.has(i)}" style="align-items:flex-start">
        <span class="numero m" style="flex:0 0 30px;color:${feitos.has(i) ? "var(--fg-mute)" : "var(--signal)"}">${i + 1}</span>
        <span style="font-size:15px;line-height:1.45;${feitos.has(i) ? "text-decoration:line-through;color:var(--fg-mute)" : ""}">${esc(t)}</span></button></li>`).join("")}</ol>
    </section>
    <div class="papel quadrado" style="flex-direction:row;gap:10px;align-items:flex-start"><span class="asterisco" aria-hidden="true">*</span><span style="font-size:14px"><b style="font-weight:600">Crocância:</b> ${esc(P.crocancia.toLowerCase())}.</span></div>
  </div>
  ${dia ? `<div class="rodape-fixo" style="flex-direction:row">
    <button class="pilula" data-acao="mudarDia" data-dia="${dia}" data-ref="${ref}">Mudar de dia</button>
    <a class="botao" style="flex:1" href="#hoje">Comemos!</a></div>` : ""}`;
}
acoes.passo = (el) => {
  const id = el.dataset.prato, i = Number(el.dataset.i);
  const s = estado.passos[id] ?? (estado.passos[id] = new Set());
  s.has(i) ? s.delete(i) : s.add(i);
  desenhar();
};
const NOME_REF = { almoco: "almoço", jantar: "jantar" };
/** Mudar de dia: o prato troca de lugar com outro da mesma semana (as compras continuam cobertas). */
acoes.mudarDia = (el) => {
  const { dia, ref } = el.dataset;
  const w = L.semanaDoDia(estado.plano.inicio, dia);
  const domingo = L.addDias(estado.plano.inicio, 7 * w);
  const atual = pratoDo(dia, ref);
  const opcoes = [];
  for (let d = 0; d < 7; d++) for (const r of ["almoco", "jantar"]) {
    const data = L.addDias(domingo, d);
    if (data === dia && r === ref) continue;
    const x = pratoDo(data, r);
    if (x) opcoes.push({ data, r, d, x });
  }
  abrirFolha(`<h2 class="h2">Mudar ${esc(PRATOS[atual.prato].nome.toLowerCase())} de dia</h2>
    <p class="pequeno">Escolha o dia. Os dois pratos trocam de lugar e o preparo, a geladeira, o congelador e os lembretes de descongelar se ajustam.</p>
    <div class="lista">${opcoes.map((o) => `<button class="linha" data-acao="trocarDias" data-de="${dia}/${ref}" data-para="${o.data}/${o.r}">
      <span style="width:58px;flex:0 0 auto;display:flex;flex-direction:column;gap:2px"><span class="rotulo ${o.data === hoje() ? "alerta" : ""}">${L.DIAS_CURTOS[o.d]} ${L.dataCurta(o.data)}</span><span class="rotulo">${NOME_REF[o.r].toUpperCase()}</span></span>
      <span class="cresce"><span>${esc(PRATOS[o.x.prato].nome)}</span><span class="pequeno">vai para ${esc(L.DIAS[L.diaSemana(dia)])}, ${NOME_REF[ref]}</span></span></button>`).join("")}</div>`);
};
acoes.trocarDias = async (el) => {
  const [diaA, refA] = el.dataset.de.split("/"), [diaB, refB] = el.dataset.para.split("/");
  const a = pratoDo(diaA, refA), b = pratoDo(diaB, refB);
  try {
    await q(sb.from("croc_cardapio").update({ prato: b.prato }).eq("id", a.id));
    await q(sb.from("croc_cardapio").update({ prato: a.prato }).eq("id", b.id));
    [a.prato, b.prato] = [b.prato, a.prato];
    fecharFolha();
    avisar(`${PRATOS[b.prato].nome} agora é ${L.DIAS[L.diaSemana(diaB)]}, ${NOME_REF[refB]}`);
    ir(`#prato/${b.prato}/${diaB}/${refB}`);
  } catch (e) { avisar(e.message, true); }
};

// ------------------------------------------------------------------ COMPRAS
async function telaCompras(n) {
  const prox = proximaCompra();
  const idx = n != null && n !== "" ? Number(n) : (prox ? indiceCompra(prox) : 1);
  const c = estado.compras.find((x) => indiceCompra(x) === idx) ?? estado.compras[0];
  const st = statusCompra(c);
  const total = L.somaItens(c.itens);
  const noCarrinho = L.somaItens(c.itens.filter((i) => i.marcado));
  const ehSemana = c.tipo === "semana";
  const ocupado = ehSemana ? L.congeladorDaSemana(c.semana - 1, c.itens, planoParaLogica()) : 0;
  const cap = estado.config.congelador;
  const grupos = Object.keys(LOCAIS).map((loc) => [loc, c.itens.filter((i) => i.local === loc)]).filter(([, its]) => its.length);
  const sub = ehSemana
    ? `Sáb ${L.dataCurta(c.data)}, véspera do preparo de domingo ${L.dataCurta(L.addDias(c.data, 1))}. Só o que essa semana usa.`
    : `Sáb ${L.dataCurta(c.data)}, junto com a semana 1. Itens que duram o mês inteiro.`;
  const notaFreezer = ocupado > cap ? `Passou do espaço: congele as bases em saquinhos achatados ou deixe os nuggets para a semana seguinte.`
    : ocupado >= cap - 1 ? `Quase cheio: use primeiro o que já estava congelado.` : `Cabe com folga.`;
  app.innerHTML = `${topo()}<div class="conteudo">
    <div class="cabeca"><div class="eyebrow">COMPRAS · ${esc(nomeMes(estado.plano.inicio).toUpperCase())}</div>
      <div class="segmentos" role="group" aria-label="Escolher compra">
        ${estado.compras.map((x) => { const s = statusCompra(x); return `<button type="button" aria-pressed="${x.id === c.id}" data-acao="irCompra" data-n="${indiceCompra(x)}">${x.tipo === "mes" ? "Mês" : `Sem ${x.semana}`}<small class="${s.tipo === "alerta" ? "alerta" : ""}">${x.pago != null ? "✓" : L.dataCurta(x.data)}</small></button>`; }).join("")}
      </div></div>
    <section style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h1 class="h2">${esc(nomeCompra(c))}</h1><span class="etiqueta ${st.tipo === "alerta" ? "alerta" : ""}"><span class="ponto ${st.tipo === "feita" ? "cinza" : ""}"></span>${st.txt}</span></div>
      <p class="pequeno">${esc(sub)}</p>
      <div class="grade">
        <div><span class="rotulo">${c.pago != null ? `PAGO · PLAN. ${R0(total)}` : "PLANEJADO"}</span><span class="numero m">${R(c.pago ?? total).replace("R$ ", "R$")}</span></div>
        <div><span class="rotulo">NO CARRINHO</span><span class="numero m vermelho">${R(noCarrinho).replace("R$ ", "R$")}</span></div>
      </div>
    </section>
    ${ehSemana ? `<section class="caixa" aria-label="Espaço no congelador">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="rotulo">CONGELADOR NESTA SEMANA</span><span class="mono" style="font-size:13px">${ocupado}/${cap} espaços</span></div>
      <div class="celulas ${ocupado >= cap - 1 ? "lotado" : ""}" style="--n:${cap}" aria-hidden="true">${Array.from({ length: cap }, (_, i) => `<span class="${i < ocupado ? "cheia" : ""}"></span>`).join("")}</div>
      <span class="pequeno">${notaFreezer} Bases que o cardápio desta semana manda congelar, o que já vem congelado e o bacon do mês.</span></section>`
    : `<div class="caixa pequeno">Só o que dura o mês todo fora da geladeira. O bacon vem em cubos e ocupa 1 espaço no congelador até o fim do mês.</div>`}
    ${grupos.map(([loc, its]) => `<section>
      <div class="secao-titulo"><h2 class="h3">${esc(LOCAIS[loc])}</h2><span class="mono pequeno">${R(L.somaItens(its))}</span></div>
      <div>${its.map((i) => `<label class="check ${i.marcado ? "feito" : ""}">
        <input type="checkbox" data-muda="marcar" data-id="${i.id}" ${i.marcado ? "checked" : ""}>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="nome">${i.coringa ? `<span class="asterisco" style="font-size:15px">* </span>` : ""}${esc(i.nome)}</span>
          <span class="mono" style="font-size:11px;color:var(--fg-mute)">${esc(L.qtdTexto(i.qtd, i.unidade))} · ${R(i.preco)}${i.marcado && i.marcado_por && i.marcado_por !== estado.email ? ` · ${esc(i.marcado_por.split("@")[0])}` : ""}</span></span>
        <button type="button" class="editar" data-acao="editarItem" data-id="${i.id}" aria-label="Editar ${esc(i.nome)}">${R(L.valorItem(i))}</button>
      </label>`).join("")}</div></section>`).join("")}
    <div class="pilulas"><button class="pilula" data-acao="novoItem" data-compra="${c.id}">+ Adicionar item</button>
      ${c.pago == null ? `<button class="pilula" data-acao="pagarSemNota" data-compra="${c.id}">Já paguei, sem nota</button>` : `<button class="pilula" data-acao="desfazerPago" data-compra="${c.id}">Reabrir compra</button>`}</div>
    ${notasDaCompra(c.id).length ? `<section><div class="secao-titulo"><h2 class="h3">Notas desta compra</h2><span class="mono pequeno">${R(c.pago ?? 0)}</span></div>
      <div class="lista">${notasDaCompra(c.id).map((n) => { const fora = (n.linhas ?? []).filter((l) => l.removido).length, sem = (n.linhas ?? []).filter((l) => !l.removido && !l.item_id).length; return `<button class="linha" data-acao="abrirNota" data-id="${n.id}">
        <span class="cresce"><span>${esc(n.emitente ?? "Nota fiscal")}</span><span class="pequeno">${n.emissao ? L.dataCurta(n.emissao.slice(0, 10)) + " · " : ""}${pl((n.linhas ?? []).length, "item", "itens")}${fora ? ` · ${fora} fora do plano` : ""}${sem ? ` · <span style="color:var(--signal-2)">${sem} sem par</span>` : ""}</span></span>
        <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="valor" style="color:var(--fg)">${R(n.conta_no_plano)}</span><span class="rotulo">REVISAR ↗</span></span></button>`; }).join("")}</div></section>` : ""}
    <p class="pequeno"><span class="asterisco" style="font-size:15px">*</span> coringa, não pode faltar. O que um morador marca aparece na hora para o outro.</p>
  </div>
  <div class="rodape-fixo"><a class="botao" href="#escanear/${c.id}">${notasDaCompra(c.id).length ? "Adicionar outra nota" : "Escanear a nota desta compra"}</a></div>`;
}
acoes.irCompra = (el) => ir(`#compras/${el.dataset.n}`);
function itemPorId(id) { for (const c of estado.compras) { const i = c.itens.find((x) => x.id === id); if (i) return [c, i]; } return [null, null]; }
mudancas.marcar = async (el) => {
  const [, it] = itemPorId(el.dataset.id);
  if (!it) return;
  const marcado = el.checked;
  Object.assign(it, { marcado, marcado_por: marcado ? estado.email : null, marcado_em: marcado ? new Date().toISOString() : null });
  el.closest(".check").classList.toggle("feito", marcado);
  try { await q(sb.from("croc_itens").update({ marcado, marcado_por: it.marcado_por, marcado_em: it.marcado_em }).eq("id", it.id)); desenhar(); }
  catch (e) { avisar(e.message, true); }
};
function formItem(it = {}) {
  return `<label class="campo"><span class="rotulo">NOME</span><input name="nome" value="${esc(it.nome ?? "")}" required></label>
    <div class="campos-2">
      <label class="campo"><span class="rotulo">QUANTIDADE</span><input name="qtd" inputmode="decimal" value="${esc(String(it.qtd ?? 1).replace(".", ","))}"></label>
      <label class="campo"><span class="rotulo">UNIDADE</span><input name="unidade" value="${esc(it.unidade ?? "un")}"></label>
    </div>
    <div class="campos-2">
      <label class="campo"><span class="rotulo">PREÇO POR UNIDADE</span><input name="preco" inputmode="decimal" value="${esc(String(it.preco ?? "").replace(".", ","))}"></label>
      <label class="campo"><span class="rotulo">ONDE GUARDA</span><select name="local">${Object.entries(LOCAIS).map(([k, v]) => `<option value="${k}" ${it.local === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
    </div>`;
}
const numero = (s) => Number(String(s ?? "").replace(/\./g, "").replace(",", "."));
function lerFormItem() {
  const f = folha;
  const dados = { nome: $("[name=nome]", f).value.trim(), qtd: numero($("[name=qtd]", f).value), unidade: $("[name=unidade]", f).value.trim() || "un", preco: numero($("[name=preco]", f).value), local: $("[name=local]", f).value };
  if (!dados.nome) throw new Error("Dê um nome ao item.");
  if (!(dados.qtd > 0)) throw new Error("A quantidade precisa ser maior que zero.");
  if (!(dados.preco >= 0)) throw new Error("Confira o preço.");
  return dados;
}
acoes.editarItem = (el, e) => {
  e.stopPropagation();
  const [, it] = itemPorId(el.dataset.id);
  abrirFolha(`<h2 class="h2">Editar item</h2>${formItem(it)}
    <button class="botao" data-acao="salvarItem" data-id="${it.id}">Salvar</button>
    <button class="link-mono" data-acao="removerItem" data-id="${it.id}">REMOVER DA LISTA</button>`);
};
acoes.salvarItem = async (el) => {
  try {
    const dados = lerFormItem();
    await q(sb.from("croc_itens").update(dados).eq("id", el.dataset.id));
    Object.assign(itemPorId(el.dataset.id)[1], dados);
    fecharFolha(); desenhar();
  } catch (e) { avisar(e.message, true); }
};
acoes.removerItem = async (el) => {
  try {
    await q(sb.from("croc_itens").delete().eq("id", el.dataset.id));
    const [c] = itemPorId(el.dataset.id);
    c.itens = c.itens.filter((x) => x.id !== el.dataset.id);
    fecharFolha(); desenhar(); avisar("Item removido");
  } catch (e) { avisar(e.message, true); }
};
acoes.novoItem = (el) => {
  const c = compraPorId(el.dataset.compra);
  abrirFolha(`<h2 class="h2">Adicionar à ${esc(nomeCompra(c).toLowerCase())}</h2>${formItem({ local: c.tipo === "mes" ? "d" : "g" })}
    <button class="botao" data-acao="criarItem" data-compra="${c.id}">Adicionar</button>`);
};
acoes.criarItem = async (el) => {
  try {
    const c = compraPorId(el.dataset.compra);
    const dados = lerFormItem();
    const novo = await q(sb.from("croc_itens").insert({ ...dados, compra_id: c.id, ordem: 900 + c.itens.length }).select().single());
    if (!c.itens.some((x) => x.id === novo.id)) c.itens.push(novo);
    fecharFolha(); desenhar(); avisar("Item adicionado");
  } catch (e) { avisar(e.message, true); }
};
acoes.pagarSemNota = (el) => {
  const c = compraPorId(el.dataset.compra);
  abrirFolha(`<h2 class="h2">Quanto ficou a ${esc(nomeCompra(c).toLowerCase())}?</h2>
    <p class="pequeno">Use quando não der para ler a nota. Digite só o que é do plano (sem compras à parte).</p>
    <label class="campo"><span class="rotulo">VALOR PAGO</span><input name="valor" inputmode="decimal" placeholder="${esc(R(L.somaItens(c.itens)))}"></label>
    <button class="botao" data-acao="salvarPagoManual" data-compra="${c.id}">Salvar</button>`);
};
acoes.salvarPagoManual = async (el) => {
  const v = numero($("[name=valor]", folha).value);
  if (!(v > 0)) return avisar("Digite o valor pago.", true);
  try {
    await q(sb.from("croc_compras").update({ pago: v, feita_em: new Date().toISOString() }).eq("id", el.dataset.compra));
    compraPorId(el.dataset.compra).pago = v;
    fecharFolha(); desenhar(); avisar("Compra salva");
    fn("/avisar", { tipo: "compra", compra_id: el.dataset.compra }).catch(() => {});
  } catch (e) { avisar(e.message, true); }
};
acoes.desfazerPago = async (el) => {
  const c = compraPorId(el.dataset.compra);
  if (notasDaCompra(c.id).length) return avisar("Esta compra tem nota salva. Para mudar o valor, revise ou apague a nota na lista abaixo.", true);
  try { await q(sb.from("croc_compras").update({ pago: null, feita_em: null }).eq("id", c.id)); c.pago = null; desenhar(); }
  catch (e) { avisar(e.message, true); }
};

// ------------------------------------------------------------------ IDEIAS (sorteio, pratos, café, doces, dicas)
async function telaIdeias(sub) {
  if (sub === "pratos") return telaPratos();
  if (sub === "cafe") return telaLista("CAFÉ E LANCHES", "Café e lanches", [["Café da manhã · até 10 min", CAFE], ["Lanche da tarde", LANCHE]]);
  if (sub === "dicas") return telaLista("DICAS", "Para render, crocar e não enjoar", [["Para render o dinheiro", DICAS.economia], ["Para garantir crocância", DICAS.crocancia], ["Para não enjoar", DICAS.variedade]]);
  if (sub === "doces") return telaDoces();
  if (!estado.sorteio) estado.sorteio = { pick: SORTEIO.map((s) => Math.floor(Math.random() * s[1].length)), lock: SORTEIO.map(() => false) };
  const { pick, lock } = estado.sorteio;
  const v = SORTEIO.map((s, i) => s[1][pick[i]]);
  app.innerHTML = `${topo()}<div class="conteudo">
    <div class="cabeca"><div class="eyebrow">MONTE SEU PRATO</div>
      <h1 class="h1">Nada agrada? <span class="destaque">Sorteia.</span></h1>
      <p class="lead">Trave o que gostou e troque só o resto.</p></div>
    <section class="lista">${SORTEIO.map((s, i) => `<div class="slot ${lock[i] ? "travado" : ""}">
      <span class="cresce" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="rotulo">${esc(s[0].toUpperCase())}</span><span class="h3">${esc(v[i])}</span></span>
      <button class="redondo" data-acao="rolar" data-i="${i}" aria-label="Trocar ${esc(s[0].toLowerCase())}" ${lock[i] ? "disabled" : ""}>${ICONE_GIRAR}</button>
      <button class="redondo ${lock[i] ? "ativo" : ""}" data-acao="travar" data-i="${i}" aria-pressed="${lock[i]}" aria-label="${lock[i] ? "Destravar" : "Travar"} ${esc(s[0].toLowerCase())}">${ICONE_CADEADO(lock[i])}</button>
    </div>`).join("")}</section>
    <section class="papel"><span class="rotulo">HOJE VAI SER</span><p style="font-size:21px;line-height:1.3;font-weight:500;letter-spacing:-.02em">${esc(L.fraseSorteio(v))}</p></section>
    <button class="botao" data-acao="sortear">Sortear de novo</button>
    <section class="lista">
      <a class="linha" href="#ideias/pratos"><span class="cresce"><span class="h3">Os 30 pratos</span><span class="pequeno">Com receita, tempo e o que deixa crocante</span></span><span class="valor">↗</span></a>
      <a class="linha" href="#ideias/cafe"><span class="cresce"><span class="h3">Café e lanches</span><span class="pequeno">Tudo em até 10 minutos</span></span><span class="valor">↗</span></a>
      <a class="linha" href="#ideias/doces"><span class="cresce"><span class="h3">Doces</span><span class="pequeno">Sem fruta, com o que está na lista</span></span><span class="valor">↗</span></a>
      <a class="linha" href="#ideias/dicas"><span class="cresce"><span class="h3">Dicas</span><span class="pequeno">Render o dinheiro, crocância e variedade</span></span><span class="valor">↗</span></a>
    </section></div>`;
}
const rolar = (i) => { const n = SORTEIO[i][1].length; let r; do { r = Math.floor(Math.random() * n); } while (n > 1 && r === estado.sorteio.pick[i]); estado.sorteio.pick[i] = r; };
acoes.rolar = (el) => { rolar(Number(el.dataset.i)); desenhar(); };
acoes.travar = (el) => { const i = Number(el.dataset.i); estado.sorteio.lock[i] = !estado.sorteio.lock[i]; desenhar(); };
acoes.sortear = () => { SORTEIO.forEach((_, i) => { if (!estado.sorteio.lock[i]) rolar(i); }); desenhar(); };

function telaPratos() {
  const f = estado.filtroPratos;
  const filtros = [["todos", "Todos"], ["t:r", "Rápidos"], ["t:f", "Forno faz sozinho"], ["t:s", "Fim de semana"], ...Object.entries(CAT)];
  const lista = PRATOS.filter((p) => p && (f === "todos" || (f.startsWith("t:") ? p.tipo === f.slice(2) : p.cat === f)));
  app.innerHTML = `${topo({ voltar: "#ideias", titulo: "OS 30 PRATOS" })}<div class="conteudo">
    <p class="lead">Feitos só com o que está na lista. O tempo considera as bases do domingo prontas.</p>
    <div class="pilulas rolagem">${filtros.map(([k, n]) => `<button class="pilula" aria-pressed="${k === f}" data-acao="filtrarPratos" data-f="${k}">${esc(n)}</button>`).join("")}</div>
    <section class="lista">${lista.map((p) => `<a class="linha" href="#prato/${p.id}" style="align-items:flex-start">
      <span class="cresce"><span class="rotulo">PRATO ${String(p.id).padStart(2, "0")} · ${esc(TIPO[p.tipo].toUpperCase())} · ${esc(p.tempo.toUpperCase())}</span><span class="h3">${esc(p.nome)}</span>
      <span class="pequeno">${esc(p.resumo)}</span><span class="pequeno vermelho" style="color:var(--signal-2)">Crocância: ${esc(p.crocancia.toLowerCase())}</span></span></a>`).join("")}</section></div>`;
}
acoes.filtrarPratos = (el) => { estado.filtroPratos = el.dataset.f; desenhar(); };
function telaLista(rotulo, titulo, secoes) {
  app.innerHTML = `${topo({ voltar: "#ideias", titulo: rotulo })}<div class="conteudo">
    <h1 class="h1">${esc(titulo)}</h1>
    ${secoes.map(([t, itens]) => `<section><div class="secao-titulo"><h2 class="h3">${esc(t)}</h2></div>
      <div class="lista">${itens.map((x) => `<div class="linha"><span class="ponto"></span><span class="cresce"><span style="font-size:15px">${esc(x)}</span></span></div>`).join("")}</div></section>`).join("")}</div>`;
}
function telaDoces() {
  app.innerHTML = `${topo({ voltar: "#ideias", titulo: "DOCES" })}<div class="conteudo">
    <h1 class="h1">Doces sem fruta</h1><p class="lead">Só o suco no mousse. Nenhum leva mais de 10 minutos de trabalho.</p>
    ${DOCES.map((d) => `<section class="caixa"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2 class="h3">${esc(d.nome)}</h2><span class="etiqueta">${esc(d.tempo.toUpperCase())}</span></div>
      <p class="pequeno">${esc(d.ing)}</p><p style="font-size:15px">${esc(d.modo)}</p><p class="pequeno" style="color:var(--signal-2)">${esc(d.dica)}</p></section>`).join("")}</div>`;
}

// ------------------------------------------------------------------ GRANA (orçamento)
async function telaGrana() {
  const r = resumo();
  const orc = Number(estado.plano.orcamento);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / Math.max(orc, r.previsto)) * 100)).toFixed(1)}%`;
  app.innerHTML = `${topo()}<div class="conteudo">
    <div class="cabeca"><div class="eyebrow">FECHAMENTO PREVISTO · ${esc(nomeMes(estado.plano.inicio).toUpperCase())}</div>
      <span class="numero g vermelho">${R0(r.previsto)}</span>
      <p class="lead">Pago até agora mais o que falta pelo planejado. ${r.dentro ? `Sobram <b style="color:var(--fg);font-weight:600">${R(r.sobra)}</b> de ${R(orc)}.` : `<b style="color:var(--signal-2);font-weight:600">Passa ${R(-r.sobra)}</b> dos ${R(orc)}.`}</p>
      <div class="barra-orc" aria-hidden="true"><span style="width:${pct(r.pago)};background:var(--signal)"></span><span style="width:${pct(r.falta)};background:var(--cinza-barra)"></span>${r.sobra > 0 ? `<span style="width:${pct(r.sobra)};border:1px solid var(--fg-dim)"></span>` : ""}</div>
      <div class="pilulas pequeno" style="gap:16px"><span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--signal)"></span>Pago ${R(r.pago)}</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--cinza-barra)"></span>Falta ${R(r.falta)}</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border:1px solid var(--fg-dim)"></span>Sobra</span></div>
    </div>
    <section>
      <div class="secao-titulo"><h2 class="h3">Compra por compra</h2><span class="rotulo">PLANEJADO → PAGO</span></div>
      <div class="lista">${r.linhas.map((l) => { const c = compraPorId(l.id); const s = statusCompra(c); return `<a class="linha ${s.tipo === "alerta" ? "realce" : ""}" href="#compras/${indiceCompra(c)}">
        <span class="ponto ${l.pago != null ? "cinza" : s.tipo === "alerta" ? "" : "vazio-p"}"></span>
        <span class="cresce"><span>${esc(nomeCompra(c))}</span><span class="rotulo ${s.tipo === "alerta" ? "alerta" : ""}">${L.DIAS_CURTOS[L.diaSemana(c.data)]} ${L.dataCurta(c.data)} · ${l.pago != null ? (c.notas ? "NOTA LIDA" : "VALOR DIGITADO") : s.txt}</span></span>
        ${l.pago != null ? `<span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="valor" style="color:var(--fg)">${R(l.pago)}</span><span class="mono" style="font-size:11px;color:${l.diferenca > 0 ? "var(--signal-2)" : "var(--fg-dim)"}">${l.diferenca > 0 ? "+" : l.diferenca < 0 ? "−" : ""}${R(Math.abs(l.diferenca))}</span></span>` : `<span class="valor">${R(l.planejado)}</span>`}
      </a>`; }).join("")}</div>
    </section>
    <a class="botao" href="#escanear">Escanear nota da compra</a>
    <section class="papel"><span class="rotulo">SE PRECISAR CORTAR</span>
      <p style="font-size:15px">Tire das próximas semanas o refrigerante e os nuggets prontos (faça os caseiros). <b style="font-weight:600">Batata palha, ketchup e queijo ficam.</b></p></section>
    <a class="link-mono" href="#casa">AJUSTAR ORÇAMENTO E PESSOAS ↗</a>
  </div>`;
}

// ------------------------------------------------------------------ ESCANEAR NOTA
function compraSugerida() {
  const h = hoje();
  const doDia = estado.compras.filter((c) => c.data === h || c.data === L.addDias(h, -1));
  if (doDia.length) return doDia.sort((a, b) => indiceCompra(b) - indiceCompra(a))[0];
  const abertas = estado.compras.filter((c) => c.pago == null);
  return abertas.filter((c) => c.data <= L.addDias(h, 1)).sort((a, b) => b.data.localeCompare(a.data) || indiceCompra(b) - indiceCompra(a))[0] ?? abertas[0] ?? estado.compras[0];
}
// Rascunho da nota em revisão: fica guardado no aparelho até ser salvo (o app pode fechar no meio)
const CHAVE_RASCUNHO = "crocRascunho";
function guardarRascunho() {
  try { if (estado.rascunho) localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(estado.rascunho)); else localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* sem armazenamento */ }
}
function recuperarRascunho() {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) ?? "null");
    if (r && compraPorId(r.compra_id)) estado.rascunho = r; else localStorage.removeItem(CHAVE_RASCUNHO);
  } catch { /* sem rascunho */ }
}
const notasDaCompra = (id, menos = null) => estado.notas.filter((n) => n.compra_id === id && n.id !== menos);

async function telaEscanear(compraId) {
  const c = compraPorId(compraId) ?? compraSugerida();
  const jaTem = notasDaCompra(c.id);
  app.innerHTML = `${topo({ voltar: `#compras/${indiceCompra(c)}`, titulo: "ESCANEAR NOTA" })}<div class="conteudo">
    <div class="pilulas rolagem" role="group" aria-label="Qual compra">${estado.compras.map((x) => `<button class="pilula" aria-pressed="${x.id === c.id}" data-acao="escolherCompraScan" data-id="${x.id}">${esc(nomeCompra(x))}${notasDaCompra(x.id).length ? ` · ${notasDaCompra(x.id).length} nota${notasDaCompra(x.id).length > 1 ? "s" : ""}` : ""}</button>`).join("")}</div>
    ${jaTem.length ? `<div class="caixa pequeno">Esta compra já tem ${pl(jaTem.length, "nota", "notas")} (${esc(jaTem.map((n) => n.emitente ?? "mercado").join(", "))}). A nova nota soma com ${jaTem.length > 1 ? "elas" : "ela"} no comparativo.</div>` : ""}
    <div class="camera"><video muted playsinline></video><div class="mira" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <span class="estado"><span class="ponto"></span><span id="estadoCamera">LIGANDO A CÂMERA</span></span></div>
    <p class="pequeno" style="text-align:center">Aponte para o QR code no rodapé da nota fiscal (NFC-e). Ele traz todos os itens e preços direto da SEFAZ.</p>
    <div class="pilulas" style="justify-content:center"><button class="pilula" data-acao="colarNota" data-compra="${c.id}">Colar link ou digitar chave</button>
      <button class="pilula" data-acao="pagarSemNota" data-compra="${c.id}">Sem nota: digitar o total</button></div>
  </div>`;
  const video = $(".camera video"), status = $("#estadoCamera");
  try {
    const v = vezDesenho;
    const leitor = await iniciarLeitor(video, (texto) => processarNota(texto, c.id), (s) => { status.textContent = s.toUpperCase(); });
    if (v !== vezDesenho) leitor.parar(); else pararCamera = leitor.parar;
  } catch (e) {
    status.textContent = /Permission|NotAllowed/i.test(e.message) ? "SEM PERMISSÃO PARA A CÂMERA" : "CÂMERA INDISPONÍVEL";
  }
}
acoes.escolherCompraScan = (el) => ir(`#escanear/${el.dataset.id}`);
acoes.colarNota = (el) => {
  abrirFolha(`<h2 class="h2">Link ou chave da nota</h2><p class="pequeno">Cole o link do QR code ou digite os 44 números da chave de acesso.</p>
    <label class="campo"><span class="rotulo">LINK OU CHAVE</span><textarea name="texto" rows="3"></textarea></label>
    <button class="botao" data-acao="lerTextoNota" data-compra="${el.dataset.compra}">Ler nota</button>`);
};
acoes.lerTextoNota = (el) => {
  const t = $("[name=texto]", folha).value.trim();
  if (!t) return avisar("Cole o link ou a chave.", true);
  fecharFolha();
  processarNota(t, el.dataset.compra);
};
async function processarNota(texto, compraId) {
  if (pararCamera) { pararCamera(); pararCamera = null; }
  app.innerHTML = `${topo({ voltar: "#escanear", titulo: "LENDO A NOTA" })}<div class="carregando-tela" style="flex-direction:column;gap:16px"><div class="spinner"></div><p class="pequeno">Consultando a SEFAZ…</p></div>`;
  try {
    const { nota } = await fn("/nfce", { texto });
    if (nota.chave) {
      const ja = await q(sb.from("croc_notas").select("id").eq("chave", nota.chave).limit(1));
      if (ja.length) throw new Error("Essa nota já foi salva antes. Para revisar, abra a compra e toque na nota.");
    }
    const c = compraPorId(compraId);
    const linhas = L.casarNota(c.itens, nota.itens.map((i) => ({ descricao: i.descricao, valor: i.valor_total, qtd: i.quantidade, un: i.unidade })), estado.aprendidos);
    estado.rascunho = { nota_id: null, compra_id: c.id, chave: nota.chave, emitente: nota.nome_emitente, emissao: nota.emissao, total: nota.valor_pago ?? nota.valor_total, linhas, passados: [] };
    guardarRascunho();
    ir("#nota");
  } catch (e) {
    app.innerHTML = `${topo({ voltar: "#escanear", titulo: "NOTA" })}<div class="vazio"><strong>Não consegui ler a nota</strong>${esc(e.message)}
      <a class="pilula" href="#escanear/${compraId}">Tentar de novo</a><button class="pilula" data-acao="pagarSemNota" data-compra="${compraId}">Digitar o total</button></div>`;
  }
}
/** Abre uma nota já salva para revisar (trocar vínculos, tirar o que não é do plano). */
acoes.abrirNota = async (el) => {
  try {
    const n = await q(sb.from("croc_notas").select("*").eq("id", el.dataset.id).single());
    estado.rascunho = { nota_id: n.id, compra_id: n.compra_id, chave: n.chave, emitente: n.emitente, emissao: n.emissao, total: n.total, linhas: n.linhas ?? [], passados: [] };
    guardarRascunho();
    ir("#nota");
  } catch (e) { avisar(e.message, true); }
};

// ------------------------------------------------------------------ REVISAR NOTA
function telaNota() {
  const r = estado.rascunho;
  if (!r) return ir("#escanear");
  const c = compraPorId(r.compra_id);
  const itemNome = (id) => c.itens.find((i) => i.id === id)?.nome ?? "item que saiu da lista";
  const pendentes = r.linhas.filter((l) => !l.item_id && !l.chave && !l.removido).length;
  const cmp = L.compararNota(c.itens, r.linhas);
  const data = r.emissao ? L.dataCurta(r.emissao.slice(0, 10)) : "";
  const outras = notasDaCompra(c.id, r.nota_id);
  const linhaHtml = (l, i) => {
    let info;
    if (l.removido) info = `<span class="etiqueta">NÃO É DO PLANO</span>`;
    else if (l.item_id) info = `<span class="pequeno">= ${esc(itemNome(l.item_id))}${l.origem === "aprendido" ? ` <span class="mute">· aprendido</span>` : l.manual ? ` <span class="mute">· escolhido por vocês</span>` : ""}</span>`;
    else {
      const sug = L.sugerirItens(l.descricao, c.itens, 2);
      info = `<span style="display:flex;flex-direction:column;gap:6px">${l.chave ? `<span class="pequeno">Do plano, mas de outra compra</span>` : `<span class="etiqueta alerta" style="align-self:flex-start">NÃO IDENTIFICADO</span>`}
        ${sug.length ? `<span class="pilulas" style="gap:6px">${sug.map((s) => `<button class="pilula" style="min-height:36px;padding:0 12px;font-size:13px" data-acao="ligarA" data-i="${i}" data-id="${s.item.id}">${esc(s.item.nome)}? <span class="mono mute" style="font-size:10px">${s.nivel.toUpperCase()}</span></button>`).join("")}</span>` : ""}</span>`;
    }
    return `<div class="linha" style="align-items:flex-start;${l.removido ? "opacity:.6" : ""}">
      <span class="cresce" style="gap:4px"><span class="mono" style="font-size:12px;${l.removido ? "text-decoration:line-through" : ""}">${esc(l.descricao)}</span>${info}
        <button class="link-mono" style="padding:2px 0 0;font-size:11px" data-acao="trocarVinculo" data-i="${i}">${l.item_id || l.removido ? "TROCAR" : "ESCOLHER ITEM"}</button></span>
      <span class="valor" style="${l.removido ? "text-decoration:line-through" : "color:var(--fg)"}">${R(l.valor)}</span>
    </div>`;
  };
  app.innerHTML = `${topo({ voltar: r.nota_id ? `#compras/${indiceCompra(c)}` : "#escanear", titulo: `NOTA ${data ? `· ${data} ` : ""}· ${r.linhas.length} ITENS` })}<div class="conteudo">
    <div class="cabeca"><h1 class="h1">${r.nota_id ? "Revisar nota salva" : "Confira o que é do plano"}</h1>
      <p class="lead">${esc(r.emitente ?? "")}${r.emitente ? ". " : ""}Ligue cada linha ao item certo da lista. O que não é do plano não conta no orçamento. O app aprende com as correções.</p>
      <button class="pilula" data-acao="trocarCompraNota" style="justify-content:space-between"><span><span class="rotulo">COMPARAR COM </span>${esc(nomeCompra(c))} · ${L.dataCurta(c.data)}</span><span class="mono pequeno">Trocar</span></button>
      ${outras.length ? `<p class="pequeno">Esta compra tem mais ${pl(outras.length, "nota", "notas")}: ${esc(outras.map((n) => n.emitente ?? "mercado").join(", "))}. O comparativo junta todas.</p>` : ""}</div>
    ${pendentes ? `<div class="papel quadrado"><span style="font-size:15px"><b style="font-weight:600">${pl(pendentes, "linha não foi identificada", "linhas não foram identificadas")}.</b> Escolha o item certo ou marque como fora do plano.</span>
      <button class="botao escuro" style="align-self:flex-start;min-height:44px" data-acao="removerForaPlano">Marcar ${pendentes === 1 ? "como fora" : `as ${pendentes} como fora`} do plano</button></div>` : ""}
    <section class="lista">${r.linhas.map(linhaHtml).join("")}</section>
    ${r.nota_id ? `<button class="link-mono" data-acao="apagarNota">APAGAR ESTA NOTA</button>` : ""}
  </div>
  <div class="rodape-fixo">
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <span style="display:flex;flex-direction:column;gap:4px"><span class="rotulo">CONTA NO PLANO</span><span class="numero m vermelho">${R(cmp.contaNoPlano).replace("R$ ", "R$")}</span></span>
      <span style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><span class="rotulo">FORA DO PLANO</span><span class="mono pequeno">${R(cmp.removidoTotal)}</span></span>
    </div>
    <a class="botao" href="#comparar">Comparar com a lista ↗</a></div>`;
}
function mudarLinha(i, muda) {
  Object.assign(estado.rascunho.linhas[i], muda, { manual: true, origem: null });
  guardarRascunho(); fecharFolha(); desenhar();
}
acoes.removerForaPlano = () => {
  estado.rascunho.linhas.forEach((l) => { if (!l.item_id && !l.chave && !l.removido) Object.assign(l, { removido: true, manual: true }); });
  guardarRascunho(); desenhar();
};
acoes.trocarVinculo = (el) => {
  const r = estado.rascunho, c = compraPorId(r.compra_id), i = Number(el.dataset.i), l = r.linhas[i];
  const sug = L.sugerirItens(l.descricao, c.itens, 3);
  const idsSug = new Set(sug.map((s) => s.item.id));
  const botaoItem = (it, extra = "") => `<button class="linha" data-acao="ligarA" data-i="${i}" data-id="${it.id}"><span class="cresce"><span>${esc(it.nome)}${it.id === l.item_id ? ` <span class="etiqueta">ATUAL</span>` : ""}</span><span class="pequeno">${esc(L.qtdTexto(it.qtd, it.unidade))} · ${R(L.valorItem(it))}${extra}</span></span></button>`;
  abrirFolha(`<h2 class="h2">Qual item da lista é este?</h2><p class="mono pequeno">${esc(l.descricao)} · ${R(l.valor)}</p>
    ${sug.length ? `<div><span class="rotulo">MAIS PARECIDOS</span><div class="lista" style="margin-top:6px">${sug.map((s) => botaoItem(s.item, ` · semelhança ${s.nivel}`)).join("")}</div></div>` : ""}
    <button class="linha" data-acao="foraDoPlano" data-i="${i}"><span class="cresce"><span>Não é do plano</span><span class="pequeno">Não conta no orçamento (compra à parte)</span></span></button>
    <div><span class="rotulo">TODOS OS ITENS DA ${esc(nomeCompra(c).toUpperCase())}</span><div class="lista" style="margin-top:6px">${c.itens.filter((it) => !idsSug.has(it.id)).map((it) => botaoItem(it)).join("")}</div></div>
    <p class="pequeno">A escolha vale para as próximas notas: quando aparecer “${esc(L.chaveTexto(l.descricao))}”, o app já liga sozinho.</p>`);
};
acoes.ligarA = (el) => mudarLinha(Number(el.dataset.i), { item_id: el.dataset.id, removido: false });
acoes.foraDoPlano = (el) => mudarLinha(Number(el.dataset.i), { item_id: null, removido: true });
acoes.trocarCompraNota = () => {
  abrirFolha(`<h2 class="h2">Comparar com qual compra?</h2><div class="lista">${estado.compras.map((c) => `<button class="linha" data-acao="usarCompraNota" data-id="${c.id}">
    <span class="cresce"><span>${esc(nomeCompra(c))}</span><span class="pequeno">${L.dataCurta(c.data)}${notasDaCompra(c.id).length ? ` · ${pl(notasDaCompra(c.id).length, "nota", "notas")}` : ""}</span></span></button>`).join("")}</div>`);
};
acoes.usarCompraNota = (el) => {
  const r = estado.rascunho, c = compraPorId(el.dataset.id);
  r.compra_id = c.id;
  // as escolhas manuais de "fora do plano" ficam; os vínculos são refeitos com os itens da nova compra
  r.linhas = L.casarNota(c.itens, r.linhas.map(({ descricao, valor, qtd, un, removido, manual }) => ({ descricao, valor, qtd, un, removido: manual ? removido : false })), estado.aprendidos);
  guardarRascunho(); fecharFolha(); desenhar();
};
acoes.apagarNota = async () => {
  const r = estado.rascunho;
  if (!confirm("Apagar esta nota? O valor pago da compra é recalculado.")) return;
  try {
    await q(sb.from("croc_notas").delete().eq("id", r.nota_id));
    estado.notas = estado.notas.filter((n) => n.id !== r.nota_id);
    await recalcularPago(r.compra_id);
    estado.rascunho = null; guardarRascunho();
    avisar("Nota apagada");
    ir(`#compras/${indiceCompra(compraPorId(r.compra_id))}`);
  } catch (e) { avisar(e.message, true); }
};
/** Valor pago da compra = soma do que cada nota dela conta no plano (sem notas, volta a ficar em aberto). */
async function recalcularPago(compraId) {
  const c = compraPorId(compraId);
  const ns = notasDaCompra(compraId);
  const pago = ns.length ? L.arred2(ns.reduce((s, n) => s + Number(n.conta_no_plano), 0)) : null;
  await q(sb.from("croc_compras").update({ pago, feita_em: pago == null ? null : new Date().toISOString() }).eq("id", compraId));
  c.pago = pago; c.notas = ns.length;
}

// ------------------------------------------------------------------ COMPARATIVO (junta todas as notas da compra)
function telaComparar() {
  const r = estado.rascunho;
  if (!r) return ir("#escanear");
  const c = compraPorId(r.compra_id);
  const outras = notasDaCompra(c.id, r.nota_id);
  const linhasOutras = outras.flatMap((n) => (n.linhas ?? []).map((l) => ({ ...l, de_outra: true })));
  const cmp = L.compararNota(c.itens, [...linhasOutras, ...r.linhas]);
  const desta = L.compararNota(c.itens, r.linhas);
  const proxima = c.tipo === "semana" && c.semana < 4 ? estado.compras.find((x) => x.tipo === "semana" && x.semana === c.semana + 1) : null;
  const pagoOutras = outras.reduce((s, n) => s + Number(n.conta_no_plano), 0);
  const antes = resumo();
  const depois = L.resumoOrcamento(estado.compras.map((x) => (x.id === c.id ? { ...x, pago: L.arred2(pagoOutras + desta.contaNoPlano) } : x)), Number(estado.plano.orcamento));
  const max = Math.max(0.01, ...cmp.comprados.map((x) => Math.abs(x.diferenca)));
  const congel = c.tipo === "semana" ? L.congeladorDaSemana(c.semana - 1, c.itens, planoParaLogica()) : null;
  const subiu = cmp.comprados.filter((x) => x.diferenca > 0.5).slice(0, 2).map((x) => x.nome.toLowerCase());
  const nNotas = outras.length + 1;
  app.innerHTML = `${topo({ voltar: "#nota", titulo: `${esc(nomeCompra(c).toUpperCase())} · PLANEJADO X ${nNotas > 1 ? `${nNotas} NOTAS` : "NOTA"}` })}<div class="conteudo">
    <section class="cabeca"><div class="eyebrow">${cmp.comprados.length} DE ${c.itens.length} ITENS COMPRADOS${nNotas > 1 ? ` · ${nNotas} NOTAS` : ""}</div>
      <span class="numero g ${cmp.diferenca > 0 ? "vermelho" : ""}">${cmp.diferenca > 0 ? "+" : cmp.diferenca < 0 ? "−" : ""}${R(Math.abs(cmp.diferenca)).replace("R$ ", "R$")}</span>
      <p class="lead">${cmp.diferenca > 0 ? "acima" : cmp.diferenca < 0 ? "abaixo" : "igual ao"} do planejado para o que você comprou${cmp.planejadoComprado ? ` (${cmp.diferenca >= 0 ? "+" : "−"}${Math.abs((cmp.diferenca / cmp.planejadoComprado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}${nNotas > 1 ? ", somando todas as notas desta compra" : ""}</p>
      <div class="grade"><div><span class="rotulo">PLANEJADO</span><span class="mono" style="font-size:17px">${R(cmp.planejadoComprado)}</span></div><div><span class="rotulo">${nNotas > 1 ? "NAS NOTAS" : "NA NOTA"}</span><span class="mono" style="font-size:17px">${R(cmp.pagoComprado)}</span></div></div>
    </section>
    ${cmp.faltou.length ? `<section class="contorno alerta"><span class="rotulo alerta">FALTOU ${nNotas > 1 ? "NAS NOTAS" : "NA NOTA"} · ${cmp.faltou.length}</span>
      ${cmp.faltou.map((f) => { const passado = r.passados.includes(f.id); return `<div style="display:flex;gap:12px;align-items:center"><span style="flex:1">${esc(f.nome)} · <span class="mono pequeno">${R(f.planejado)}</span></span>
        ${proxima ? (passado ? `<span class="etiqueta">NA SEM. ${proxima.semana} ✓</span>` : `<button class="pilula cheia" data-acao="passarItem" data-id="${f.id}" data-para="${proxima.id}">Passar p/ sem. ${proxima.semana}</button>`) : ""}</div>`; }).join("")}
      <p class="pequeno">Ainda vai escanear outra nota desta compra? Salve esta e adicione a próxima: os itens dela saem daqui.</p></section>` : ""}
    ${cmp.comprados.length ? `<section style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="h2">Item a item</h2><span class="rotulo">− BARATO · CARO +</span></div>
      <div class="lista">${cmp.comprados.map((x) => { const w = Math.max(4, (Math.abs(x.diferenca) / max) * 100); const sobe = x.diferenca > 0; return `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:10px"><span style="font-size:15px">${esc(x.nome)}</span><span class="mono" style="font-size:13px;color:${sobe ? "var(--signal-2)" : "var(--fg-dim)"}">${sobe ? "+" : x.diferenca < 0 ? "−" : ""}${R(Math.abs(x.diferenca))}</span></div>
        <div style="display:flex;align-items:center;gap:10px"><div class="diverge" aria-hidden="true"><div>${!sobe ? `<i style="width:${w}%;background:var(--fg-dim)"></i>` : ""}</div><span class="meio"></span><div>${sobe ? `<i style="width:${w}%;background:var(--signal)"></i>` : ""}</div></div>
        <span class="mono" style="font-size:11px;color:var(--fg-mute);white-space:nowrap">${R(x.planejado)} → ${R(x.pago)}</span></div></div>`; }).join("")}</div></section>` : ""}
    ${cmp.extras.length ? `<section class="caixa"><span class="rotulo">CONTAM NO PLANO SEM PAR NA LISTA · ${R(cmp.extrasTotal)}</span><ul class="simples">${cmp.extras.map((l) => `<li>${esc(l.descricao)} · ${R(l.valor)}</li>`).join("")}</ul>
      <a class="link-mono" href="#nota">LIGAR A UM ITEM OU TIRAR DO PLANO</a></section>` : ""}
    <section class="grade escura">
      <div><span class="rotulo">FORA DO PLANO</span><span class="mono riscado" style="font-size:15px">${R(cmp.removidoTotal)}</span><span class="pequeno">${pl(cmp.removidos.length, "item", "itens")}</span></div>
      ${congel != null ? `<div><span class="rotulo">CONGELADOR</span><span class="mono" style="font-size:15px">${congel}/${estado.config.congelador} espaços</span><span class="pequeno">depois do preparo de domingo</span></div>`
        : `<div><span class="rotulo">ESTA NOTA</span><span class="mono" style="font-size:15px">${R(desta.contaNoPlano)}</span><span class="pequeno">conta no plano</span></div>`}
    </section>
    <section class="papel"><span class="rotulo">FECHAMENTO PREVISTO DO MÊS</span>
      <span class="numero" style="font-size:40px">${R(depois.previsto).replace("R$ ", "R$")}</span>
      <p style="font-size:15px">${depois.dentro ? `Ainda dentro dos ${R(estado.plano.orcamento)}.` : `<b style="font-weight:600">Passa dos ${R(estado.plano.orcamento)}.</b>`} A sobra ${r.nota_id ? "fica em" : `foi de <b style="font-weight:600">${R(antes.sobra)}</b> para`} <b style="font-weight:600" class="vermelho">${R(depois.sobra)}</b>.</p>
      ${subiu.length ? `<p class="pequeno">${esc(maiuscula(subiu.join(" e ")))} ${subiu.length > 1 ? "puxaram" : "puxou"} a alta. Vale comparar marcas e o preço por quilo na próxima.</p>` : ""}
    </section>
  </div>
  <div class="rodape-fixo"><button class="botao" data-acao="salvarNota">${r.nota_id ? "Salvar revisão" : `Salvar nota da ${esc(nomeCompra(c).toLowerCase())}`}</button></div>`;
}
acoes.passarItem = async (el) => {
  const [, it] = itemPorId(el.dataset.id);
  const para = compraPorId(el.dataset.para);
  try {
    const novo = await q(sb.from("croc_itens").insert({ compra_id: para.id, chave: it.chave, nome: it.nome, qtd: it.qtd, unidade: it.unidade, preco: it.preco, local: it.local, coringa: it.coringa, congela: it.congela, ordem: it.ordem }).select().single());
    if (!para.itens.some((x) => x.id === novo.id)) para.itens.push(novo);
    estado.rascunho.passados.push(it.id);
    guardarRascunho(); desenhar(); avisar(`${it.nome} vai para a semana ${para.semana}`);
  } catch (e) { avisar(e.message, true); }
};
/** Grava o que a casa corrigiu ou confirmou à mão, para as próximas notas. */
async function aprender(c, linhas) {
  const novos = new Map();
  for (const l of linhas.filter((x) => x.manual)) {
    const texto = L.chaveTexto(l.descricao);
    if (!texto) continue;
    if (l.removido) novos.set(texto, "fora");
    else if (l.item_id) { const it = c.itens.find((i) => i.id === l.item_id); if (it) novos.set(texto, L.destinoDoItem(it)); }
  }
  if (!novos.size) return;
  const linhasAp = [...novos].map(([texto, destino]) => ({ texto, destino, criado_por: estado.email, atualizado_em: new Date().toISOString() }));
  await q(sb.from("croc_aprendizado").upsert(linhasAp, { onConflict: "casa_id,texto" }));
  for (const { texto, destino } of linhasAp) estado.aprendidos[texto] = destino;
}
acoes.salvarNota = async (el) => {
  const r = estado.rascunho, c = compraPorId(r.compra_id);
  const desta = L.compararNota(c.itens, r.linhas);
  el.disabled = true;
  try {
    const linhas = r.linhas.map(({ descricao, valor, qtd, un, item_id, chave, removido, manual, origem }) => ({ descricao, valor, qtd, un, item_id: item_id ?? null, chave: chave ?? null, removido: !!removido, manual: !!manual, origem: origem ?? null }));
    const campos = { compra_id: c.id, linhas, conta_no_plano: desta.contaNoPlano };
    const sel = "id, compra_id, conta_no_plano, total, emitente, criado_em, criado_por, linhas";
    let nota;
    if (r.nota_id) {
      nota = await q(sb.from("croc_notas").update(campos).eq("id", r.nota_id).select(sel).single());
      const antiga = estado.notas.find((n) => n.id === r.nota_id);
      estado.notas = estado.notas.filter((n) => n.id !== r.nota_id);
      if (antiga && antiga.compra_id !== c.id) await recalcularPago(antiga.compra_id);
    } else {
      nota = await q(sb.from("croc_notas").insert({ ...campos, chave: r.chave, emitente: r.emitente, emissao: r.emissao, total: r.total, criado_por: estado.email }).select(sel).single());
    }
    estado.notas.push(nota);
    await recalcularPago(c.id);
    const comprados = [...new Set(r.linhas.filter((l) => l.item_id && !l.removido).map((l) => l.item_id))];
    if (comprados.length) await q(sb.from("croc_itens").update({ marcado: true, marcado_por: estado.email, marcado_em: new Date().toISOString() }).in("id", comprados));
    c.itens.forEach((i) => { if (comprados.includes(i.id)) i.marcado = true; });
    await aprender(c, r.linhas).catch(() => {});
    const novo = !r.nota_id;
    estado.rascunho = null; guardarRascunho();
    if (novo) fn("/avisar", { tipo: "compra", compra_id: c.id }).catch(() => {});
    avisar(novo ? `Nota salva na ${nomeCompra(c).toLowerCase()}` : "Revisão salva");
    ir(`#compras/${indiceCompra(c)}`);
  } catch (e) { el.disabled = false; avisar(e.message, true); }
};

// ------------------------------------------------------------------ NOVO PLANO
async function telaNovoPlano() {
  const h = hoje();
  const cfg = estado.config;
  const fimAnterior = estado.plano ? L.addDias(estado.plano.inicio, 28) : null;
  const opcoes = [];
  if (fimAnterior && fimAnterior > h) opcoes.push(fimAnterior);
  const primeiro = L.diaSemana(h) === 0 ? h : L.proximoDomingo(h);
  for (let i = 0; i < 3; i++) { const d = L.addDias(primeiro, i * 7); if (!opcoes.includes(d)) opcoes.push(d); }
  if (L.diaSemana(h) !== 0 && L.diaSemana(h) <= 2) opcoes.unshift(L.domingoDe(h));
  const padrao = opcoes.includes(fimAnterior) ? fimAnterior : primeiro;
  const voltar = estado.plano ? "#hoje" : null;
  app.innerHTML = `${voltar ? topo({ voltar, titulo: "NOVO MÊS" }) : `<header class="topo"><span class="logo"><img src="icons/crocante-192.png" alt=""><span>CROCANTE<b>*</b></span></span>${avatarHtml()}</header>`}
  <div class="conteudo">
    <div class="cabeca"><div class="eyebrow">${estado.plano ? "PRÓXIMO MÊS" : "BEM-VINDO"}</div>
      <h1 class="h1">Monte o mês de <span class="destaque">${esc(estado.casa?.nome ?? "vocês")}</span></h1>
      <p class="lead">Quatro semanas de cardápio, a compra do mês e uma compra por semana, no sábado antes do preparo de domingo. Tudo fica dentro da casa: quem você convidar vê e edita junto.</p></div>
    <div class="campos-2">
      <label class="campo"><span class="rotulo">ORÇAMENTO DO MÊS</span><input name="orcamento" inputmode="decimal" value="${esc(String(cfg.orcamento).replace(".", ","))}"></label>
      <label class="campo"><span class="rotulo">PESSOAS</span><input name="pessoas" inputmode="numeric" value="${cfg.pessoas}"></label>
    </div>
    <label class="campo"><span class="rotulo">ESPAÇOS NO CONGELADOR</span><input name="congelador" inputmode="numeric" value="${cfg.congelador}">
      <span class="pequeno">Saquinhos ou caixas que cabem de uma vez. Usado para dividir as compras por semana sem lotar o freezer.</span></label>
    <fieldset class="campo" style="border:0;padding:0;margin:0"><legend class="rotulo" style="margin-bottom:8px">PRIMEIRO DOMINGO (DIA DO PREPARO)</legend>
      <div class="pilulas">${opcoes.map((d) => `<label class="pilula" style="cursor:pointer"><input type="radio" name="inicio" value="${d}" ${d === padrao ? "checked" : ""} style="accent-color:var(--signal)"> ${L.dataCurta(d)}${d < h ? " (já começou)" : ""}</label>`).join("")}</div>
      <span class="pequeno">A compra do mês e a da semana 1 ficam para o sábado anterior.</span></fieldset>
    <a class="contorno" href="#casa" style="text-decoration:none"><span class="rotulo">VAI DIVIDIR COM ALGUÉM?</span><span>Convide quem mora com você antes ou depois de montar o mês ↗</span></a>
  </div>
  <div class="rodape-fixo"><button class="botao" data-acao="criarPlano">Criar cardápio e compras</button></div>`;
}
acoes.criarPlano = async (el) => {
  const orcamento = numero($("[name=orcamento]").value), pessoas = Math.round(numero($("[name=pessoas]").value)), congelador = Math.round(numero($("[name=congelador]").value));
  const inicio = $("[name=inicio]:checked")?.value;
  if (!(orcamento > 0)) return avisar("Digite o orçamento do mês.", true);
  if (!(pessoas >= 1 && pessoas <= 12)) return avisar("Pessoas: de 1 a 12.", true);
  if (!(congelador >= 2 && congelador <= 60)) return avisar("Congelador: de 2 a 60 espaços.", true);
  el.disabled = true; el.textContent = "Montando o mês…";
  try {
    estado.config = await q(sb.from("croc_config").update({ orcamento, pessoas, congelador, atualizado_em: new Date().toISOString() }).eq("casa_id", estado.config.casa_id).select().single());
    await criarPlano(inicio);
    await carregarTudo();
    avisar("Mês montado");
    ir("#hoje");
  } catch (e) { el.disabled = false; el.textContent = "Criar cardápio e compras"; avisar(e.message, true); }
};

// ------------------------------------------------------------------ CASA
async function telaCasa() {
  const v = vezDesenho;
  const [moradores, casas] = await Promise.all([q(sb.rpc("croc_moradores")), q(sb.rpc("minhas_casas"))]);
  if (v !== vezDesenho) return;
  const tema = (() => { try { return localStorage.getItem("tema") || "auto"; } catch { return "auto"; } })();
  const cfg = estado.config;
  app.innerHTML = `${topo({ voltar: "#hoje", titulo: "CASA" })}<div class="conteudo">
    <div class="cabeca"><h1 class="h1">${esc(estado.casa.nome)}</h1>
      <p class="pequeno">Quem está aqui vê e edita o mesmo cardápio, as compras, o orçamento e as notas.</p>
      <button class="link-mono" data-acao="renomearCasa">RENOMEAR A CASA</button></div>
    <section><div class="secao-titulo"><h2 class="h3">Moradores</h2><span class="mono pequeno">${moradores.filter((m) => m.aceito).length}${moradores.some((m) => !m.aceito) ? ` · ${moradores.filter((m) => !m.aceito).length} pendente(s)` : ""}</span></div>
      <div class="lista">${moradores.map((m) => `<div class="linha">
        ${m.aceito ? `<span class="avatar p">${m.foto ? `<img src="${esc(m.foto)}" alt="" referrerpolicy="no-referrer">` : esc(iniciais(m.nome, m.email))}</span>` : `<span class="avatar p pendente" aria-hidden="true">?</span>`}
        <span class="cresce"><span>${esc(m.aceito ? m.nome : m.email)}${m.email === estado.email ? ` <span class="mute">(você)</span>` : ""}</span>
          <span class="pequeno" style="${m.aceito ? "" : "color:var(--signal-2)"}">${m.aceito ? esc(m.email) : "convite enviado · entra quando abrir o app com essa conta Google"}</span></span>
        ${m.email !== estado.email ? `<button class="redondo" data-acao="removerMorador" data-email="${esc(m.email)}" aria-label="${m.aceito ? "Remover" : "Cancelar convite de"} ${esc(m.email)}">${ICONE_X}</button>` : ""}
      </div>`).join("")}</div></section>
    <section class="papel"><span class="rotulo">CONVIDAR PARA A CASA</span>
      <label class="campo"><span class="pequeno">E-mail da conta Google da pessoa</span><input type="email" name="convite" placeholder="nome@gmail.com" autocomplete="email"></label>
      <button class="botao escuro" data-acao="convidar">Convidar</button>
      <p class="pequeno">Depois do convite, mande o link do app para a pessoa. Ela entra com o Google usando esse e-mail e cai direto nesta casa. A casa também vale no Finanças da Casa.</p></section>
    <section><div class="secao-titulo"><h2 class="h3">Plano da casa</h2></div>
      <div class="campos-2" style="margin-top:12px">
        <label class="campo"><span class="rotulo">ORÇAMENTO</span><input name="orcamento" inputmode="decimal" value="${esc(String(cfg.orcamento).replace(".", ","))}"></label>
        <label class="campo"><span class="rotulo">PESSOAS</span><input name="pessoas" inputmode="numeric" value="${cfg.pessoas}"></label></div>
      <label class="campo" style="margin-top:12px"><span class="rotulo">ESPAÇOS NO CONGELADOR</span><input name="congelador" inputmode="numeric" value="${cfg.congelador}"></label>
      <p class="pequeno" style="margin-top:8px">O orçamento vale já para este mês. Pessoas muda as quantidades a partir do próximo mês.</p>
      <div class="pilulas" style="margin-top:12px"><button class="pilula cheia" data-acao="salvarConfig">Salvar</button>${estado.plano ? `<a class="pilula" href="#novo-plano">Montar o próximo mês</a>` : ""}</div></section>
    <section><div class="secao-titulo"><h2 class="h3">Aparência neste aparelho</h2></div>
      <div class="pilulas" style="margin-top:12px">${[["auto", "Do aparelho"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([k, n]) => `<button class="pilula" aria-pressed="${tema === k}" data-acao="tema" data-tema="${k}">${n}</button>`).join("")}</div></section>
    ${casas.length > 1 ? `<section><div class="secao-titulo"><h2 class="h3">Suas casas</h2></div><div class="lista">${casas.map((c) => `<button class="linha" data-acao="trocarCasa" data-id="${c.id}" ${c.id === estado.casa.casa_id ? "disabled" : ""}>
      <span class="ponto ${c.id === estado.casa.casa_id ? "" : "vazio-p"}"></span><span class="cresce">${esc(c.nome)}</span><span class="rotulo">${c.id === estado.casa.casa_id ? "ATUAL" : "ABRIR"}</span></button>`).join("")}</div></section>` : ""}
    <div class="pilulas"><a class="pilula" href="#avisos">Avisos</a>${appInstalado() ? "" : `<button class="pilula" data-acao="instalarApp">Instalar o app</button>`}<button class="pilula" data-acao="compartilharApp">Mandar o link do app</button></div>
    <button class="link-mono" data-acao="sair">SAIR DA CONTA</button>
    <p class="pequeno mute">Crocante ${VERSAO} · <a href="privacidade.html">Privacidade</a></p>
  </div>`;
}
acoes.renomearCasa = () => {
  abrirFolha(`<h2 class="h2">Nome da casa</h2><label class="campo"><span class="rotulo">NOME</span><input name="nome" value="${esc(estado.casa.nome)}"></label>
    <button class="botao" data-acao="salvarNomeCasa">Salvar</button>`);
};
acoes.salvarNomeCasa = async () => {
  const nome = $("[name=nome]", folha).value.trim();
  if (!nome) return avisar("Dê um nome à casa.", true);
  try { await q(sb.from("casas").update({ nome }).eq("id", estado.casa.casa_id)); estado.casa.nome = nome; fecharFolha(); desenhar(); }
  catch (e) { avisar(e.message, true); }
};
acoes.convidar = async () => {
  const email = $("[name=convite]").value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return avisar("Digite um e-mail válido.", true);
  try {
    await q(sb.from("membros").insert({ email }));
    avisar("Convite criado. Agora mande o link do app.");
    desenhar();
    compartilhar(`Te chamei para a casa "${estado.casa.nome}" no Crocante, nosso cardápio e compras da semana. Entre com o Google usando ${email}:`);
  } catch (e) { avisar(e.message, true); }
};
acoes.removerMorador = async (el) => {
  if (!confirm(`Tirar ${el.dataset.email} da casa?`)) return;
  try { await q(sb.from("membros").delete().eq("email", el.dataset.email)); desenhar(); }
  catch (e) { avisar(e.message, true); }
};
acoes.salvarConfig = async () => {
  const orcamento = numero($("[name=orcamento]").value), pessoas = Math.round(numero($("[name=pessoas]").value)), congelador = Math.round(numero($("[name=congelador]").value));
  if (!(orcamento > 0) || !(pessoas >= 1 && pessoas <= 12) || !(congelador >= 2 && congelador <= 60)) return avisar("Confira os valores (pessoas de 1 a 12, congelador de 2 a 60).", true);
  try {
    estado.config = await q(sb.from("croc_config").update({ orcamento, pessoas, congelador, atualizado_em: new Date().toISOString() }).eq("casa_id", estado.config.casa_id).select().single());
    if (estado.plano && Number(estado.plano.orcamento) !== orcamento) {
      await q(sb.from("croc_planos").update({ orcamento }).eq("id", estado.plano.id));
      estado.plano.orcamento = orcamento;
    }
    avisar("Salvo");
  } catch (e) { avisar(e.message, true); }
};
acoes.tema = (el) => {
  const t = el.dataset.tema;
  try { t === "auto" ? localStorage.removeItem("tema") : localStorage.setItem("tema", t); } catch { /* sem armazenamento */ }
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t === "claro" ? "light" : "dark";
  const cor = t === "claro" ? "#F4F3EF" : "#0B0B0C";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = t === "auto" ? (m.media.includes("light") ? "#F4F3EF" : "#0B0B0C") : cor; });
  desenhar();
};
acoes.trocarCasa = async (el) => {
  try { estado.casa = { ...estado.casa, ...(await q(sb.rpc("trocar_casa", { p_casa: Number(el.dataset.id) }))) }; if (canal) { sb.removeChannel(canal); canal = null; } await carregarTudo(); ir("#hoje"); avisar(`Casa aberta: ${estado.casa.nome}`); }
  catch (e) { avisar(e.message, true); }
};
function compartilhar(texto) {
  const url = location.origin + location.pathname;
  if (navigator.share) navigator.share({ title: "Crocante", text: texto, url }).catch(() => {});
  else navigator.clipboard?.writeText(`${texto} ${url}`).then(() => avisar("Link copiado"), () => avisar(url));
}
acoes.compartilharApp = () => compartilhar("Nosso cardápio, compras da semana e orçamento da casa:");
acoes.sair = async () => {
  try { const sub = await assinaturaPush(); if (sub) await sb.from("croc_push").delete().eq("endpoint_hash", await hashEndpoint(sub.endpoint)); } catch { /* segue */ }
  await sb.auth.signOut().catch(() => {});
  location.hash = ""; location.reload();
};

// ------------------------------------------------------------------ AVISOS (Web Push)
const notifSuportada = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function registroSW() { return Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 4000))]); }
async function assinaturaPush() { if (!notifSuportada()) return null; const reg = await registroSW(); return reg ? reg.pushManager.getSubscription() : null; }
function bytesDeB64u(s) { const p = "=".repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + p), (c) => c.charCodeAt(0)); }
async function hashEndpoint(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const PREFS_PADRAO = { hora: 20, desc: true, merc: true, prep: true, nota: true, jantar: false, orc: true, casa: true };
const GRUPOS_AVISO = [
  ["Na noite anterior", [["desc", "Descongelar", "O que passar do freezer para a geladeira, sempre que precisar"], ["merc", "Dia de mercado", "Sexta · itens, valor e espaço no congelador"], ["prep", "Preparo de domingo", "Sábado · tempo e o que separar"]]],
  ["No dia", [["nota", "Escanear a nota", "Sábado às 14h, se a compra ainda não tiver nota"], ["jantar", "O que tem para jantar", "18h, com o tempo de preparo"]]],
  ["Casa e dinheiro", [["orc", "Orçamento em risco", "Quando a sobra prevista ficar negativa ou abaixo de R$ 30"], ["casa", "Atividade da casa", "Compra salva e morador novo"]]],
];
async function telaAvisos() {
  const v = vezDesenho;
  let sub = null, linha = null;
  if (notifSuportada()) {
    sub = await assinaturaPush().catch(() => null);
    if (sub) linha = (await q(sb.from("croc_push").select("prefs").eq("endpoint_hash", await hashEndpoint(sub.endpoint))))[0] ?? null;
  }
  if (v !== vezDesenho) return;
  const ligado = !!(sub && linha && Notification.permission === "granted");
  const p = { ...PREFS_PADRAO, ...(linha?.prefs ?? {}) };
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let aviso = "";
  if (!notifSuportada()) aviso = iOS && !instalado ? "No iPhone, os avisos só funcionam com o app instalado na tela de início: Compartilhar → Adicionar à Tela de Início. Depois abra por lá e volte aqui." : "Este navegador não permite notificações de apps da web.";
  else if (Notification.permission === "denied") aviso = "As notificações estão bloqueadas para este site. Toque no cadeado ao lado do endereço (ou em Configurações do site) → Notificações → Permitir, e volte aqui.";
  app.innerHTML = `${topo({ voltar: "#hoje", titulo: "AVISOS" })}<div class="conteudo">
    <div class="cabeca"><h1 class="h1">O que a gente te lembra</h1>
      <p class="lead">Os lembretes saem na noite anterior, às ${p.hora}h, com o que precisa sair do freezer e o que vem no dia seguinte.</p></div>
    ${aviso ? `<div class="contorno alerta pequeno">${esc(aviso)}</div>` : `
    <label class="interruptor"><span style="flex:1"><span style="font-weight:600">Avisos neste aparelho</span><br><span class="pequeno">${ligado ? "Ligados. Cada morador liga no próprio celular." : "Desligados: este aparelho não recebe lembretes."}</span></span>
      <input type="checkbox" role="switch" data-muda="ligarAvisos" ${ligado ? "checked" : ""}><i aria-hidden="true"></i></label>`}
    ${ligado ? `<div class="pilulas" role="group" aria-label="Horário dos lembretes da véspera" style="align-items:center"><span class="rotulo" style="margin-right:4px">VÉSPERA ÀS</span>
      ${[19, 20, 21].map((hh) => `<button class="pilula" aria-pressed="${p.hora === hh}" data-acao="horaAviso" data-hora="${hh}">${hh}h</button>`).join("")}</div>
    ${GRUPOS_AVISO.map(([g, itens]) => `<section><div class="secao-titulo"><h2 class="h3">${g}</h2></div>
      ${itens.map(([k, t, d]) => `<label class="interruptor"><span style="flex:1"><span>${t}</span><br><span class="pequeno mute">${d.replace("Sexta", "Véspera do mercado").replace("Sábado ·", "Véspera do domingo ·")}</span></span>
        <input type="checkbox" role="switch" data-muda="prefAviso" data-k="${k}" ${p[k] ? "checked" : ""}><i aria-hidden="true"></i></label>`).join("")}</section>`).join("")}
    <button class="pilula" data-acao="testarAviso" style="align-self:flex-start">Enviar aviso de teste</button>` : ""}
    <p class="pequeno">Por padrão, descongelar e mercado vão para todos os moradores que ligarem os avisos.</p>
  </div>`;
}
async function prefsAtuais() {
  const sub = await assinaturaPush();
  if (!sub) return null;
  const h = await hashEndpoint(sub.endpoint);
  const l = (await q(sb.from("croc_push").select("prefs").eq("endpoint_hash", h)))[0];
  return { h, prefs: { ...PREFS_PADRAO, ...(l?.prefs ?? {}) } };
}
mudancas.ligarAvisos = async (el) => {
  el.disabled = true;
  try {
    if (el.checked) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Sem permissão para notificar. Permita quando o navegador perguntar.");
      const { publica } = await fn("/chave");
      const reg = await registroSW();
      if (!reg) throw new Error("O app ainda está terminando de se instalar. Recarregue a página e tente de novo.");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeB64u(publica) });
      await q(sb.from("croc_push").upsert({ endpoint_hash: await hashEndpoint(sub.endpoint), assinatura: sub.toJSON(), prefs: PREFS_PADRAO }, { onConflict: "endpoint_hash" }));
      avisar("Avisos ligados neste aparelho");
    } else {
      const sub = await assinaturaPush();
      if (sub) { await sb.from("croc_push").delete().eq("endpoint_hash", await hashEndpoint(sub.endpoint)); await sub.unsubscribe().catch(() => {}); }
      avisar("Avisos desligados neste aparelho");
    }
  } catch (e) { avisar(e.message, true); }
  desenhar();
};
async function salvarPrefs(muda) {
  try {
    const a = await prefsAtuais();
    if (!a) return;
    await q(sb.from("croc_push").update({ prefs: { ...a.prefs, ...muda } }).eq("endpoint_hash", a.h));
    desenhar();
  } catch (e) { avisar(e.message, true); }
}
mudancas.prefAviso = (el) => salvarPrefs({ [el.dataset.k]: el.checked });
acoes.horaAviso = (el) => salvarPrefs({ hora: Number(el.dataset.hora) });
acoes.testarAviso = async (el) => {
  el.disabled = true;
  try { const sub = await assinaturaPush(); await fn("/testar", { endpoint_hash: await hashEndpoint(sub.endpoint) }); avisar("Aviso de teste enviado"); }
  catch (e) { avisar(e.message, true); }
  el.disabled = false;
};

// ------------------------------------------------------------------ INSTALAR O APP
// O Chrome avisa (beforeinstallprompt) quando o app pode ser instalado; guardamos o aviso para o botão.
let pedidoInstalar = null;
const ICONE_INSTALAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`;
const appInstalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pedidoInstalar = e;
  if (estado.email && estado.config && !appInstalado() && ["hoje", "casa"].includes(rotaAtual().nome) && folha.hidden) desenhar();
});
window.addEventListener("appinstalled", () => { pedidoInstalar = null; avisar("Crocante instalado"); if (estado.config) desenhar(); });
function cartaoInstalar() {
  if (appInstalado()) return "";
  try { if (localStorage.getItem("instalarDispensado") === "1") return ""; } catch { /* segue */ }
  return `<section class="contorno" id="cartaoInstalar" style="flex-direction:row;align-items:center;gap:14px">
    <img src="icons/crocante-192.png" alt="" width="48" height="48" style="border-radius:11px;flex:0 0 auto">
    <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">Instale o Crocante</span>
      <span class="pequeno">Abre em tela cheia, com ícone próprio, e recebe os lembretes.</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      <button class="pilula cheia" data-acao="instalarApp">Instalar</button>
      <button class="link-mono" style="padding:4px 0 0;font-size:10px;align-self:flex-end" data-acao="dispensarInstalar">AGORA NÃO</button></span>
  </section>`;
}
acoes.instalarApp = async () => {
  if (pedidoInstalar) {
    pedidoInstalar.prompt();
    const { outcome } = await pedidoInstalar.userChoice.catch(() => ({}));
    pedidoInstalar = null;
    if (outcome !== "accepted") avisar("Instalação cancelada. Dá para instalar depois pelo botão no topo.");
    return desenhar();
  }
  const passos = ehIOS()
    ? [["Abra no Safari", "No iPhone, só o Safari instala apps da web. Se estiver em outro navegador, copie o endereço e abra no Safari."],
       ["Toque em Compartilhar", "O quadrado com a seta para cima, na barra de baixo (ou de cima, no iPad)."],
       ["Adicionar à Tela de Início", "Role a lista e toque nessa opção. Depois em Adicionar."],
       ["Abra pelo ícone", "Os lembretes só funcionam com o app aberto pelo ícone da tela de início."]]
    : /android/i.test(navigator.userAgent)
      ? [["Abra o menu do Chrome", "Os três pontinhos ⋮ no canto de cima."], ["Instalar app", "Ou “Adicionar à tela inicial”. Confirme em Instalar."], ["Abra pelo ícone", "O Crocante abre em tela cheia, como um app."]]
      : [["Use o Chrome ou o Edge", "No computador, procure o ícone de instalar no fim da barra de endereço."], ["Ou pelo menu", "Menu ⋮ → Transmitir, salvar e compartilhar → Instalar página como app."]];
  abrirFolha(`<h2 class="h2">Instalar o Crocante</h2>
    <ol class="passos lista">${passos.map(([t, d], i) => `<li class="linha" style="align-items:flex-start"><span class="numero m vermelho" style="flex:0 0 30px">${i + 1}</span>
      <span class="cresce"><span style="font-weight:600">${esc(t)}</span><span class="pequeno">${esc(d)}</span></span></li>`).join("")}</ol>
    <button class="pilula" data-acao="fecharFolha">Entendi</button>`);
};
acoes.dispensarInstalar = () => { try { localStorage.setItem("instalarDispensado", "1"); } catch { /* segue */ } $("#cartaoInstalar")?.remove(); };

// ------------------------------------------------------------------ LOGIN
const LOGO_GOOGLE = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
function telaLogin(msg = "") {
  abas.hidden = true;
  document.body.classList.add("sem-abas");
  app.innerHTML = `<main class="login">
    <div style="display:flex;flex-direction:column;gap:26px">
      <img class="icone-app" src="icons/crocante-512.png" alt="Ícone do Crocante">
      <span class="numero" style="font-size:40px">CROCANTE<span class="vermelho">*</span></span>
      <h1 class="h1">Cardápio, mercado e orçamento da casa, <span class="destaque">a dois.</span></h1>
      <p class="lead" style="max-width:34ch">Um preparo no domingo, refeições de 15 minutos na semana e compras que cabem no congelador.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${msg ? `<div class="contorno alerta pequeno">${msg}</div>` : ""}
      <button class="botao cheio botao-google" type="button" data-acao="entrarGoogle">${LOGO_GOOGLE}Continuar com Google</button>
      <p class="pequeno" style="text-align:center">Sem senha nova. Usamos só seu nome, e-mail e foto da conta Google. Recebeu convite? Entre com o e-mail convidado.</p>
      ${appInstalado() ? "" : `<button class="link-mono" style="align-self:center" data-acao="instalarApp">INSTALAR O APP NO CELULAR</button>`}
    </div></main>`;
}
acoes.entrarGoogle = async (el) => {
  el.disabled = true;
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } },
  });
  if (error) { avisar(error.message, true); el.disabled = false; }
};
function sessaoPeloGoogle(session) {
  try {
    const p = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const amr = JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4))).amr ?? [];
    return amr.some((a) => a.method === "oauth");
  } catch { return true; }
}

// ------------------------------------------------------------------ início
async function iniciar() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let session = null;
  const semResposta = new Promise((ok) => setTimeout(() => ok({ data: { session: null } }), 8000));
  ({ data: { session } } = await Promise.race([sb.auth.getSession().catch(() => ({ data: { session: null } })), semResposta]));
  if (session && !sessaoPeloGoogle(session)) { await sb.auth.signOut().catch(() => {}); return telaLogin("O acesso é só pelo Google."); }
  if (!session) {
    const erroOAuth = new URLSearchParams(HASH_INICIAL.slice(1) || location.search.slice(1)).get("error_description");
    if (erroOAuth) { history.replaceState(null, "", location.pathname); return telaLogin(`Não foi possível entrar com o Google: ${esc(erroOAuth)}`); }
    if (!navigator.onLine) return telaLogin("Sem internet. Conecte-se para entrar.");
    return telaLogin();
  }
  if (/access_token|error/.test(location.hash)) history.replaceState(null, "", location.pathname + "#hoje");
  const u = session.user;
  estado.email = u.email?.toLowerCase();
  estado.nome = u.user_metadata?.full_name ?? u.user_metadata?.name ?? "";
  estado.foto = u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null;
  try {
    estado.casa = await q(sb.rpc("entrar"));
    await carregarTudo();
    recuperarRascunho();
  } catch (e) {
    app.innerHTML = `<div class="vazio" style="min-height:80dvh;justify-content:center"><strong>${navigator.onLine ? "Não foi possível abrir sua casa" : "Sem internet"}</strong>${esc(e.message)}
      <button class="pilula" data-acao="recarregar">Tentar de novo</button><button class="link-mono" data-acao="sair">SAIR</button></div>`;
    if (!navigator.onLine) window.addEventListener("online", () => location.reload(), { once: true });
    return;
  }
  if (estado.casa.convite_aceito) {
    setTimeout(() => avisar(`Você agora faz parte da casa "${estado.casa.nome}"`), 600);
    fn("/avisar", { tipo: "entrou" }).catch(() => {});
  }
  await desenhar();
}
iniciar();
