// Testes da lógica pura: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refeicoesDoMomento, situacaoGuardado, comerGuardado, desfazerComida, quantidadeComprada, cnpjDaChave, cnpjTexto, rankingMercados, addDias, diaSemana, escalar, gerarPlano, semanaDoDia, congeladorDaSemana, resumoOrcamento,
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

test("quantidade comprada na unidade do item", () => {
  const Q = (item, linhas) => quantidadeComprada(item, linhas);
  // peso na balança
  assert.deepEqual(Q({ qtd: 1, unidade: "kg" }, [{ descricao: "BATATA BRANCA OFERTA KG", qtd: 1.941, un: "KG" }]), { q: 1.941, un: "kg", texto: "1,941 kg", confere: "mais" });
  // carne em três bandejas
  const carne = Q({ qtd: 0.75, unidade: "kg" }, [0.294, 0.294, 0.238].map((q) => ({ descricao: "CARNE MOIDA II", qtd: q, un: "KG" })));
  assert.equal(carne.q, 0.826); assert.equal(carne.texto, "826 g"); assert.equal(carne.confere, "mais");
  // embalagem por unidade com peso na descrição
  assert.equal(Q({ qtd: 1, unidade: "kg" }, [{ descricao: "FILEZINHO NAT 1KG IQF.SASSAMI", qtd: 1, un: "UN" }]).confere, true);
  // nota diz 1 KG mas é um pacote de 700 g
  assert.equal(Q({ qtd: 0.5, unidade: "kg" }, [{ descricao: "LINGUICA AURORA 700G FGO.", qtd: 1, un: "KG" }]).texto, "700 g");
  assert.equal(Q({ qtd: 1.5, unidade: "kg" }, [{ descricao: "SOBRECOXA NAT 1KG IQF", qtd: 1, un: "KG" }]).confere, "menos");
  assert.equal(Q({ qtd: 0.25, unidade: "Kg" }, [{ descricao: "TOMATE RASTEIRO MIUDO KG", qtd: 0.268, un: "KG" }]).confere, true);
  // contados
  assert.equal(Q({ qtd: 2, unidade: "caixinhas" }, [{ descricao: "CR.LEITE CCGL 200G TP", qtd: 1, un: "UN" }]).confere, "menos");
  assert.deepEqual(Q({ qtd: 2, unidade: "bandeja" }, [{ descricao: "OVOS FILIPPSEN 20UN.BRANCO", qtd: 2, un: "UN" }]), { q: 2, un: "bandeja", texto: "2 bandeja", confere: true });
  // contado que veio a granel: mostra o peso, sem comparar
  assert.deepEqual(Q({ qtd: 1, unidade: "pct" }, [{ descricao: "PAO FRANCES KG", qtd: 0.42, un: "KG" }]), { q: null, un: "pct", texto: "420 g", confere: null });
  assert.equal(Q({ qtd: 1, unidade: "kg" }, []), null);
});

