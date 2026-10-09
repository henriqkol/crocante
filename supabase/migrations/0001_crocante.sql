-- =====================================================================
-- Crocante — tabelas do app de cardápio e compras.
--
-- Mora no mesmo projeto Supabase do Finanças da Casa (hisraarbwhuhovommgqo) e reaproveita:
--   • o login com Google (auth.users, travado só para Google pela 0015 do Finanças);
--   • as casas e os convites: casas, membros, usuarios, casa_atual(), entrar(), trocar_casa(), minhas_casas().
-- Tudo aqui tem o prefixo croc_ e a mesma regra de segurança do Finanças: cada linha pertence a uma casa
-- e só quem está com aquela casa aberta enxerga (casa_id = casa_atual()).
-- =====================================================================

-- Configuração de cada casa no Crocante
create table if not exists croc_config (
  casa_id int primary key default casa_atual() references casas(id) on delete cascade,
  orcamento numeric(10,2) not null default 1600 check (orcamento > 0),
  pessoas int not null default 2 check (pessoas between 1 and 12),
  congelador int not null default 10 check (congelador between 2 and 60),
  atualizado_em timestamptz not null default now()
);
comment on table croc_config is 'Crocante: orçamento do mês, pessoas e espaços no congelador de cada casa.';

-- Um plano = 4 semanas a partir de um domingo
create table if not exists croc_planos (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  inicio date not null check (extract(dow from inicio) = 0),
  orcamento numeric(10,2) not null,
  pessoas int not null default 2,
  criado_por text,
  criado_em timestamptz not null default now(),
  unique (casa_id, inicio)
);
comment on table croc_planos is 'Crocante: plano de 4 semanas (cardápio + compras) que começa num domingo.';

-- Compra do mês e compras de cada semana
create table if not exists croc_compras (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  plano_id uuid not null references croc_planos(id) on delete cascade,
  tipo text not null check (tipo in ('mes', 'semana')),
  semana int check (semana between 1 and 4),
  data date not null,
  pago numeric(10,2),
  feita_em timestamptz,
  unique (plano_id, tipo, semana)
);
comment on table croc_compras is 'Crocante: compras do plano. pago fica vazio até a nota ser salva (ou o valor ser digitado).';

create table if not exists croc_itens (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  compra_id uuid not null references croc_compras(id) on delete cascade,
  chave text,
  nome text not null,
  qtd numeric(10,3) not null,
  unidade text not null,
  preco numeric(10,2) not null,
  local text not null check (local in ('c', 'g', 'd', 'h')),
  coringa boolean not null default false,
  congela boolean not null default false,
  ordem int not null default 0,
  marcado boolean not null default false,
  marcado_por text,
  marcado_em timestamptz
);
comment on table croc_itens is 'Crocante: itens de cada compra. marcado = já está no carrinho (os moradores veem ao vivo).';

create table if not exists croc_cardapio (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  plano_id uuid not null references croc_planos(id) on delete cascade,
  data date not null,
  refeicao text not null check (refeicao in ('almoco', 'jantar')),
  prato int not null check (prato between 1 and 30),
  unique (plano_id, data, refeicao)
);
comment on table croc_cardapio is 'Crocante: almoço e jantar de cada dia do plano (pode ser trocado no app).';

create table if not exists croc_notas (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  compra_id uuid references croc_compras(id) on delete set null,
  chave text,
  emitente text,
  emissao timestamptz,
  total numeric(10,2),
  linhas jsonb not null default '[]',
  conta_no_plano numeric(10,2) not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  unique (casa_id, chave)
);
comment on table croc_notas is 'Crocante: notas fiscais escaneadas. linhas = [{descricao, valor, item_id, removido}]; removido = fora do plano.';

-- Aparelhos que recebem avisos (cada pessoa no próprio celular). O servidor lê com a chave de serviço.
create table if not exists croc_push (
  endpoint_hash text primary key,
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  assinatura jsonb not null,
  prefs jsonb not null default '{"hora": 20, "desc": true, "merc": true, "prep": true, "nota": true, "jantar": false, "orc": true, "casa": true}',
  criado_em timestamptz not null default now()
);
comment on table croc_push is 'Crocante: inscrição de Web Push por aparelho e as preferências de aviso de cada pessoa.';

-- Avisos já enviados (para não repetir)
create table if not exists croc_avisos (
  casa_id int not null references casas(id) on delete cascade,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (casa_id, chave)
);

create index if not exists croc_compras_plano_idx on croc_compras (plano_id);
create index if not exists croc_itens_compra_idx on croc_itens (compra_id);
create index if not exists croc_cardapio_plano_idx on croc_cardapio (plano_id, data);
create index if not exists croc_notas_compra_idx on croc_notas (compra_id);
do $$ declare t text; begin
  foreach t in array array['croc_config','croc_planos','croc_compras','croc_itens','croc_cardapio','croc_notas','croc_push'] loop
    execute format('create index if not exists %I on %I (casa_id)', t || '_casa_idx', t);
  end loop;
end $$;

-- ---------- Segurança: cada casa só vê o que é dela ----------------------------------
do $$ declare t text; begin
  foreach t in array array['croc_config','croc_planos','croc_compras','croc_itens','croc_cardapio','croc_notas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists casa_tudo on %I', t);
    execute format('create policy casa_tudo on %I for all to authenticated using (casa_id = (select casa_atual())) with check (casa_id = (select casa_atual()))', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

alter table croc_push enable row level security;
drop policy if exists proprio on croc_push;
create policy proprio on croc_push for all to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')))
  with check (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) and casa_id = (select casa_atual()));
grant select, insert, update, delete on croc_push to authenticated;
revoke all on croc_push from anon;

alter table croc_avisos enable row level security;
revoke all on croc_avisos from anon, authenticated;

-- Moradores da casa aberta (nome e foto vêm do Google), sem os robôs do Finanças
create or replace function croc_moradores() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'email', m.email, 'aceito', m.aceito_em is not null,
    'nome', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(m.email, '@', 1)),
    'foto', u.raw_user_meta_data ->> 'avatar_url') order by m.aceito_em nulls last, m.criado_em), '[]')
  from membros m left join auth.users u on lower(u.email) = m.email
  where m.casa_id = casa_atual() and not public.e_robo(m.email)
$$;
revoke execute on function croc_moradores() from public, anon;
grant execute on function croc_moradores() to authenticated;

-- Marcações do carrinho aparecem ao vivo para os outros moradores
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'croc_itens') then
    alter publication supabase_realtime add table croc_itens;
  end if;
end $$;

-- ---------- Lembretes agendados -----------------------------------------------------
-- A função "crocante" decide o que mandar em cada horário (14h, 18h e 19h/20h/21h em Brasília).
create or replace function croc_disparar_lembretes() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  base text := (select valor from app_config where chave = 'functions_url');
  segredo text := (select valor from app_config where chave = 'cron_secret');
begin
  if base is null then return; end if;
  perform net.http_post(
    url := base || '/crocante/lembretes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', segredo),
    body := '{"origem":"agendado"}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function croc_disparar_lembretes() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('crocante-lembretes') where exists (select 1 from cron.job where jobname = 'crocante-lembretes');
  -- 17h, 21h, 22h, 23h e 0h UTC = 14h, 18h, 19h, 20h e 21h em Brasília
  perform cron.schedule('crocante-lembretes', '1 17,21,22,23,0 * * *', 'select public.croc_disparar_lembretes()');
end $$;
