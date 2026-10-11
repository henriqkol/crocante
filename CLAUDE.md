# Crocante — notas para o Claude

App de cardápio, compras por semana e orçamento de mercado do Rique (e da esposa). Tudo em português.
Nasceu do "Plano Crocante do Mês": 2 pessoas, R$ 1.600, sem legumes nem frutas, crocância em todo prato, preparo no domingo e refeições de até 15 minutos.

## Arquitetura (mesmo padrão do Finanças da Casa)
- `app/` — PWA sem build (ES modules, supabase-js via jsdelivr). Publicado em https://henriqkol.github.io/crocante/ : o workflow `publicar-app.yml` copia `app/` (e `privacidade.html`) para o ramo `gh-pages` a cada push em `main`.
  - `dados.js` — conteúdo do plano (30 pratos e receitas, cardápio das 4 semanas, preparo de domingo, sorteio, café, doces, dicas). Gerado do plano original; editar à mão.
  - `compras.js` — `SECOES` (seções do mercado, na ordem da volta no supermercado; a lista de compras agrupa por elas, `croc_itens.secao` sobrescreve) e o modelo das compras para 2 pessoas: `MES` (compra do mês: despensa, higiene e limpeza) e `SEMANA` (compra de cada sábado, `q` = quantidade em cada semana). `busca` = regex para reconhecer o produto na nota (texto normalizado: maiúsculas, sem acento).
  - `logica.js` — lógica pura (datas, gerar plano, escala por pessoas, congelador, orçamento, casar nota × lista, lembretes). Usada pelo app, pela função e pelos testes.
  - `app.js` — telas e ações (rotas por hash: hoje, semana, prato, compras, ideias, grana, escanear, nota, comparar, casa, avisos, novo-plano).
- **Banco**: no projeto Supabase do Finanças (`hisraarbwhuhovommgqo`, plano grátis só permite 2 projetos). Tabelas `croc_*` em `public` (migrações em `supabase/migrations/`, aplicar com `apply_migration`). Reaproveita do Finanças: login só Google (0015 de lá), `casas`, `membros` (convite = inserir e-mail), `usuarios`, `casa_atual()`, `entrar()`, `trocar_casa()`, `minhas_casas()`. RLS em tudo: `casa_id = casa_atual()`. A casa aberta é a mesma nos dois apps. Casa 1 = Rique e Laynara.
  - Plano = 4 semanas a partir de um domingo (`croc_planos`), 5 compras (`croc_compras`: mês + semanas 1–4, sempre no sábado antes do domingo do preparo), itens (`croc_itens`, `marcado` ao vivo via Realtime), cardápio (`croc_cardapio`, trocável), notas (`croc_notas.linhas` jsonb com `item_id` e `removido`), avisos (`croc_push` por aparelho, `croc_avisos` evita repetição).
  - `croc_compras.pago` = soma de `conta_no_plano` das notas da compra (ou valor digitado sem nota).
- `supabase/functions/crocante/index.ts` — Edge Function (Deno): `/chave`, `/nfce`, `/testar`, `/avisar`, `/lembretes` (cron). Reaproveita `lib/nfce.ts` e `lib/webpush.ts` do Finanças fixados num commit do repositório público, e importa `app/logica.js` deste repositório. Chaves VAPID e `cron_secret` vêm de `app_config` (as mesmas do Finanças).
  - Deploy: push em `main`, depois `deploy_edge_function` (nome `crocante`, `verify_jwt: false`) com um `index.ts` de uma linha: `import "https://raw.githubusercontent.com/henriqkol/crocante/<commit>/supabase/functions/crocante/index.ts";`
  - pg_cron `crocante-lembretes` (`1 17,21,22,23,0 * * *` UTC = 14h, 18h, 19h, 20h, 21h em Brasília) chama `/crocante/lembretes`.
- `tests/` — `node --test tests/logica.test.mjs`.

## Notas fiscais
- Compra concluída (fundo cinza `--ink-2` no seletor) = paga e cada item ativo veio numa nota, foi movido (`croc_itens.movido_para`, a cópia vai para a outra compra e o original sai do planejado; no app fica em `c.movidos`) ou removido. Paga sem nota também conta como concluída.
- Uma compra pode ter várias notas; `pago` = soma de `conta_no_plano`. O comparativo (`telaComparar`) junta as linhas de todas as notas da compra.
- Notas salvas reabrem pela lista "Notas desta compra" (tela Compras) para trocar vínculos, tirar do plano ou apagar; o rascunho em revisão fica em `localStorage.crocRascunho` até salvar.
- Lista de compras mostra, por item ligado a nota, valor planejado com "pago" abaixo e quantidade planejada com "comprou" abaixo (`quantidadeComprada`: converte as linhas para a unidade do item; peso da embalagem vem da descrição, ex. "700G"; 5% de tolerância no peso). Só exibe, não altera `qtd` do item.
- Casamento nota × lista (`casarNota`): primeiro o que a casa ensinou (`croc_aprendizado`: texto da nota sem números/unidades → chave do item, `nome:<NOME>` ou `fora`), depois as regras `busca`. Sem par: `sugerirItens` mostra os mais parecidos (abreviações, marcas no meio, trigramas). Toda escolha manual (`manual: true`) vira aprendizado ao salvar.

## Regras do plano
- Pratos só mudam de dia dentro da mesma semana ("Mudar de dia" troca dois lugares do `croc_cardapio`), então as compras continuam cobertas.
- Preparo de domingo calculado pelo cardápio real (`preparoDaSemana`): bases de cada prato vêm de `RECEITAS[id].pre` (`basesDoPrato`); cozidos: domingo fresco, até quarta geladeira, quinta–sábado congelador; bolinhas cruas até terça na geladeira; empanados sempre no congelador; sobrecoxa/linguiça vêm congeladas da compra. Descongelar = véspera do dia do prato. "Separe" e as levas continuam do plano original (os pratos da semana são os mesmos).
- Medidor do congelador = saquinhos calculados + itens `congela` da semana + 1 (bacon do mês). Capacidade em `croc_config.congelador`.
- Pessoas multiplica as quantidades (kg em passos de 50 g, unidades para cima). Vale para planos novos.
- Lembretes na véspera (19h/20h/21h, escolha de cada aparelho): descongelar (`descongelarParaAmanha`, pelo cardápio real), mercado de amanhã, preparo de domingo. 14h: escanear nota da compra de hoje. 18h: jantar (desligado por padrão). Orçamento: aviso único por plano quando a sobra prevista fica < R$ 30 ou negativa (após salvar compra).

## Visual
Design system GranDom (fontes Doto, Space Grotesk, Space Mono em `app/fonts`). Tema escuro padrão, claro pelo aparelho ou em Casa → Aparência. Ícone: caixinha de batata frita em pixel (`app/icons`).
