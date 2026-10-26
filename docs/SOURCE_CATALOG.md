# Catálogo de fontes e investigação — 0.2.0

Verificações efetuadas em 26 de outubro de 2026. Zona-piloto: Póvoa de Lanhoso, compra de imóveis. O catálogo da aplicação deixou de estar limitado a três fontes; podem ser acrescentados domínios pelo formulário, por referências importadas ou pelo fornecedor de descoberta OSM.

## Fontes iniciais efetivamente investigadas

| Fonte | Proveniência e cobertura | Evidência consultada | Resultado real |
| --- | --- | --- | --- |
| Idealista | Indicada pelo utilizador; pesquisa de Póvoa de Lanhoso fornecida | Homepage, robots.txt, condições e página inicial do diretório de agências | Condições restringem monitorização/cópia sem autorização escrita. Recolha desativada; sem anúncios extraídos nesta investigação. |
| RE/MAX | Indicada pelo utilizador; URL filtrado ainda não confirmado | Homepage, robots.txt, ligação a condições e diretório público de agências | Homepage acessível; diretório anunciava 414 agências, sem confirmação de agências no concelho no conteúdo examinado. Condições não ficaram legíveis no HTML obtido. Sem integração validada. |
| Boulder Imobiliária | Pequena agência indicada pelo utilizador; filtros de pesquisa preservados | robots.txt | Resposta 200, regra geral sem exclusão e exclusão específica para GPTBot. Não foi inferida autorização de recolha; fonte manual, sem extração validada. |

A cobertura inicial é **indicada pelo utilizador**, não uma auditoria atual da quantidade de imóveis. Não se guardaram anúncios reais ou contactos pessoais. A página inicial do diretório Idealista foi recebida durante a avaliação; após ler a restrição das condições, não se avançou na recolha de agências/anúncios desse diretório.

## Referências verificáveis

- Idealista: https://www.idealista.pt/
- Pesquisa fornecida: https://www.idealista.pt/comprar-casas/povoa-de-lanhoso/
- Condições: https://www.idealista.pt/apoioutilizador/artigos/aviso-legal-e-condicoes-gerais/
- Diretório ligado pela homepage: https://www.idealista.pt/escolher-agencia-imobiliaria/
- RE/MAX: https://remax.pt/
- Diretório ligado pela homepage: https://remax.pt/pt/agencias
- Condições ligadas pela homepage: https://remax.pt/pt/institucional/termosutilizacao
- Boulder: https://boulderimobiliaria.pt/robots.txt

Trecho relevante das condições Idealista recebidas: “Aceder, monitorizar ou copiar qualquer informação [...] utilizando qualquer tipo de robot, spider, scraper ou outro meio automático ou processo manual para tal finalidade, sem a nossa autorização expressa por escrito.” A existência de acesso HTTP ou de regras robots permissivas não substitui essa autorização. Importar ficheiros também exige que o utilizador tenha direito a processá-los.

## Descoberta mais ampla: implementada, execução externa bloqueada

Foram tentados acessos aos motores Bing, Google e DuckDuckGo. O acesso foi recusado com 403. Também foi tentada uma consulta pública documentada ao endpoint Overpass `https://overpass-api.de/api/interpreter`, para procurar elementos OSM `office=estate_agent` e `shop=estate_agent` na área administrativa de Póvoa de Lanhoso: resposta 403.

Não foi possível confirmar novas imobiliárias independentes além das fontes fornecidas. **Zero novas agências foram verificadas nesta execução; zero conectores de portais foram validados com anúncios reais.** Isto é uma limitação da investigação, não prova de ausência de agências ou de anúncios.

Os domínios de pesquisa e Overpass foram acrescentados ao rascunho de rede do ambiente, preservando os domínios anteriores. O rascunho não prova que a rede de execução foi atualizada. É necessário rever/gravar as definições e publicar o ambiente, conforme o fluxo da plataforma, e testar novamente.

## Como a aplicação descobre novas fontes

1. **OpenStreetMap/Overpass, opcional:** pesquisa agências mapeadas e sites indicados. Guarda candidatos por domínio, atribuição e ligação ao elemento OSM. Não visita automaticamente os sites descobertos. Uma agência estar mapeada na zona não confirma cobertura comercial nem imóveis disponíveis. Dados OSM podem estar incompletos/desatualizados.
2. **Pesquisa assistida:** gera consultas para o concelho/localidades e permite abri-las no navegador. Não raspa resultados de motores nem afirma ter executado essas pesquisas.
3. **Referências importadas:** JSON, CSV ou HTML que o utilizador tenha direito a processar. Deduplicação por domínio, sinais de relevância textual e entrada em estado Descoberta. Menções em excertos são pistas, nunca preços ou cobertura confirmados.
4. **Adição manual:** registo de site, pesquisa por zona e condições, sem alterar código.

O catálogo começa apenas com as três fontes conhecidas. Não foi preenchido com empresas ou URLs locais inventados. Não há garantia de cobertura completa nem percentual de mercado.

## Continuação da investigação

Quando existir acesso: repetir os pedidos bloqueados; examinar resultados por localidade e fontes independentes; verificar sites oficiais e cobertura em anúncios atuais; registar condições e meios permitidos; só então configurar e validar conectores com exemplos representativos. Pesquisas adicionais devem parar quando deixarem de acrescentar fontes úteis, sem transformar uma meta de quantidade em integrações superficiais.
