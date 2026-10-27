# Prompt executável — Web Monitor 0.3: dados revistos antes de gravar

Evolui o Web Monitor existente, preservando a arquitetura Electron/JavaScript/sql.js, os dados e as funcionalidades da versão 0.2. Não reescrevas a aplicação nem cries uma segunda arquitetura. Lê AGENTS.md e executa os testes antes de alterar.

Objetivo: tornar utilizável e seguro o percurso ficheiro → revisão → confirmação → histórico, e tornar explícito o estado das fontes. Executa esta prompt integralmente nas partes viáveis; documenta limitações externas sem inventar resultados.

1. Audita a importação, a persistência, a revisão de alterações e as fontes. Tenta ler os resultados da CI e revalida o acesso externo apenas por meios permitidos. Não contornes bloqueios, TLS, CAPTCHA ou condições.
2. Corrige perdas de informação: distinguir campo não fornecido de valor explicitamente desconhecido. Atualizações parciais não podem apagar dados conhecidos nem gerar falsos eventos de preço. Valores explícitos, incluindo zero e null, têm semântica documentada. Conserva a associação entre área/tipo de área e preço/moeda; não atribuas uma nova unidade/tipo a um valor antigo.
3. Antes de importar, apresenta revisão com total, novos, conhecidos, alterações de preço/metadados, campos desconhecidos e amostra das diferenças. Não grave anúncios, alertas, diário ou backups antes da confirmação. Cancelar não altera dados.
4. A confirmação usa um identificador temporário e não aceita caminhos arbitrários do renderer. Deteta alterações da base/catálogo desde a revisão e exige nova revisão. Protege contra confirmação repetida e ficheiros demasiado grandes. Faz backup antes da gravação e grava dados, alertas e diário de forma transacional.
5. A importação de HTML/e-mail deve conservar avisos e rejeitar resultados parciais por omissão; permitir importar os anúncios válidos apenas após confirmação explícita da parcialidade. Nenhuma importação permite inferir remoções. Conteúdo importado nunca é executado.
6. Acrescenta um centro de diagnóstico com estado por fonte/zona: pesquisa configurada, autorização documentada, método, programação, última tentativa e erro com ação recomendada. Diagnóstico local não deve fazer pedidos de rede ou afirmar conectividade verificada. Mostra limites conhecidos sem expor segredos ou caminhos locais.
7. Corrige a reutilização de cache/limites entre atualizações e evita classificar como completa uma recolha com inconsistências ou dados contraditórios.
8. Atualiza a preview com demonstração interativa do fluxo de revisão, sem introduzir anúncios reais ou recolha web nessa preview. Mantém HTML autónomo, com CSP e identificação de dados fictícios.
9. Executa testes significativos de revisão/cancelamento, repetição, revisão obsoleta, rollback, dados ausentes/explícitos, HTML parcial, alertas, diagnóstico e interface. Mantém os testes anteriores e investiga regressões. Atualiza o teste Electron; se a sandbox não permitir executá-lo, regista o bloqueio.
10. Atualiza README, CHANGELOG, ROADMAP e relatório de testes. Prepara build e instruções reproduzíveis. Continua a distinguir código local testado, integração real e testes Windows/macOS pendentes.

Critérios de entrega: uma importação pode ser inspecionada, cancelada e confirmada; a confirmação corresponde aos dados revistos; importações parciais preservam informação; erros não deixam histórico incompleto; diagnóstico ajuda a decidir a próxima ação. Não declarar novos conectores reais validados com base em exemplos sintéticos.

No fim, guarda o trabalho em commit e atualiza a branch de entrega já autorizada pelo utilizador (`codex/web-monitor-v0.2`). Não criar releases, fundir na main ou publicar serviços externos. Indica o commit, versão, testes e limitações.
