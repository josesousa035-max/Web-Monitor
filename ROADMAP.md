# Roadmap — estado da versão 0.2.0

## Concluído e verificado localmente

- Auditoria: base existente preservada; 22 testes anteriores aprovados antes de alterar.
- Catálogo persistente de fontes arbitrárias por domínio e pesquisas independentes por zona.
- Zonas, critérios, geografia com precisão explícita e zona ativa persistida.
- Migração SQLite v1→v2 com backup binário e compatibilidade de backups JSON v1/v2.
- Importação genérica de novas agências, proveniência, preços e alterações de metadados.
- Plano de descoberta e importação de referências sem presumir cobertura.
- Implementação opcional OSM com cache/atribuição, testada com dados sintéticos.
- Motor de recolha autorizado JSON-LD, HTML e RSS, testado com exemplos locais e falhas.
- DNS/redirecionamentos, TLS local real, descompressão, limites e cache testados.
- Âmbitos e política de ausências completos/parciais testados; associações reversíveis.
- Interface e preview com zonas, catálogo, descoberta e novos formulários testadas em DOM simulado.

## Implementado, validação externa pendente

- Descoberta real OSM: tentativa 403; não se confirmou qualquer agência adicional.
- Conectores reais: nenhum portal validado. Idealista exige autorização escrita; RE/MAX e Boulder continuam em avaliação/manual.
- Programação periódica e notificações: código integrado, sem validação em Electron real neste contentor.
- Transporte por proxy CONNECT com IP validado: implementação presente, sem validação de compatibilidade com o proxy desta cloud.
- Desktop Windows/macOS: CI preparada mas não executada aqui; instalação, diálogos, notificações, assinatura/notarização pendentes.
- Tempo de arranque e memória total desktop: não medidos; benchmark do núcleo não substitui essas medições.

## Próximos passos concretos

1. Aplicar/rever rede do ambiente e repetir a descoberta bloqueada.
2. Investigar sites reais de pequenas agências e condições; registar cobertura e exemplos permitidos.
3. Configurar e validar fontes prioritárias, sem metas de quantidade que sacrifiquem qualidade.
4. Validar o fluxo desktop nas duas plataformas e a programação periódica.
5. Medir desempenho desktop e preparar instaladores testados/assinados conforme recursos.

A migração do projeto ZIP/store.json histórico depende dos ficheiros originais, ainda ausentes. Não há promessa de cobertura total, extração universal ou monitorização depois de encerrar a aplicação.
