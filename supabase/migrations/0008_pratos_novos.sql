-- Crocante: pratos acrescentados depois do plano original (31 = Pão com ovo). O limite de 30 vira 999.
alter table croc_cardapio drop constraint if exists croc_cardapio_prato_check;
alter table croc_cardapio add constraint croc_cardapio_prato_check check (prato between 1 and 999);
