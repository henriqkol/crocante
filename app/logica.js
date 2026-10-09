// Lógica pura do Crocante (sem tela, sem banco). Usada pelo app, pela função do servidor e pelos testes.
import { CARDAPIO, PREPARO, PRATOS } from "./dados.js";
import { MES, SEMANA } from "./compras.js";

// ------------------------------------------------------------------ datas (sempre "AAAA-MM-DD", meio-dia UTC)
export const pad = (n) => String(n).padStart(2, "0");
export function addDias(dia, n) {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diaSemana = (dia) => new Date(dia + "T12:00:00Z").getUTCDay(); // 0 = domingo
export const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
/** Domingo da semana do dia (o próprio dia, se for domingo). */
export const domingoDe = (dia) => addDias(dia, -diaSemana(dia));
/** Próximo domingo depois do dia (nunca o próprio dia). */
export const proximoDomingo = (dia) => addDias(dia, 7 - diaSemana(dia));
/** Data de hoje no horário de Brasília. */
export function hojeBrasilia(agora = new Date()) {
  const d = new Date(agora.getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 10);
}
export const horaBrasilia = (agora = new Date()) => (agora.getUTCHours() + 21) % 24;

export const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
export const dataCurta = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ------------------------------------------------------------------ dinheiro e quantidades
export const arred2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function brl(v, casas = 2) {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
/** Quantidade para N pessoas: peso em passos de 50 g, o resto em unidades inteiras (arredonda para cima). */
export function escalar(q, un, pessoas = 2) {
  const fator = Math.max(1, Number(pessoas) || 2) / 2;
  const v = q * fator;
  if (!v) return 0;
  if (un === "kg") return Math.max(0.05, Math.round(v * 20) / 20);
  return Math.ceil(v - 1e-9);
}
export function qtdTexto(q, un) {
  const n = Number(q);
  if (un === "kg" && n < 1) return `${Math.round(n * 1000)} g`;
  return `${n % 1 ? n.toLocaleString("pt-BR") : n} ${un}`;
}
export const valorItem = (it) => arred2(Number(it.qtd) * Number(it.preco));
export const somaItens = (itens) => arred2(itens.reduce((s, it) => s + valorItem(it), 0));

// ------------------------------------------------------------------ plano do mês
/** Datas das compras: a do mês e a da semana 1 no sábado antes do primeiro domingo; as outras, a cada sábado. */
export const dataCompraSemana = (inicio, semana) => addDias(inicio, 7 * (semana - 1) - 1);

/**
 * Monta o plano de 4 semanas a partir de um domingo.
 * Retorna as 5 compras (mês + 4 semanas) com os itens e o cardápio (almoço e jantar de 28 dias).
 */
export function gerarPlano(inicio, pessoas = 2) {
  if (diaSemana(inicio) !== 0) throw new Error("O plano começa num domingo");
  const item = (t, qtd, ordem) => ({
    chave: t.chave, nome: t.nome, qtd, unidade: t.un, preco: t.preco, local: t.local,
    coringa: !!t.coringa, congela: !!t.congela, ordem,
  });
  const compras = [{
    tipo: "mes", semana: null, data: dataCompraSemana(inicio, 1),
    itens: MES.map((t, i) => item(t, escalar(t.qtd, t.un, pessoas), i)).filter((x) => x.qtd > 0),
  }];
  for (let s = 1; s <= 4; s++) {
    compras.push({
      tipo: "semana", semana: s, data: dataCompraSemana(inicio, s),
      itens: SEMANA.map((t, i) => item(t, escalar(t.q[s - 1], t.un, pessoas), i)).filter((x) => x.qtd > 0),
    });
  }
  const cardapio = [];
  CARDAPIO.forEach((semana, w) => semana.forEach(([almoco, jantar], d) => {
    const data = addDias(inicio, w * 7 + d);
    cardapio.push({ data, refeicao: "almoco", prato: almoco }, { data, refeicao: "jantar", prato: jantar });
  }));
  return { inicio, fim: addDias(inicio, 27), compras, cardapio };
}

/** Semana do plano em que cai o dia (0 a 3), ou null se estiver fora dos 28 dias. */
export function semanaDoDia(inicio, dia) {
  const d = diasEntre(inicio, dia);
  if (d < 0 || d > 27) return null;
  return Math.floor(d / 7);
}

/** Espaços ocupados no congelador na semana (0 a 3): bases do domingo + o que já vem congelado + bacon do mês. */
export function congeladorDaSemana(w, itensDaSemana) {
  const bases = PREPARO[w]?.frz?.length ?? 0;
  const congelados = (itensDaSemana ?? []).filter((it) => it.congela && Number(it.qtd) > 0).length;
  return bases + congelados + 1;
}

// ------------------------------------------------------------------ orçamento
/** Planejado de cada compra, o que já foi pago e o fechamento previsto (pago + o que falta pelo planejado). */
export function resumoOrcamento(compras, orcamento) {
  let planejado = 0, pago = 0, falta = 0;
  const linhas = compras.map((c) => {
    const p = somaItens(c.itens ?? []);
    planejado += p;
    const feita = c.pago != null;
    if (feita) pago += Number(c.pago); else falta += p;
    return { id: c.id, tipo: c.tipo, semana: c.semana, data: c.data, planejado: p, pago: feita ? Number(c.pago) : null, diferenca: feita ? arred2(Number(c.pago) - p) : null };
  });
  const previsto = arred2(pago + falta);
  return {
    linhas, planejado: arred2(planejado), pago: arred2(pago), falta: arred2(falta), previsto,
    sobraPlanejada: arred2(orcamento - planejado), sobra: arred2(orcamento - previsto), dentro: previsto <= orcamento,
  };
}

// ------------------------------------------------------------------ nota fiscal
export function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
const MODELOS = [...SEMANA, ...MES].map((t) => ({ chave: t.chave, nome: t.nome, regras: t.busca.map((b) => new RegExp(b)) }));
/** Item do modelo que corresponde à descrição da nota (ou null). Os mais específicos vêm primeiro no modelo. */
export function modeloDaDescricao(descricao) {
  const n = normalizar(descricao);
  if (!n) return null;
  // Específicos antes: batata palha/pré-frita antes de batata; creme de leite/condensado antes de leite
  const ordem = ["batata-palha", "batata-frita", "creme-leite", "leite-condensado", "salgadinho", "chocolate-po", "chocolate-barra", "achocolatado", "farinha-trigo", "farinha-rosca", "farinha-mandioca", "suco-po", "maracuja", "polvilho", "papel-toalha", "papel-hig", "saco-lixo", "saquinhos", "sabao-liquido", "sabonete", "salsicha"];
  const ordenados = [...MODELOS].sort((a, b) => {
    const ia = ordem.indexOf(a.chave), ib = ordem.indexOf(b.chave);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const m of ordenados) if (m.regras.some((r) => r.test(n))) return m.chave;
  return null;
}

/**
 * Liga cada linha da nota a um item da compra.
 * itensCompra: [{id, chave}] · linhasNota: [{descricao, valor}]
 * Retorna as linhas com item_id (ou null) e, quando o produto é do plano mas de outra lista, `chave`.
 */
export function casarNota(itensCompra, linhasNota) {
  const porChave = new Map(itensCompra.map((i) => [i.chave, i.id]));
  return linhasNota.map((l) => {
    const chave = modeloDaDescricao(l.descricao);
    return { ...l, chave, item_id: chave && porChave.has(chave) ? porChave.get(chave) : null, removido: !!l.removido };
  });
}

/**
 * Comparativo planejado × nota de uma compra.
 * itensCompra: [{id, nome, qtd, preco}] · linhas: [{descricao, valor, item_id, removido}]
 */
export function compararNota(itensCompra, linhas) {
  const validas = linhas.filter((l) => !l.removido);
  const pagoPorItem = new Map();
  for (const l of validas) if (l.item_id) pagoPorItem.set(l.item_id, arred2((pagoPorItem.get(l.item_id) ?? 0) + Number(l.valor)));
  const comprados = [], faltou = [];
  for (const it of itensCompra) {
    const planejado = valorItem(it);
    if (pagoPorItem.has(it.id)) {
      const pago = pagoPorItem.get(it.id);
      comprados.push({ id: it.id, nome: it.nome, planejado, pago, diferenca: arred2(pago - planejado) });
    } else faltou.push({ id: it.id, nome: it.nome, planejado });
  }
  comprados.sort((a, b) => b.diferenca - a.diferenca);
  const extras = validas.filter((l) => !l.item_id);
  const removidos = linhas.filter((l) => l.removido);
  const planejadoComprado = arred2(comprados.reduce((s, c) => s + c.planejado, 0));
  const pagoComprado = arred2(comprados.reduce((s, c) => s + c.pago, 0));
  return {
    comprados, faltou, extras, removidos,
    planejadoComprado, pagoComprado, diferenca: arred2(pagoComprado - planejadoComprado),
    extrasTotal: arred2(extras.reduce((s, l) => s + Number(l.valor), 0)),
    removidoTotal: arred2(removidos.reduce((s, l) => s + Number(l.valor), 0)),
    contaNoPlano: arred2(validas.reduce((s, l) => s + Number(l.valor), 0)),
  };
}

// ------------------------------------------------------------------ lembretes
const nomePrato = (id) => PRATOS[id]?.nome ?? "";
/**
 * Avisos de um momento do dia.
 *   momento "noite" (véspera, no horário escolhido): descongelar, mercado de amanhã, preparo de amanhã
 *   momento "tarde" (14h): escanear a nota da compra de hoje
 *   momento "jantar" (18h): o que tem para jantar
 * plano: {inicio, compras: [{tipo, semana, data, pago, itens, notas}], cardapio: [{data, refeicao, prato}], orcamento}
 */
export function lembretes(hoje, momento, plano) {
  const out = [];
  const amanha = addDias(hoje, 1);
  const w = semanaDoDia(plano.inicio, hoje);
  if (momento === "noite") {
    if (w != null) {
      const desc = (PREPARO[w]?.desc ?? []).filter((d) => d.dia === diaSemana(hoje));
      for (const d of desc) {
        out.push({ tipo: "desc", tag: `desc-${hoje}`, titulo: "Hora de descongelar", corpo: `Passe do congelador para a geladeira: ${d.o}.`, url: "./#hoje" });
      }
    }
    const doMercado = plano.compras.filter((c) => c.data === amanha && c.pago == null);
    if (doMercado.length) {
      const sem = doMercado.find((c) => c.tipo === "semana");
      const itens = doMercado.reduce((s, c) => s + (c.itens?.length ?? 0), 0);
      const valor = doMercado.reduce((s, c) => s + somaItens(c.itens ?? []), 0);
      const nome = doMercado.length > 1 ? `compra do mês e da semana ${sem?.semana}` : sem ? `compra da semana ${sem.semana}` : "compra do mês";
      const cong = sem ? ` O congelador fica com ${congeladorDaSemana(sem.semana - 1, sem.itens)} espaços ocupados.` : "";
      out.push({ tipo: "merc", tag: `merc-${amanha}`, titulo: "Amanhã é dia de mercado", corpo: `${nome[0].toUpperCase() + nome.slice(1)}: ${itens} itens, ${brl(valor, 0)} planejados.${cong}`, url: `./#compras/${sem ? sem.semana : 0}` });
    }
    const ws = semanaDoDia(plano.inicio, amanha);
    if (ws != null && diaSemana(amanha) === 0) {
      const p = PREPARO[ws];
      out.push({ tipo: "prep", tag: `prep-${amanha}`, titulo: `Amanhã: preparo de domingo (${p.tempo})`, corpo: `Separe ${p.separe.slice(0, 3).join(", ")}. Deixe o feijão de molho hoje.`, url: "./#semana" });
    }
  } else if (momento === "tarde") {
    for (const c of plano.compras.filter((c) => c.data === hoje && c.pago == null && !(c.notas ?? 0))) {
      out.push({ tipo: "nota", tag: `nota-${c.id ?? c.data}`, titulo: "Fez o mercado?", corpo: `Escaneie a nota da ${c.tipo === "mes" ? "compra do mês" : `semana ${c.semana}`} para conferir com o planejado.`, url: "./#escanear" });
    }
  } else if (momento === "jantar") {
    const j = plano.cardapio.find((x) => x.data === hoje && x.refeicao === "jantar");
    if (j) out.push({ tipo: "jantar", tag: `jantar-${hoje}`, titulo: `Hoje tem ${nomePrato(j.prato).toLowerCase()}`, corpo: `${PRATOS[j.prato]?.tempo ?? ""} · Crocância: ${PRATOS[j.prato]?.crocancia ?? ""}`.trim(), url: `./#prato/${j.prato}` });
  }
  return out;
}

/** Combinação do sorteio em uma frase. */
export function fraseSorteio(v) {
  return `${v[1][0].toUpperCase() + v[1].slice(1)} com ${v[0]}, ${v[2]} e ${v[3]}, ${v[4]}.`;
}
