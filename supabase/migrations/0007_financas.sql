-- Crocante → Finanças: a nota salva no Crocante também entra no Finanças da Casa (mesmo banco, mesmo login).
-- qr = texto original do QR code (o Finanças consulta a SEFAZ com ele); financas_id = notas.id do Finanças depois de enviada.
alter table croc_notas add column if not exists qr text;
alter table croc_notas add column if not exists financas_id uuid;
comment on column croc_notas.financas_id is 'Crocante: id da mesma nota na tabela notas do Finanças (null = ainda não enviada).';
