# Guia de conectores e descoberta

## Registar uma fonte

Use Fontes → Adicionar fonte. O domínio tem de ser HTTPS público e não pode colidir com outro registo. Acrescente pesquisas específicas por zona; mudar para uma zona sem pesquisa configurada não reutiliza silenciosamente o URL de outra zona. Cobertura indicada deve ser distinguida de cobertura verificada em anúncios.

A importação normalizada JSON/CSV funciona para qualquer fonte registada. Os URLs dos anúncios têm de pertencer ao domínio ou subdomínios da fonte. Não altere a lista de fontes no código para acrescentar uma agência.

## Recolha autorizada

A configuração avançada permite JSON-LD, seletores HTML ou feed RSS/Atom. Antes de ativar: registe URL das condições e a base de autorização, confirme método/pesquisa e marque a autorização conscientemente. Não use essa opção para contornar restrições conhecidas. As fontes iniciais não trazem autorização ativa.

`src/core/collector.cjs` oferece `collect(source, zone, client, options)` e `updateSource(store, sourceId, zoneId, options)`. O primeiro não altera a base. O segundo coordena importação, alertas, âmbito de ausências e diário numa transação; suporta backup preventivo por callback. Pedidos sobrepostos da mesma fonte são recusados.

O parser devolve `{listings, warnings, nextUrls, explicitEmpty}`. Nunca devolva zero silenciosamente por alteração do site. Um seletor de vazio explicitamente configurado é necessário para reconhecer uma página HTML vazia. Uma falha intermédia invalida a recolha inteira; páginas limitadas ou avisos produzem parcial e não permitem ausências.

### HTML por seletores

Exemplo exclusivamente sintético, a adaptar e testar contra a fonte autorizada:

```json
{
  "item": "article.property",
  "title": "h2",
  "url": "a.details",
  "reference": ".reference",
  "price": ".price",
  "area": ".area",
  "location": ".location",
  "municipality": ".municipality",
  "next": "a[rel=next]",
  "empty": ".no-results"
}
```

O preço deve ser um texto monetário limpo, não uma mistura de preço anterior, prestação e preço atual. O tipo de área deve ser configurado com evidência. Não selecione área de terreno como área útil. Feeds só usam campos de preço explícitos com moeda EUR; não procuram números em títulos para adivinhar preços.

JSON-LD trata blocos/graph e referências @id, oferta, nome, URL, localização, datas e área com unidades reconhecidas. Ausência de moeda não autoriza assumir euros sem configuração explícita. Dados estrangeiros conservam o original e deixam o preço normalizado desconhecido. O suporte genérico não prova compatibilidade com qualquer portal.

## Rede

`SafeClient` valida HTTPS, domínio autorizado, DNS público e cada redirecionamento. A ligação usa o endereço validado, mantendo SNI e verificação TLS. Rejeita endereços privados, loopback, link-local e famílias reservadas reconhecidas. Testes demonstram rejeição antes do transporte.

Há timeout, cancelamento, concorrência por host, intervalo mínimo, retries limitados para 429/5xx, respeito por Retry-After, limite de resposta descomprimida de 2 MB, ETag/Last-Modified e cache em memória limitada a 20 entradas/8 MiB. robots.txt é consultado, mas não substitui autorização. Falhas ao obter robots interrompem, exceto 404 após autorização explícita.

`HTTPS_PROXY`/`https_proxy` e `NO_PROXY`/`no_proxy` são considerados. O túnel CONNECT usa o IP público validado e TLS para o hostname original. Proxies que só aceitam CONNECT por nome podem recusar esse modo; a aplicação falha sem contornar o proxy ou desativar validações. A integração com o proxy desta cloud não foi validada ao vivo. DNS público inacessível também impede recolha de forma segura.

A atualização periódica usa a zona ativa, intervalos de pelo menos 60 minutos, sem sobreposição e com recuo progressivo após falhas. Só existe enquanto o processo Electron está ativo; fechar todas as janelas no macOS pode manter o processo aberto segundo o comportamento normal da plataforma. Sair/Encerrar a aplicação termina a programação. Não há serviço instalado ou promessa de execução depois de encerrar.

## Validar uma integração

1. Obter evidência de acesso permitido e exemplos representativos.
2. Testar vários anúncios, campos, preços desconhecidos e paginação.
3. Comparar resultados com a origem sem inventar informação.
4. Testar páginas alteradas, bloqueios, falhas e vazios explícitos.
5. Só confirmar exaustividade quando a pesquisa completa for compreendida.
6. Documentar data, URL, limitações e resultados em SOURCE_CATALOG/TEST_REPORT.

A interface permite avaliação e semiautomatização. Nesta entrega não existe fonte inicial classificada como automática validada nem um fluxo que atribua essa classificação sozinho a partir de HTTP 200. Uma validação real por fonte continua pendente.

## Descoberta

`osm-discovery.cjs` consulta a API pública Overpass, sem scraping de motores de pesquisa. Na descoberta administrativa atual suporta Portugal e exige uma área inequívoca; por raio, exige centro e limita a consulta a 50 km. Falhas/remark de timeout não são zero resultados. Dados incompletos do OSM não provam ausência de agências. Sites HTTP não são reescritos para HTTPS sem verificação: ficam em avisos para avaliação manual.

`discovery.cjs` gera um plano de pesquisa e importa referências autorizadas. Termos e localidade ajudam a ordenar candidatos; não confirmam cobertura. Nenhum site descoberto é visitado ou autorizado automaticamente.

Use `npm test`. Os testes de transporte local exigem OpenSSL; quando indisponível, esse teste é explicitamente ignorado pelo runner. `npm run test:desktop` exige sessão gráfica e sandbox utilizável, e não é substituído pelos testes DOM.

## Atualização 0.3: observações e revisão

Os parsers conservam presença dos campos: falta de preço/área não equivale a um null explícito num ficheiro normalizado. readImportResult devolve dados/avisos para revisão e readImport recusa parcialidade por omissão. A interface usa prepareImport/confirmImport/cancelImport; o helper de extração de HTML não deve ser usado para gravar diretamente na base.

JSON-LD/HTML/RSS reconciliam dados complementares da mesma referência e excluem referências contraditórias. RSS também segue next dentro do domínio. O cliente SafeClient é reutilizado entre atualizações, conservando cache/intervalos. Os testes continuam a usar exemplos locais; estas alterações não validam qualquer portal real.
