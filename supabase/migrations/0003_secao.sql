-- Crocante: seção do mercado escolhida à mão para itens da lista (vazia = a do modelo, pela chave).
alter table croc_itens add column if not exists secao text;
comment on column croc_itens.secao is 'Crocante: seção do mercado escolhida à mão (vazia = a do modelo, pela chave).';
