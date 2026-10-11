-- Crocante: apelidos dos mercados. O mercado é identificado pelo CNPJ que vem na chave da NFC-e
-- (dígitos 7 a 20); sem chave, por "nome:<EMITENTE NORMALIZADO>". O nome da nota continua guardado em croc_notas.emitente.
create table if not exists croc_mercados (
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  mercado text not null,
  apelido text not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  primary key (casa_id, mercado)
);
comment on table croc_mercados is 'Crocante: apelido que a casa deu a cada mercado (CNPJ da nota).';
alter table croc_mercados enable row level security;
drop policy if exists casa_tudo on croc_mercados;
create policy casa_tudo on croc_mercados for all to authenticated using (casa_id = (select casa_atual())) with check (casa_id = (select casa_atual()));
grant select, insert, update, delete on croc_mercados to authenticated;
revoke all on croc_mercados from anon;
