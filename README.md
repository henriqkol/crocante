# Crocante

Cardápio, compras por semana e orçamento de mercado da casa, com crocância em todo prato.

**App:** https://henriqkol.github.io/crocante/ (instale na tela de início pelo menu do navegador)

- Entrar com Google; a casa é compartilhada com quem você convidar (as mesmas casas do Finanças da Casa).
- Plano de 4 semanas: cardápio com 30 pratos, preparo de domingo e refeições de até 15 minutos.
- Compra do mês (despensa, higiene e limpeza) e uma compra por semana, no sábado antes do preparo, para caber no congelador.
- Lista marcada ao vivo entre os moradores.
- Escaneie o QR code da nota fiscal: o app separa o que é do plano, deixa remover o que não é e compara com o planejado.
- Lembretes: descongelar na véspera, dia de mercado, preparo de domingo, nota da compra e orçamento.
- Tema escuro e claro.

## Desenvolvimento

- `app/` — o app (sem build). Para testar localmente: `npx serve app` e abra o endereço mostrado (o login com Google só volta para endereços autorizados no Supabase).
- `supabase/` — tabelas (`migrations/`) e a função `crocante`.
- Testes: `node --test tests/logica.test.mjs`.

Detalhes de arquitetura em [CLAUDE.md](CLAUDE.md).
