// Lógica pura do Crocante (sem tela, sem banco). Usada pelo app, pela função do servidor e pelos testes.
import { CARDAPIO, PREPARO, PRATOS, RECEITAS } from "./dados.js";
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
  if (String(un).toLowerCase() === "kg" && n < 1) return `${Math.round(n * 1000)} g`;
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

/**
 * Espaços ocupados no congelador na semana (0 a 3): saquinhos das bases que vão para o congelador
 * (pelo cardápio real da semana, com as mudanças de dia), o que já vem congelado da compra e o bacon do mês.
 * Sem cardápio, usa o preparo original do plano.
 */
export function congeladorDaSemana(w, itensDaSemana, plano = null) {
  const bases = plano?.cardapio?.length ? preparoDaSemana(plano.inicio, w, plano.cardapio).saquinhos : (PREPARO[w]?.frz?.length ?? 0);
  const congelados = (itensDaSemana ?? []).filter((it) => it.congela && Number(it.qtd) > 0).length;
  return bases + congelados + 1;
}

// ------------------------------------------------------------------ preparo de domingo (pelo cardápio da semana)
// Bases que os pratos usam. tipo: cozido (feito no domingo), cru (bolinhas de hambúrguer), empanado (congelado cru,
// vai direto do freezer para a airfryer) e comprado (vem congelado da compra e só precisa descongelar).
export const BASES = {
  arroz: { nome: "arroz", tipo: "cozido" }, feijao: { nome: "feijão", tipo: "cozido" }, carne: { nome: "carne moída", tipo: "cozido" },
  desfiado: { nome: "frango desfiado", tipo: "cozido" }, cubos: { nome: "frango em cubos", tipo: "cozido" },
  bolinhas: { nome: "bolinhas de hambúrguer cruas", tipo: "cru" },
  nuggets: { nome: "nuggets crus", tipo: "empanado" }, files: { nome: "filés empanados crus", tipo: "empanado" },
  sobrecoxa: { nome: "sobrecoxa", tipo: "comprado" }, linguica: { nome: "linguiça", tipo: "comprado" },
};
/** Bases de um prato, lidas do "pronto do domingo" da receita (+ o que vem congelado da compra). */
export function basesDoPrato(id) {
  const out = new Set();
  for (const p of RECEITAS[id]?.pre ?? []) {
    const n = normalizar(p);
    if (/^ARROZ/.test(n)) out.add("arroz");
    else if (/^FEIJAO/.test(n)) out.add("feijao");
    else if (/BOLINHAS/.test(n)) out.add("bolinhas");
    else if (/^CARNE MOIDA/.test(n)) out.add("carne");
    else if (/DESFIADO/.test(n)) out.add("desfiado");
    else if (/CUBOS/.test(n)) out.add("cubos");
    else if (/NUGGETS/.test(n)) out.add("nuggets");
    else if (/FILES EMPANADOS/.test(n)) out.add("files");
    else if (/SOBRECOXA/.test(n)) out.add("sobrecoxa");
  }
  if (Number(id) === 6) out.add("sobrecoxa");
  if (Number(id) === 17 || Number(id) === 20) out.add("linguica");
  return [...out];
}
/**
 * Onde a base espera até o dia do prato (d = 0 domingo … 6 sábado da semana do plano).
 * Cozidos: domingo = fresco do preparo; até quarta na geladeira; quinta a sábado no congelador (como no plano original).
 * Bolinhas cruas: até terça na geladeira. Empanados: sempre no congelador. Comprados: congelados desde a compra.
 */
export function guardaDaBase(base, d) {
  const tipo = BASES[base]?.tipo;
  if (tipo === "empanado") return "congelador";
  if (tipo === "comprado") return "comprado";
  if (d === 0) return "fresco";
  if (tipo === "cru") return d <= 2 ? "geladeira" : "congelador";
  return d <= 3 ? "geladeira" : "congelador";
}
/** Precisa descongelar na véspera? */
export const descongelaNaVespera = (base, d) => ["congelador", "comprado"].includes(guardaDaBase(base, d)) && BASES[base]?.tipo !== "empanado";

