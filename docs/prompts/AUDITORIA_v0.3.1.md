# Prompt: auditoria e correção da revisão de importações

Atua como engenheiro sénior no Web Monitor existente. Lê AGENTS.md, verifica estado e testes antes de alterar. Preserva Electron, JavaScript, sql.js, dados, segurança e compatibilidade; não reescrevas a aplicação nem inventes resultados da CI.

Audita o percurso ficheiro → revisão → confirmação → diário e prioriza falhas reproduzíveis. Corrige duas inconsistências encontradas: referências duplicadas idênticas devem contar uma única vez no diário, tal como na revisão e gravação; a amostra limitada deve apresentar prioritariamente diferenças de anúncios conhecidos, mesmo quando existem muitos anúncios novos. Mantém a rejeição de duplicados contraditórios e a confirmação transacional.

Antes de corrigir, cria testes que reproduzam as falhas. Confirma consistência dos totais por fonte, da importação e dos alertas; testa amostras com mais de 40 novos e uma alteração de preço. Executa os testes existentes e novos, valida a preview se alterar a interface, documenta alterações e resultados reais. Distingue execução local de validação Windows/CI. Atualiza apenas a branch de entrega autorizada, sem release ou merge.
