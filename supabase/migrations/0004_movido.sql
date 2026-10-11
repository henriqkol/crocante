-- Crocante: item passado para outra compra (a cópia fica lá); não conta mais nesta compra nem no planejado dela.
alter table croc_itens add column if not exists movido_para uuid references croc_compras(id) on delete set null;
comment on column croc_itens.movido_para is 'Crocante: item passado para outra compra (a cópia fica lá); não conta mais nesta compra.';