const lista = (xs) => xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
const maiusc = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Usos de bases em cada refeição da semana w (0 a 3), pelo cardápio do plano. */
export function usosDaSemana(inicio, w, cardapio) {
  const domingo = addDias(inicio, 7 * w);
  const usos = [];
  for (let d = 0; d < 7; d++) {
    const dia = addDias(domingo, d);
    for (const ref of ["almoco", "jantar"]) {
      const r = cardapio.find((x) => x.data === dia && x.refeicao === ref);
      if (!r) continue;
      for (const base of basesDoPrato(r.prato)) usos.push({ base, d, dia, ref, prato: r.prato });
    }
  }
  return usos;
}
/**
 * O que guardar e descongelar na semana, calculado pelo cardápio real (os pratos podem mudar de dia dentro da semana).
 * Retorna listas de texto para a tela e o número de saquinhos no congelador.
 */
export function preparoDaSemana(inicio, w, cardapio) {
  const usos = usosDaSemana(inicio, w, cardapio);
  const porBase = new Map();
  for (const u of usos) porBase.set(u.base, [...(porBase.get(u.base) ?? []), u]);
  const fresco = [], gel = [], frz = [], conf = [];
  let saquinhos = 0;
  for (const [base, us] of porBase) {
    const b = BASES[base];
    const dias = (g) => [...new Set(us.filter((u) => guardaDaBase(base, u.d) === g).map((u) => u.d))];
    if (b.tipo === "empanado") { frz.push(`${maiusc(b.nome)} (direto do freezer, sem descongelar)`); saquinhos++; continue; }
    if (b.tipo === "comprado") continue;
    const f = us.filter((u) => u.d === 0);
    if (f.length) fresco.push(`${maiusc(b.nome)} (${lista(f.map((u) => (u.ref === "almoco" ? "almoço" : "jantar")))} de domingo)`);
    const g = dias("geladeira");
    if (g.length) gel.push(`${maiusc(b.nome)} de ${lista(g.map((d) => DIAS[d]))}`);
    const c = dias("congelador");
    if (c.length) { frz.push(`${maiusc(b.nome)} de ${lista(c.map((d) => DIAS[d]))}${c.length > 1 ? `, em ${c.length} saquinhos` : ""}`); saquinhos += c.length; }
  }
  // Descongelar: na noite anterior ao dia do prato
  const porNoite = new Map();
  for (const u of usos) {
    if (!descongelaNaVespera(u.base, u.d)) continue;
    const nomes = porNoite.get(u.d) ?? new Set();
    nomes.add(BASES[u.base].nome);
    porNoite.set(u.d, nomes);
  }
  const desc = [...porNoite.entries()].sort((a, b) => a[0] - b[0]).map(([d, nomes]) => ({
    dia: d === 0 ? 6 : d - 1, quando: d === 0 ? "Sábado anterior à noite" : `${maiusc(DIAS[d - 1])} à noite`, o: `${lista([...nomes])} de ${DIAS[d]}`,
  }));
  // Confira em casa: o que cada prato usa na hora, no dia em que ele está agora
  const domingo = addDias(inicio, 7 * w);
  for (let d = 0; d < 7; d++) for (const ref of ["almoco", "jantar"]) {
    const r = cardapio.find((x) => x.data === addDias(domingo, d) && x.refeicao === ref);
    if (r) conf.push(`${PRATOS[r.prato].nome} (${DIAS[d]}): ${(RECEITAS[r.prato]?.ing ?? []).slice(0, 3).join(", ")}`);
  }
  return { fresco, gel, frz, desc, conf, saquinhos, usos };
}

