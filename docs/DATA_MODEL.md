# Modelo de dados — esquema SQLite v2

## Migração e compatibilidade

O esquema v1 é atualizado para v2 dentro de uma transação. Antes de alterar uma base existente em disco, é criada uma cópia binária `monitor.sqlite.pre-v2-<data>.sqlite`. Registos e histórico v1 não são renumerados nem eliminados. Versões desconhecidas são recusadas. A migração da antiga versão ZIP/store.json continua pendente por falta dos ficheiros originais.

Backups JSON v2 incluem o catálogo, zonas, diário completo de recolhas, observações, associações, anúncios, histórico, configurações e alertas. O restauro aceita também o formato v1. Após restauro, as autorizações de rede e intervalos automáticos das fontes são desativados para nova avaliação: um ficheiro importado não pode ativar recolha silenciosamente.

## Tabelas

- `meta`: versão, configurações, zona ativa, alertas e cache filtrada da descoberta OSM.
- `listings`: chave estável e registo normalizado. Anúncios de fontes distintas continuam separados.
- `history`: transições de preços, incluindo valores desconhecidos; diferenças calculadas na apresentação.
- `changes`: alterações de título, descrição, localização, área, tipologia, tipo, URL, tipo de área, negócio e concelho.
- `imports`: data e contagens de importação, conservadas da versão anterior.
- `sources`: domínio imutável, nome, categoria, cobertura indicada, origem, estados, método, condições/autorização, pesquisas por zona e configuração do conector.
- `zones`: país, concelho, localidades, centro/precisão, raio e critérios de negócio, preços, área e tipologia.
- `runs`: tentativas por fonte/zona com estado, páginas, contagens, completude, avisos e erro. A interface mostra as últimas 100; a exportação conserva todas.
- `observations`: observações por âmbito e anúncio; ausências consecutivas, primeira ausência e última recolha.
- `associations`: par de anúncios e decisão confirmed/rejected/pending; reversível, sem fusão física.

## Identidade e proveniência

A chave é `fonte:referência`. Sem referência explícita, usa pathname e parâmetros ordenados do URL, removendo apenas tracking reconhecido (utm_*, fbclid, gclid). Assim, páginas `detail?id=1` e `detail?id=2` não colidem. Referências explícitas são preferíveis; mudanças de referência continuam a exigir análise.

Proveniência conserva método e URL/data de obtenção quando disponíveis. A data da importação não é confundida com data de publicação. Datas explícitas com dia ou fuso são retidas; horas sem fuso não são inventadas. Preços originais e moeda podem ser retidos; moedas estrangeiras não são convertidas implicitamente para euros.

Preços normalizados são inteiros em cêntimos; null significa desconhecido, nunca zero. Áreas distinguem útil, bruta, terreno e desconhecida. Coordenadas têm precisão exact/approximate. Coordenadas publicadas em JSON-LD começam conservadoramente como aproximadas; o conector não transforma um pin aproximado numa morada exata.

## Geografia e âmbito de recolha

O modo administrativo usa correspondência textual e avisa que não valida polígonos oficiais. Localidades isoladas sem concelho suficiente podem ficar por confirmar. O modo raio exige coordenadas precisas no anúncio e centro: coordenadas aproximadas não confirmam inclusão. Não existe geocodificação automática.

Anúncios com negócio desconhecido podem aparecer com aviso de confirmação pendente; não são apresentados como venda/arrendamento comprovados. Filtros de preço e área só usam valores conhecidos quando necessários.

O âmbito das ausências é um hash de fonte, URL da pesquisa ativa, configuração do conector e zona/critérios. Alterar pesquisa ou critérios cria outro âmbito. Só uma recolha completa, sem erros/avisos e com exaustividade explicitamente confirmada pode atualizar ausências. Uma importação ou recolha parcial nunca o faz.

Política: primeira ausência mantém ativo; pelo menos duas recolhas completas e 24 horas desde a primeira ausência permitem potencialmente indisponível; pelo menos três e 48 horas permitem indisponível. Reaparecimento repõe ativo sem criar novo anúncio. É uma classificação conservadora de observação, não confirmação de venda.

## Descoberta OSM

Retém apenas identificadores, nome/categoria, site e evidência necessários. Telefones/e-mails e outros tags desnecessários são filtrados antes da cache persistente. Cache de 24 horas. Dados de descoberta mantêm atribuição ODbL e não constituem anúncios. Uma área administrativa inexistente ou ambígua produz erro, não uma conclusão falsa de zero agências.

## Atualização 0.3

As tabelas mantêm esquema v2. Registos acrescentam observedFields (presença semântica), fieldObservedAt (data por campo) e preservedFields (campos conservados). A importação usa o mesmo cálculo de alterações na revisão e na gravação; campos ausentes não apagam dados. Novos eventos de metadados podem incluir publicação, atualização, moeda original, país ou coordenadas.

O formato de backup passa a JSON v3 para identificar essa evolução; o leitor 0.3 continua compatível com JSON v1/v2. Reveja IMPORT_WORKFLOW.md. As descrições anteriores do formato v2 referem-se à versão 0.2.
