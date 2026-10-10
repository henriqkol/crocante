-- Crocante: o que cada casa ensinou ao app ao revisar as notas.
-- texto = descrição da nota sem números e unidades ("BATATA UAI 2KG" → "BATATA UAI");
-- destino = chave do item do modelo ("batata-frita"), "nome:<NOME>" para itens adicionados à mão, ou "fora" (não é do plano).
create table if not exists croc_aprendizado (
  casa_id int not null default casa_atual() references casas(id) on delete cascade,
  texto text not null,
  destino text not null,
  criado_por text,
  atualizado_em timestamptz not null default now(),
  primary key (casa_id, texto)
);
comment on table croc_aprendizado is 'Crocante: vínculos nota → item da lista que a casa corrigiu ou confirmou; valem nas próximas notas.';
alter table croc_aprendizado enable row level security;
drop policy if exists casa_tudo on croc_aprendizado;
create policy casa_tudo on croc_aprendizado for all to authenticated using (casa_id = (select casa_atual())) with check (casa_id = (select casa_atual()));
grant select, insert, update, delete on croc_aprendizado to authenticated;
revoke all on croc_aprendizado from anon;