test("ranking de mercados", () => {
  const itens = new Map([
    ["a", { chave: "peito", nome: "Peito de frango", qtd: 1, unidade: "kg", preco: 20 }],
    ["b", { chave: "batata", nome: "Batata inglesa", qtd: 1, unidade: "kg", preco: 5 }],
    ["c", { chave: "ovos", nome: "Ovos", qtd: 2, unidade: "bandeja", preco: 12 }],
  ]);
  const P = "43261088118021000157650340001571811062554902", V = "43261006130671000153651230000066451551667839";
  assert.equal(cnpjDaChave(P), "88118021000157");
  assert.equal(cnpjTexto("88118021000157"), "88.118.021/0001-57");
  const notas = [
    { id: "1", chave: P, emitente: "SUPERMERCADO PEDRAO", emissao: "2026-10-10T18:28:02Z", total: 40, linhas: [
      { descricao: "FILEZINHO 1KG", qtd: 1, un: "UN", valor: 24, item_id: "a" },
      { descricao: "BATATA KG", qtd: 2, un: "KG", valor: 8, item_id: "b" },
      { descricao: "OUTRA COISA", qtd: 1, un: "UN", valor: 8, removido: true }] },
    { id: "2", chave: V, emitente: "COMERCIAL VENDRAMINI LTDA", emissao: "2026-10-10T18:47:27Z", total: 22, linhas: [
      { descricao: "OVOS 20UN", qtd: 2, un: "UN", valor: 22, item_id: "c" }] },
  ];
  // sem produtos em comum: compara com o preço planejado
  let r = rankingMercados(notas, itens, { "06130671000153": "Vendramini" });
  assert.equal(r.modo, "plano");
  assert.deepEqual(r.mercados.map((m) => m.apelido ?? m.nome), ["Vendramini", "SUPERMERCADO PEDRAO"]);
  assert.ok(Math.abs(r.mercados[0].indice - 22 / 24) < 1e-9);
  assert.ok(Math.abs(r.mercados[1].indice - 32 / 30) < 1e-9);
  // com 3 produtos em comum, passa a comparar entre os mercados
  notas.push({ id: "3", chave: V, emitente: "COMERCIAL VENDRAMINI LTDA", emissao: "2026-11-07T18:00:00Z", total: 30, linhas: [
    { descricao: "PEITO KG", qtd: 1, un: "KG", valor: 18, item_id: "a" },
    { descricao: "BATATA KG", qtd: 1, un: "KG", valor: 5, item_id: "b" }] });
  notas.push({ id: "4", chave: P, emitente: "SUPERMERCADO PEDRAO", emissao: "2026-11-14T18:00:00Z", total: 26, linhas: [
    { descricao: "OVOS 20UN", qtd: 2, un: "UN", valor: 26, item_id: "c" }] });
  r = rankingMercados(notas, itens);
  assert.equal(r.modo, "cesta");
  assert.equal(r.mercados[0].nome, "COMERCIAL VENDRAMINI LTDA");
  assert.equal(r.mercados[0].visitas, 2);
  assert.equal(r.mercados[0].comuns.length, 3);
  assert.ok(r.mercados[0].indice < 1 && r.mercados[1].indice > 1);
  assert.equal(r.mercados[1].notas[0].id, "4"); // mais recente primeiro
});

test("pratos guardados na geladeira e no congelador", () => {
  const g = { onde: "geladeira", guardado_em: "2026-10-11", porcoes: 3, comidas: 0, comeu: [] };
  assert.deepEqual(situacaoGuardado(g, "2026-10-11"), { dias: 0, restam: 3, alerta: null, texto: "guardado hoje" });
  assert.equal(situacaoGuardado(g, "2026-10-14").alerta, "logo");
  assert.equal(situacaoGuardado(g, "2026-10-15").alerta, "passou");
  assert.equal(situacaoGuardado({ ...g, onde: "congelador" }, "2026-10-15").alerta, null);
  assert.equal(situacaoGuardado({ ...g, onde: "congelador" }, "2027-01-10").alerta, "passou");
  const a = comerGuardado(g, 2, "2026-10-12", "rique");
  assert.deepEqual(a, { comidas: 2, comeu: [{ data: "2026-10-12", porcoes: 2, por: "rique" }], comido_em: null });
  const b = comerGuardado({ ...g, ...a }, 5, "2026-10-13");
  assert.equal(b.comidas, 3); assert.equal(b.comido_em, "2026-10-13"); assert.equal(b.comeu[1].porcoes, 1);
  const c = desfazerComida({ ...g, ...b });
  assert.deepEqual(c, { comidas: 2, comeu: a.comeu, comido_em: null });
});

test("refeição em destaque na tela Hoje", () => {
  assert.deepEqual(refeicoesDoMomento("2026-10-13", 23), [{ data: "2026-10-13", ref: "jantar" }, { data: "2026-10-14", ref: "almoco" }]);
  assert.deepEqual(refeicoesDoMomento("2026-10-14", 2), [{ data: "2026-10-14", ref: "almoco" }, { data: "2026-10-14", ref: "jantar" }]);
  assert.deepEqual(refeicoesDoMomento("2026-10-14", 13), [{ data: "2026-10-14", ref: "almoco" }, { data: "2026-10-14", ref: "jantar" }]);
  assert.deepEqual(refeicoesDoMomento("2026-10-14", 15), [{ data: "2026-10-14", ref: "jantar" }, { data: "2026-10-15", ref: "almoco" }]);
  assert.equal(horaBrasilia(new Date("2026-10-14T05:00:00Z")), 2);
});
