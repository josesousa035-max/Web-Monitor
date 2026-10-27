# Importação revista — 0.3

## Utilização

Em Fontes, selecione Importar anúncios e escolha um ficheiro. A aplicação prepara uma revisão com totais e amostra de até 40 anúncios: novos, conhecidos, alterações de preço, alterações de metadados e campos antigos conservados. O limite é 10 MB e 10.000 anúncios por revisão.

Nenhum anúncio, alerta, diário ou backup é gravado ao preparar/cancelar. Na confirmação é criado um backup preventivo e a alteração da base é transacional. Se a gravação falhar, os dados voltam ao estado anterior; o backup preventivo pode permanecer como cópia recuperável. O diário é dividido pelas fontes realmente presentes num ficheiro misto.

Uma revisão dura 15 minutos e só pode ser confirmada uma vez. Outra revisão invalida a anterior. Se entretanto houver uma atualização, restauro, alteração de configurações ou catálogo, é preciso rever novamente. Só o token é enviado para confirmar/cancelar; o renderer não escolhe caminhos arbitrários ou substitui os anúncios revistos.

## Campos ausentes e desconhecidos

- Campo omitido ou string vazia: não constitui nova informação; conserva o valor anterior, se existir.
- `null` explícito num JSON normalizado: valor observado como desconhecido; pode substituir o anterior. Exemplo `"price": null` não é zero.
- Zero monetário: valor conhecido de zero, distinto de desconhecido. A aplicação não o interpreta como preço sob consulta.
- Células CSV vazias: conservam valores anteriores. Para limpar explicitamente, use JSON com null.
- Datas inválidas, sem fuso quando incluem hora ou com calendário impossível: não substituem datas válidas anteriores.
- Novo valor de área sem tipo: fica com tipo desconhecido; não herda uma classificação antiga. Para mudar apenas o tipo, forneça também o valor observado de área. Não rotular uma área antiga como útil/terreno sem nova observação.
- Preço novo não herda uma moeda/preço original de outra observação. Valores estrangeiros não são convertidos automaticamente.

`observedFields` é metadado interno dos registos normalizados, não é necessário nos ficheiros criados pelo utilizador. `fieldObservedAt` guarda datas por campo e `preservedFields` identifica informação conservada. A última observação do anúncio não prova que todos os seus campos foram novamente publicados/confirmados.

## HTML e e-mail

`readImportResult` devolve dados e avisos para revisão; `readImport` rejeita parcialidade por omissão. Se alguns anúncios não puderem ser interpretados, a revisão exige confirmação explícita para importar os válidos. Referências contraditórias são excluídas, em vez de escolher silenciosamente um preço/área. O formato totalmente não reconhecido é um erro, não um ficheiro vazio bem-sucedido.

Os avisos e a amostra não validam compatibilidade com um portal real. É necessário direito de processar o ficheiro. HTML/scripts/recursos remotos nunca são executados. Nenhuma importação infere remoções a partir de ausências.

## Diagnóstico

A página Diagnóstico consulta configuração, diário e `PRAGMA quick_check` da base carregada. Mostra pesquisa por zona, método, autorização documentada, programação e última tentativa. Pesquisa todo o diário por fonte, mesmo quando a lista de execuções da interface mostra só 100 entradas.

Não faz pedidos de rede, não testa escrita no disco e não transforma configuração em conectividade comprovada. Mensagens brutas, evidência textual de autorização, caminhos locais e variáveis de ambiente não são incluídos. A preview demonstra a interface, sem SQLite real.

## Compatibilidade

O esquema de tabelas permanece SQLite v2. Os novos metadados JSON são opcionais, sem reescrever dados antigos. O backup exportado tem versão 3 e conserva esse contexto; a aplicação 0.3 lê formatos 1, 2 e 3. Versões antigas podem não suportar v3, por isso um downgrade exige uma cópia compatível anterior.
