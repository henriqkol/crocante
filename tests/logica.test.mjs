// Testes da lógica pura: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDias, diaSemana, escalar, gerarPlano, semanaDoDia, congeladorDaSemana, resumoOrcamento,
  modeloDaDescricao, casarNota, compararNota, lembretes, somaItens, hojeBrasilia, horaBrasilia, proximoDomingo,
  preparoDaSemana, basesDoPrato, guardaDaBase, descongelarParaAmanha, chaveTexto, sugerirItens, destinoDoItem,
} from "../app/logica.js";

const INICIO = "2026-10-04"; // domingo

test("datas", () => {
  assert.equal(diaSemana(INICIO), 0);
  assert.equal(addDias(INICIO, -1), "2026-10-03");
  assert.equal(proximoDomingo("2026-10-09"), "2026-10-11");
  assert.equal(proximoDomingo("2026-10-11"), "2026-10-18");
  assert.equal(hojeBrasilia(new Date("2026-10-10T02:30:00Z")), "2026-10-09");
  assert.equal(horaBrasilia(new Date("2026-10-09T23:00:00Z")), 20);
  assert.equal(horaBrasilia(new Date("2026-10-10T00:00:00Z")), 21);
});

test("escala por pessoas", () => {
  assert.equal(escalar(0.55, "kg", 2), 0.55);
  assert.equal(escalar(0.55, "kg", 3), 0.85);
  assert.equal(escalar(1, "pct", 3), 2);
  assert.equal(escalar(3, "caixas", 2), 3);
  assert.equal(escalar(0, "kg", 4), 0);
});

