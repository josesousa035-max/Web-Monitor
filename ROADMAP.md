# Roadmap — estado da versão 0.3.1

## Revalidação 0.3.1 — 28 de outubro de 2026

- [x] Empacotamento Windows x64 configurado: NSIS assistido/portable, verificação estrutural e hashes, artefactos com instruções na CI.
- [x] EXE portable gerado em Linux e verificado estruturalmente; execução real Windows continua pendente. NSIS local bloqueado pelo runtime Wine; geração nativa preparada na CI.
- [ ] Confirmar execução remota da CI e instalação/atualização/desinstalação real em Windows; assinar distribuição quando houver certificado autorizado.

- [x] Auditoria e 66 testes anteriores antes de alterar; 68 aprovados após alterações.
- [x] Totais completos na revisão e identificação de campos desconhecidos na amostra; método explícito no diagnóstico.
- [x] Rejeição de confirmação após alteração de catálogo verificada sem criar backup.
- [x] Preview autónoma e build Linux atualizados.
- [ ] CI e descoberta reais: tentativas atuais bloqueadas pelo proxy CONNECT HTTP 403, antes de obter resposta das origens.
- [ ] Teste Electron atualizado mas bloqueado pela sandbox; Windows/macOS continuam pendentes.

As secções seguintes conservam o histórico das entregas anteriores.

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

## Entrega 0.3 — 27 de outubro de 2026

- [x] Prompt de execução e critérios guardados em docs/prompts/NEXT_STEPS_v0.3.md.
- [x] Revisão antes de gravar, cancelamento, confirmação parcial, prazo e revisão obsoleta.
- [x] Preservação de dados ausentes, datas e agrupamentos área/tipo e preço/moeda.
- [x] Diagnóstico local por fonte/zona, sem presumir conectividade.
- [x] Reutilização do cliente de rede, paginação RSS e exclusão de contradições.
- [x] Preview interativa dentro do ZIP e relatórios de testes preparados para CI.
- [ ] Obter resultados remotos da CI: API recusou acesso nesta sessão; consultar Actions na conta GitHub.
- [ ] Concluir investigação externa e validação real de fontes quando o acesso permitir.
- [ ] Executar e validar desktop/instaladores Windows e macOS com sandbox e sessão gráfica adequadas.