/** O que descongelar hoje à noite para os pratos de amanhã. */
export function descongelarParaAmanha(inicio, hoje, cardapio) {
  const amanha = addDias(hoje, 1);
  const w = semanaDoDia(inicio, amanha);
  if (w == null) return [];
  const d = diasEntre(addDias(inicio, 7 * w), amanha);
  const itens = [];
  for (const ref of ["almoco", "jantar"]) {
    const r = cardapio.find((x) => x.data === amanha && x.refeicao === ref);
    if (!r) continue;
    const bs = basesDoPrato(r.prato).filter((b) => descongelaNaVespera(b, d)).map((b) => BASES[b].nome);
    if (bs.length) itens.push({ prato: r.prato, ref, bases: bs });
  }
  return itens;
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

/** Texto da nota sem números, unidades e sinais: chave do que a casa ensinou ao app ("BATATA UAI 2KG" → "BATATA UAI"). */
export function chaveTexto(s) {
  const unidades = new Set(["UN", "KG", "PCT", "CX", "LT", "ML", "GR", "UND", "G", "L"]);
  return normalizar(s).replace(/[^A-Z ]+/g, " ").split(" ").filter((p) => p.length >= 2 && !unidades.has(p)).join(" ");
}
/** Destino aprendido de um item da compra: a chave do modelo ou o nome (itens adicionados à mão). */
export const destinoDoItem = (it) => it.chave || `nome:${chaveTexto(it.nome)}`;

/**
 * Liga cada linha da nota a um item da compra.
 * itensCompra: [{id, chave, nome}] · linhasNota: [{descricao, valor}]
 * aprendidos: {chaveTexto: destino} — o que a casa já corrigiu antes vence as regras; destino "fora" = não é do plano.
 * Retorna as linhas com item_id (ou null), `chave` do modelo (produto do plano, talvez de outra lista) e `origem`.
 */
export function casarNota(itensCompra, linhasNota, aprendidos = {}) {
  const porDestino = new Map(itensCompra.map((i) => [destinoDoItem(i), i.id]));
  const porChave = new Map(itensCompra.filter((i) => i.chave).map((i) => [i.chave, i.id]));
  return linhasNota.map((l) => {
    const ap = aprendidos[chaveTexto(l.descricao)];
    if (ap === "fora") return { ...l, chave: null, item_id: null, removido: true, origem: "aprendido" };
    if (ap && porDestino.has(ap)) return { ...l, chave: ap.startsWith("nome:") ? null : ap, item_id: porDestino.get(ap), removido: false, origem: "aprendido" };
    const chave = modeloDaDescricao(l.descricao);
    return { ...l, chave, item_id: chave && porChave.has(chave) ? porChave.get(chave) : null, removido: !!l.removido, origem: chave ? "regra" : null };
  });
}

// Abreviações comuns nas notas
const ABREV = { REQUEIJ: "REQUEIJAO", REQ: "REQUEIJAO", CHOC: "CHOCOLATE", FGO: "FRANGO", FRG: "FRANGO", EMPAN: "EMPANADO", SALS: "SALSICHA",
  MUSS: "MUSSARELA", MUC: "MUSSARELA", BAT: "BATATA", LTE: "LEITE", CR: "CREME", CONG: "CONGELADO", MOL: "MOLHO", TOM: "TOMATE",
  SASSAMI: "PEITO", FILEZINHO: "PEITO", TIRINHAS: "NUGGETS", LING: "LINGUICA", PRES: "PRESUNTO", BISC: "BISCOITO", REFRIG: "REFRIGERANTE",
  DET: "DETERGENTE", AMAC: "AMACIANTE", DESOD: "DESODORANTE", FAR: "FARINHA", MARG: "MARGARINA", MAC: "MACARRAO", ACHOC: "ACHOCOLATADO" };
const VAZIAS = new Set(["UN", "KG", "PCT", "CX", "LT", "ML", "GR", "UND", "NAT", "TRAD", "OFERTA", "PROMO", "FRACION", "FRAC", "IQF", "COM", "SEM", "TIPO", "PARA", "DE", "DO", "DA"]);
function palavras(s) {
  return normalizar(s).replace(/[^A-Z ]+/g, " ").split(" ").filter((p) => p.length >= 3 && !VAZIAS.has(p)).map((p) => ABREV[p] ?? p);
}
function trigramas(s) { const g = new Set(); const x = `  ${s} `; for (let i = 0; i < x.length - 2; i++) g.add(x.slice(i, i + 3)); return g; }
function parecido(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  const A = trigramas(a), B = trigramas(b);
  let c = 0;
  for (const x of A) if (B.has(x)) c++;
  return (2 * c) / (A.size + B.size);
}
const PALAVRAS_MODELO = new Map([...SEMANA, ...MES].map((t) => [t.chave, t.busca.map((b) => b.replace(/\(\?!.*$/, "")).join(" ").replace(/\\[bB]/g, " ").replace(/[^A-Z ]+/g, " ")]));
/**
 * Itens da compra mais parecidos com a linha da nota, para a pessoa escolher: [{item, nota, nivel}] do mais parecido para o menos.
 * nivel: "alta" | "média" | "baixa".
 */
export function sugerirItens(descricao, itensCompra, n = 3) {
  const ps = palavras(descricao);
  if (!ps.length) return [];
  const regra = modeloDaDescricao(descricao);
  const res = itensCompra.map((it) => {
    const alvo = [...new Set(palavras(`${it.nome} ${PALAVRAS_MODELO.get(it.chave) ?? ""}`))];
    let soma = 0, melhor = 0;
    for (const p of ps) {
      const m = Math.max(0, ...alvo.map((a) => parecido(p, a)));
      if (m >= 0.5) soma += m;
      melhor = Math.max(melhor, m);
    }
    let nota = Math.max(soma / ps.length, melhor * 0.45);
    if (regra && regra === it.chave) nota = Math.max(nota, 0.9);
    return { item: it, nota: Math.round(nota * 100) / 100 };
  }).filter((x) => x.nota >= 0.3).sort((a, b) => b.nota - a.nota).slice(0, n);
  return res.map((x) => ({ ...x, nivel: x.nota >= 0.65 ? "alta" : x.nota > 0.45 ? "média" : "baixa" }));
}

/** Peso (em kg) da embalagem escrito na descrição da nota: "BATATA UAI 2KG" → 2, "MIST. BOLO 400G" → 0.4. */
export function pesoDaDescricao(descricao) {
  const m = normalizar(descricao).match(/(\d+(?:[.,]\d+)?)\s*(KG|G|GR)\b/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return m[2] === "KG" ? n : n / 1000;
}

/**
 * Quanto do item veio nas notas, na unidade do item (para mostrar planejado × comprado).
 * Item em kg: linha em KG conta o peso; linha por unidade usa o peso da embalagem da descrição ("1KG", "700G").
 * Linha em KG com quantidade inteira e peso na descrição ("LINGUICA 700G", 1 KG) = embalagens × peso.
 * Item contado (un, pct, bandeja…): soma as unidades das linhas.
 * Retorna {q, un, texto, confere} ou null; confere = true (bate), "menos", "mais" ou null (não dá para comparar).
 */
export function quantidadeComprada(item, linhas) {
  const unItem = String(item.unidade ?? item.un ?? "").toLowerCase();
  const plan = Number(item.qtd);
  const partes = [];
  let total = 0, mesmaUnidade = true;
  for (const l of linhas) {
    if (l.removido) continue;
    const q = Number(l.qtd ?? 1) || 1;
    const unL = String(l.un ?? "UN").toUpperCase();
    const ehPeso = unL === "KG" || unL === "G";
    const peso = pesoDaDescricao(l.descricao ?? "");
    if (unItem === "kg") {
      let kg = null;
      if (ehPeso) kg = peso && Number.isInteger(q) && unL === "KG" ? q * peso : unL === "G" ? q / 1000 : q;
      else if (peso) kg = q * peso;
      if (kg == null) { mesmaUnidade = false; partes.push(`${q} ${unL.toLowerCase()}`); }
      else { total += kg; partes.push(null); }
    } else if (ehPeso && !(peso && Number.isInteger(q))) {
      // item contado que veio a granel: não dá para converter
      mesmaUnidade = false;
      partes.push(qtdTexto(unL === "G" ? q / 1000 : q, "kg"));
    } else { total += q; partes.push(null); }
  }
  if (!partes.length) return null;
  total = unItem === "kg" ? Math.round(total * 1000) / 1000 : arred2(total);
  if (!mesmaUnidade) {
    const extras = partes.filter(Boolean);
    const texto = [total ? qtdTexto(total, unItem) : null, ...extras].filter(Boolean).join(" + ");
    return { q: null, un: unItem, texto, confere: null };
  }
  // tolerância: 5% no peso (balança), exato nas unidades
  const tol = unItem === "kg" ? Math.max(0.02, plan * 0.05) : 1e-9;
  const confere = Math.abs(total - plan) <= tol ? true : total < plan ? "menos" : "mais";
  return { q: total, un: unItem, texto: qtdTexto(total, unItem), confere };
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
      const comprado = quantidadeComprada(it, validas.filter((l) => l.item_id === it.id));
      comprados.push({ id: it.id, nome: it.nome, planejado, pago, diferenca: arred2(pago - planejado), comprado });
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
  if (momento === "noite") {
    const desc = descongelarParaAmanha(plano.inicio, hoje, plano.cardapio ?? []);
    if (desc.length) {
      const partes = desc.map((x) => `${lista(x.bases)} (${PRATOS[x.prato].nome.toLowerCase()}, ${x.ref === "almoco" ? "almoço" : "jantar"})`);
      out.push({ tipo: "desc", tag: `desc-${hoje}`, titulo: "Hora de descongelar", corpo: `Passe do congelador para a geladeira: ${lista(partes)}.`, url: "./#hoje" });
    }
    const doMercado = plano.compras.filter((c) => c.data === amanha && c.pago == null);
    if (doMercado.length) {
      const sem = doMercado.find((c) => c.tipo === "semana");
      const itens = doMercado.reduce((s, c) => s + (c.itens?.length ?? 0), 0);
      const valor = doMercado.reduce((s, c) => s + somaItens(c.itens ?? []), 0);
      const nome = doMercado.length > 1 ? `compra do mês e da semana ${sem?.semana}` : sem ? `compra da semana ${sem.semana}` : "compra do mês";
      const cong = sem ? ` O congelador fica com ${congeladorDaSemana(sem.semana - 1, sem.itens, plano)} espaços ocupados.` : "";
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

// ------------------------------------------------------------------ mercados
/** CNPJ do emitente que vem dentro da chave de acesso da NFC-e (dígitos 7 a 20). */
export function cnpjDaChave(chave) {
  const d = String(chave ?? "").replace(/\D/g, "");
  return d.length === 44 ? d.slice(6, 20) : null;
}
/** Identidade do mercado de uma nota: o CNPJ; sem chave, o nome normalizado. */
export const mercadoDaNota = (n) => cnpjDaChave(n.chave) ?? "nome:" + normalizar(n.emitente ?? "MERCADO").trim();
export function cnpjTexto(c) {
  return /^\d{14}$/.test(c ?? "") ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : "";
}

/**
 * Ranking de mercados pelas notas da casa.
 * notas: [{id, chave, emitente, emissao, total, conta_no_plano, linhas}] · itens: Map id → {chave, nome, qtd, unidade, preco}
 * Índice de preço = quanto você pagaria lá pelos mesmos produtos, comparado a uma referência (1 = igual, 0,9 = 10% mais barato):
 * - "cesta": produtos comprados em 2+ mercados; referência = média dos mercados para aquele produto (vale quando
 *   pelo menos 2 mercados têm 3+ produtos em comum).
 * - "plano": enquanto não há produtos em comum, compara com o preço planejado de cada item (mesma régua para todos).
 * Os dois ponderam pelo valor gasto e usam o preço por kg/unidade (quantidadeComprada).
 */
export function rankingMercados(notas, itens, apelidos = {}, minComuns = 3) {
  const mercados = new Map();
  const precos = new Map(); // produto → Map mercado → {valor, q}
  for (const n of notas) {
    const id = mercadoDaNota(n);
    const m = mercados.get(id) ?? { id, nome: n.emitente ?? "Mercado", cnpj: cnpjDaChave(n.chave), notas: [], total: 0, pagoPlano: 0, basePlano: 0, nPlano: 0 };
    mercados.set(id, m);
    m.notas.push(n);
    m.total += Number(n.total ?? n.conta_no_plano ?? 0);
    const porItem = new Map();
    for (const l of n.linhas ?? []) if (l.item_id && !l.removido) (porItem.get(l.item_id) ?? porItem.set(l.item_id, []).get(l.item_id)).push(l);
    for (const [itemId, ls] of porItem) {
      const it = itens.get(itemId);
      if (!it) continue;
      const cq = quantidadeComprada(it, ls);
      if (!cq || !(cq.q > 0)) continue;
      const valor = ls.reduce((s, l) => s + Number(l.valor), 0);
      if (Number(it.preco) > 0) { m.pagoPlano += valor; m.basePlano += cq.q * Number(it.preco); m.nPlano++; }
      const produto = destinoDoItem(it) + "|" + String(it.unidade ?? "").toLowerCase();
      const pm = precos.get(produto) ?? precos.set(produto, new Map()).get(produto);
      const p = pm.get(id) ?? pm.set(id, { valor: 0, q: 0, nome: it.nome, un: String(it.unidade ?? "").toLowerCase() }).get(id);
      p.valor += valor; p.q += cq.q;
    }
  }
  // cesta comum
  for (const m of mercados.values()) { m.cestaPago = 0; m.cestaRef = 0; m.comuns = []; }
  for (const [, pm] of precos) {
    if (pm.size < 2) continue;
    const unit = [...pm.entries()].map(([id, p]) => [id, p.valor / p.q, p]);
    const ref = unit.reduce((s, [, u]) => s + u, 0) / unit.length;
    for (const [id, u, p] of unit) {
      const m = mercados.get(id);
      m.cestaPago += p.valor; m.cestaRef += p.q * ref;
      m.comuns.push({ nome: p.nome, un: p.un, preco: arred2(u), referencia: arred2(ref), outros: unit.filter(([o]) => o !== id).map(([o, uo]) => ({ mercado: o, preco: arred2(uo) })) });
    }
  }
  const lista = [...mercados.values()].map((m) => {
    m.notas.sort((a, b) => String(b.emissao ?? "").localeCompare(String(a.emissao ?? "")));
    return {
      id: m.id, nome: m.nome, apelido: apelidos[m.id] ?? null, cnpj: m.cnpj, notas: m.notas, visitas: m.notas.length,
      total: arred2(m.total), ultima: m.notas[0]?.emissao ?? null,
      indicePlano: m.basePlano ? m.pagoPlano / m.basePlano : null, itensPlano: m.nPlano,
      indiceCesta: m.comuns.length >= minComuns && m.cestaRef ? m.cestaPago / m.cestaRef : null, comuns: m.comuns,
    };
  });
  const modo = lista.filter((m) => m.indiceCesta != null).length >= 2 ? "cesta" : "plano";
  const chave = modo === "cesta" ? "indiceCesta" : "indicePlano";
  lista.sort((a, b) => (a[chave] ?? Infinity) - (b[chave] ?? Infinity) || b.total - a.total);
  return { modo, mercados: lista.map((m) => ({ ...m, indice: m[chave] })) };
}

// ------------------------------------------------------------------ geladeira (pratos prontos guardados)
/** Prazos de prato pronto: geladeira 3–4 dias; congelador mantém a qualidade por uns 3 meses. */
export const PRAZO_GUARDADO = { geladeira: { logo: 3, passou: 4 }, congelador: { logo: 60, passou: 90 } };
/**
 * Situação de um prato guardado em `hoje`.
 * Retorna {dias, restam, alerta: null | "logo" | "passou", texto}.
 */
export function situacaoGuardado(g, hoje) {
  const dias = Math.max(0, diasEntre(g.guardado_em, hoje));
  const restam = Math.max(0, Number(g.porcoes ?? 1) - Number(g.comidas ?? 0));
  const p = PRAZO_GUARDADO[g.onde] ?? PRAZO_GUARDADO.geladeira;
  const alerta = dias >= p.passou ? "passou" : dias >= p.logo ? "logo" : null;
  const ha = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  let texto;
  if (g.onde === "geladeira") texto = alerta === "passou" ? `guardado ${ha}: passou dos 4 dias, confira antes de comer` : alerta === "logo" ? `guardado ${ha}: coma hoje` : `guardado ${ha}`;
  else texto = alerta === "passou" ? `congelado ${ha}: mais de 3 meses, use logo` : alerta === "logo" ? `congelado ${ha}: use nas próximas semanas` : `congelado ${ha}`;
  return { dias, restam, alerta, texto };
}
/** Registra porções comidas: soma em comidas e fecha (comido_em) quando acabam. */
export function comerGuardado(g, porcoes, data, por = null) {
  const n = Math.max(1, Math.round(Number(porcoes) || 1));
  const comidas = Math.min(Number(g.porcoes), Number(g.comidas ?? 0) + n);
  const comeu = [...(g.comeu ?? []), { data, porcoes: comidas - Number(g.comidas ?? 0), por }];
  return { comidas, comeu, comido_em: comidas >= Number(g.porcoes) ? data : null };
}
/** Desfaz o último registro de "comemos". */
export function desfazerComida(g) {
  const comeu = [...(g.comeu ?? [])];
  const ultimo = comeu.pop();
  const comidas = Math.max(0, Number(g.comidas ?? 0) - Number(ultimo?.porcoes ?? 0));
  return { comidas, comeu, comido_em: null };
}

// ------------------------------------------------------------------ tela Hoje
/**
 * Qual refeição vai em destaque e qual vem logo depois, pela hora de Brasília.
 * Da meia-noite às 14h: almoço de hoje em destaque e o jantar de hoje embaixo.
 * Das 14h à meia-noite: jantar de hoje em destaque e o almoço de amanhã embaixo.
 */
export function refeicoesDoMomento(hoje, hora) {
  return hora < 14
    ? [{ data: hoje, ref: "almoco" }, { data: hoje, ref: "jantar" }]
    : [{ data: hoje, ref: "jantar" }, { data: addDias(hoje, 1), ref: "almoco" }];
}

// ------------------------------------------------------------------ Crocante → Finanças da Casa
/** Categoria do Finanças para cada seção do mercado do Crocante (pelo nome da categoria). */
export const CATEGORIA_DA_SECAO = {
  hortifruti: "Hortifruti", padaria: "Padaria", acougue: "Carnes e frios", frios: "Carnes e frios",
  congelados: "Mercado", leite: "Mercado", mercearia: "Mercado", molhos: "Mercado",
  doces: "Doces e snacks", bebidas: "Bebidas", higiene: "Higiene e beleza", limpeza: "Limpeza",
};
/** Origens de categoria do Finanças que o Crocante não mexe: são escolhas da casa. */
export const ORIGENS_DA_CASA = new Set(["manual", "aprendida"]);
/**
 * Junta as linhas da nota do Crocante com os itens da mesma nota no Finanças (mesma leitura da SEFAZ).
 * Primeiro pela posição quando descrição e valor batem; o que sobrar, pela descrição e valor (ou só descrição).
 * Retorna [{linha, item}] (item = nota_itens do Finanças).
 */
export function parearItensFinancas(linhas, itensFin) {
  const fin = [...itensFin].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const usados = new Set(), pares = [];
  const mesmaDesc = (l, i) => normalizar(l.descricao).trim() === normalizar(i.descricao).trim();
  const sobra = [];
  linhas.forEach((l, k) => {
    const i = fin[k];
    if (i && !usados.has(i.id) && mesmaDesc(l, i) && Math.abs(Number(i.valor_total) - Number(l.valor)) < 0.011) { usados.add(i.id); pares.push({ linha: l, item: i }); } else sobra.push(l);
  });
  for (const l of sobra) {
    const i = fin.find((x) => !usados.has(x.id) && mesmaDesc(l, x) && Math.abs(Number(x.valor_total) - Number(l.valor)) < 0.011)
      ?? fin.find((x) => !usados.has(x.id) && mesmaDesc(l, x));
    if (i) { usados.add(i.id); pares.push({ linha: l, item: i }); }
  }
  return pares;
}
/** Categoria do gasto = a que mais pesa nos itens da nota (mesma regra do Finanças). */
export function categoriaDominante(itens) {
  const soma = new Map();
  for (const i of itens) if (i.categoria_id != null) soma.set(i.categoria_id, (soma.get(i.categoria_id) ?? 0) + Number(i.valor_total || 0));
  let melhor = null, max = -1;
  for (const [id, v] of soma) if (v > max) { max = v; melhor = id; }
  return melhor;
}
/**
 * O que mudar nos itens do Finanças: linhas ligadas a itens do plano ganham a categoria da seção,
 * a menos que a casa já tenha escolhido (manual/aprendida). Linhas fora do plano ficam como o Finanças classificou.
 * secaoDaLinha(linha) → chave da seção; catPorNome = {nome: id}. Retorna [{id, categoria_id}].
 */
export function categoriasParaFinancas(pares, secaoDaLinha, catPorNome) {
  const mudar = [];
  for (const { linha, item } of pares) {
    if (!linha.item_id || linha.removido || ORIGENS_DA_CASA.has(item.categoria_origem)) continue;
    const cat = catPorNome[CATEGORIA_DA_SECAO[secaoDaLinha(linha)]];
    if (cat && (cat !== item.categoria_id || item.categoria_origem !== "crocante")) mudar.push({ id: item.id, categoria_id: cat });
  }
  return mudar;
}
