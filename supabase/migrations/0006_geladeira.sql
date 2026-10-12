-- Crocante: pratos prontos guardados na geladeira ou no congelador (tela Geladeira).
-- prato_id = prato do app (dados.js) ou null para pratos digitados; comeu = [{data, porcoes, por}];
-- comido_em = dia em que a última porção foi comida (null = ainda tem).
create table if not exists croc_geladeira (
  id uuid primary key default gen_random_uuid(),
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  prato_id int,
  nome text not null,
  onde text not null default 'congelador' check (onde in ('geladeira', 'congelador')),
  porcoes int not null default 1 check (porcoes > 0),
  comidas int not null default 0 check (comidas >= 0),
  guardado_em date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  comido_em date,
  comeu jsonb not null default '[]',
  criado_por text,
  criado_em timestamptz not null default now()
);
comment on table croc_geladeira is 'Crocante: pratos prontos na geladeira/congelador, com data em que foram guardados e comidos.';
create index if not exists croc_geladeira_casa on croc_geladeira (casa_id, comido_em);
alter table croc_geladeira enable row level security;
drop policy if exists casa_tudo on croc_geladeira;
create policy casa_tudo on croc_geladeira for all to authenticated using (casa_id = (select casa_atual())) with check (casa_id = (select casa_atual()));
grant select, insert, update, delete on croc_geladeira to authenticated;
revoke all on croc_geladeira from anon;