test("plano de 4 semanas para 2 pessoas fecha com o orçamento do plano original", () => {
  const p = gerarPlano(INICIO, 2);
  assert.equal(p.compras.length, 5);
  assert.deepEqual(p.compras.map((c) => c.data), ["2026-10-03", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"]);
  const totais = p.compras.map((c) => somaItens(c.itens));
  assert.deepEqual(totais.slice(1), [208.15, 161.15, 156.85, 164.85]);
  assert.equal(totais.reduce((a, b) => a + b, 0).toFixed(2), "1548.00");
  assert.equal(p.cardapio.length, 56);
  assert.equal(p.cardapio[0].prato, 23);            // domingo da semana 1: PF de ovo frito
  assert.equal(p.cardapio.find((c) => c.data === "2026-10-09" && c.refeicao === "jantar").prato, 11); // sexta: smash burger
  assert.throws(() => gerarPlano("2026-10-05"));
});

test("congelador por semana", () => {
  const p = gerarPlano(INICIO, 2);
  assert.deepEqual([1, 2, 3, 4].map((s) => congeladorDaSemana(s - 1, p.compras[s].itens)), [9, 7, 6, 8]); // sem cardápio: preparo original
  assert.deepEqual([1, 2, 3, 4].map((s) => congeladorDaSemana(s - 1, p.compras[s].itens, p)), [9, 9, 8, 8]); // pelo cardápio
  assert.equal(semanaDoDia(INICIO, "2026-10-09"), 0);
  assert.equal(semanaDoDia(INICIO, "2026-10-31"), 3);
  assert.equal(semanaDoDia(INICIO, "2026-11-01"), null);
});

test("orçamento: pago + o que falta", () => {
  const p = gerarPlano(INICIO, 2);
  const compras = p.compras.map((c, i) => ({ ...c, pago: i === 0 ? 861.3 : i === 1 ? 214.9 : null }));
  const r = resumoOrcamento(compras, 1600);
  assert.equal(r.planejado, 1548);
  assert.equal(r.pago, 1076.2);
  assert.equal(r.falta, 482.85);
  assert.equal(r.previsto, 1559.05);
  assert.equal(r.sobra, 40.95);
  assert.equal(r.dentro, true);
});

test("reconhece produtos na nota", () => {
  const casos = {
    "PEITO FGO CONG KG": "peito", "FILE DE PEITO FRANGO SADIA": "peito", "SOBRECOXA FGO KG": "sobrecoxa",
    "CARNE MOIDA ACEM KG": "carne", "LINGUICA TOSCANA PERDIGAO": "linguica", "SALSICHA HOT DOG KG": "salsicha",
    "BATATA PALHA ELMA 400G": "batata-palha", "BATATA PRE FRITA MCCAIN 1KG": "batata-frita", "BATATA KG": "batata",
    "CREME LEITE NESTLE 200G": "creme-leite", "LEITE CONDENSADO MOCA": "leite-condensado", "LEITE INTEGRAL 1L": "leite",
    "MUSSARELA FATIADA KG": "mussarela", "OVOS BRANCOS 30UN": "ovos", "PAO FORMA PULLMAN": "pao",
    "REFRIG COCA COLA 2L": "refri", "ARROZ T1 TIO JOAO 5KG": "arroz", "KETCHUP HEINZ 1KG": "ketchup",
    "SAL REFINADO 1KG": "sal", "BATATA UAI 2KG": "batata-frita", "BATATA BRANCA OFERTA KG": "batata", "PAO FARIAS FORMA 500G": "pao",
    "REQUEIJ. STA. CLARA 180G": "requeijao", "CHOC. ARCOR BARRA": "chocolate-barra", "FILEZINHO NAT 1KG IQF.SASSAMI": "peito",
    "EMPAN.C.VALE 1KG TIRINHAS FGO": "nuggets", "SALS NATURAL FRACION": "salsicha", "TOMATE RASTEIRO MIUDO KG": null, "PAPEL HIG NEVE 12RL": "papel-hig", "CERVEJA LT 350ML": null, "RACAO GATO 1KG": null, "PILHA AA C/4": null,
  };
  for (const [desc, esperado] of Object.entries(casos)) assert.equal(modeloDaDescricao(desc), esperado, desc);
});

test("casa a nota com a compra e compara", () => {
  const p = gerarPlano(INICIO, 2);
  const itens = p.compras[2].itens.map((it, i) => ({ ...it, id: `i${i}` }));
  const linhas = casarNota(itens, [
    { descricao: "PEITO FGO 1,615 KG", valor: 35.37 },
    { descricao: "CERVEJA LT 350ML", valor: 41.88 },
    { descricao: "OVOS BRANCOS 30UN", valor: 18.9 },
    { descricao: "ARROZ T1 5KG", valor: 26.9 },            // é do plano, mas da compra do mês
  ]);
  assert.equal(linhas[0].item_id, itens.find((i) => i.chave === "peito").id);
  assert.equal(linhas[1].item_id, null);
  assert.equal(linhas[3].chave, "arroz");
  assert.equal(linhas[3].item_id, null);
  linhas[1].removido = true;
  const c = compararNota(itens, linhas);
  assert.equal(c.comprados.length, 2);
  assert.equal(c.diferenca, 3.27);           // peito +3,37, ovos −0,10
  assert.equal(c.removidoTotal, 41.88);
  assert.equal(c.extrasTotal, 26.9);
  assert.equal(c.contaNoPlano, 81.17);
  assert.equal(c.faltou.length, itens.length - 2);
});

test("lembretes", () => {
  const p = gerarPlano(INICIO, 2);
  const plano = { ...p, compras: p.compras.map((c, i) => ({ ...c, pago: i <= 1 ? 1 : null })) };
  // sexta 09/10 à noite: descongelar sobrecoxa + mercado de amanhã (semana 2)
  const sexta = lembretes("2026-10-09", "noite", plano);
  assert.deepEqual(sexta.map((l) => l.tipo), ["desc", "merc"]);
  assert.match(sexta[0].corpo, /sobrecoxa/);
  assert.match(sexta[1].corpo, /Compra da semana 2: 14 itens/);
  // sábado 10/10 à noite: preparo de domingo da semana 2
  const sab = lembretes("2026-10-10", "noite", plano);
  assert.ok(sab.some((l) => l.tipo === "prep" && /1h30/.test(l.titulo)));
  // sábado 10/10 à tarde: escanear a nota
  assert.equal(lembretes("2026-10-10", "tarde", plano)[0].tipo, "nota");
  // jantar de sexta
  assert.match(lembretes("2026-10-09", "jantar", plano)[0].titulo, /smash burger/);
  // véspera do plano: compra do mês e da semana 1 no mesmo dia
  const vespera = lembretes("2026-10-02", "noite", p);
  assert.match(vespera.find((l) => l.tipo === "merc").corpo, /Compra do mês e da semana 1/);
});

test("bases dos pratos e onde elas esperam", () => {
  assert.deepEqual(basesDoPrato(11), ["bolinhas"]);
  assert.deepEqual(basesDoPrato(17).sort(), ["arroz", "feijao", "linguica"]);
  assert.deepEqual(basesDoPrato(6), ["sobrecoxa"]);
  assert.equal(guardaDaBase("arroz", 0), "fresco");
  assert.equal(guardaDaBase("arroz", 3), "geladeira");
  assert.equal(guardaDaBase("arroz", 4), "congelador");
  assert.equal(guardaDaBase("bolinhas", 3), "congelador");
  assert.equal(guardaDaBase("nuggets", 1), "congelador");
});

test("preparo segue o cardápio quando os pratos mudam de dia", () => {
  const p = gerarPlano(INICIO, 2);
  const antes = preparoDaSemana(p.inicio, 0, p.cardapio);
  assert.ok(antes.frz.some((x) => /Bolinhas.*sexta/.test(x)));
  // smash burger (sexta à noite) troca com o hot dog (segunda à noite)
  const card = p.cardapio.map((x) => ({ ...x }));
  const sexta = card.find((x) => x.data === "2026-10-09" && x.refeicao === "jantar");
  const segunda = card.find((x) => x.data === "2026-10-05" && x.refeicao === "jantar");
  [sexta.prato, segunda.prato] = [segunda.prato, sexta.prato];
  const depois = preparoDaSemana(p.inicio, 0, card);
  assert.ok(depois.gel.some((x) => /Bolinhas.*segunda/.test(x)));
  assert.ok(!depois.frz.some((x) => /Bolinhas/.test(x)));
  assert.equal(depois.saquinhos, antes.saquinhos - 1);
  assert.ok(depois.conf.some((x) => /^Smash burger com batata \(segunda\)/.test(x)));
  // e o lembrete de quinta à noite não pede mais as bolinhas
  assert.deepEqual(descongelarParaAmanha(p.inicio, "2026-10-08", card).flatMap((x) => x.bases).sort(), ["arroz", "carne moída"]);
});

test("aprendizado e sugestões na nota", () => {
  const p = gerarPlano(INICIO, 2);
  const itens = p.compras[1].itens.map((it, i) => ({ ...it, id: `i${i}` }));
  assert.equal(chaveTexto("BATATA UAI 2KG"), "BATATA UAI");
  const frita = itens.find((i) => i.chave === "batata-frita"), inglesa = itens.find((i) => i.chave === "batata");
  // a casa ensinou que "BATATA X" é a inglesa e que tomate não é do plano
  const aprendidos = { [chaveTexto("BATATA SUPER 1KG")]: destinoDoItem(inglesa), [chaveTexto("TOMATE KG")]: "fora" };
  const linhas = casarNota(itens, [{ descricao: "BATATA SUPER 1KG", valor: 6 }, { descricao: "TOMATE KG", valor: 3 }, { descricao: "BATATA UAI 2KG", valor: 22.49 }], aprendidos);
  assert.equal(linhas[0].item_id, inglesa.id);
  assert.equal(linhas[0].origem, "aprendido");
  assert.equal(linhas[1].removido, true);
  assert.equal(linhas[2].item_id, frita.id);
  const s = sugerirItens("REQUEIJ. STA. CLARA 180G", itens);
  assert.equal(s[0].item.chave, "requeijao");
  assert.equal(s[0].nivel, "alta");
});
