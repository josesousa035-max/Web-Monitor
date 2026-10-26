# Desenvolvimento Web Monitor

- Trabalhar no checkout existente; as tarefas cloud já são isoladas. Não criar worktrees salvo pedido explícito.
- JavaScript/Node.js, Electron e sql.js (SQLite); não usar Python nem manter duas arquiteturas desktop.
- Interface e documentação em português de Portugal.
- Preservar dados locais e alterações do utilizador. Backup antes de migrações/restauro; nunca resetar a base para resolver erros.
- Dinheiro em cêntimos inteiros; preço desconhecido é null, não zero.
- Toda importação valida antes da escrita, usa transação e mantém identidade por fonte/referência. Ausência em recolha parcial não prova remoção.
- HTML/e-mail são conteúdo não fiável: não executar scripts, renderizar HTML diretamente nem carregar recursos remotos.
- Manter contextIsolation, sandbox, nodeIntegration desativada, CSP e API IPC explícita. Não adicionar --no-sandbox.
- Não contornar CAPTCHA, autenticação ou restrições dos portais. Não afirmar conectores reais com base em fixtures sintéticas.
- Executar npm test após alterações e acrescentar testes para comportamento novo relevante. test:desktop exige sandbox e sessão gráfica.
- Alterações de armazenamento precisam de esquema versionado, compatibilidade testada e backup. O formato histórico store.json é desconhecido: não inventar migração.
- Atualizar docs/TEST_REPORT.md apenas com execuções reais; separar build, execução, instalação e assinatura.
- Não publicar, enviar código ou criar serviços externos sem autorização. A CI local é configuração, não evidência de execução remota.

## Descoberta e recolha (0.2)

- Acrescentar fontes pelo catálogo, não por listas fixas no normalizador/UI. Conservar pesquisas por zona e condições/autorização.
- Estado Descoberta não confirma cobertura, acesso nem conector. OSM identifica agências mapeadas, não imóveis disponíveis. Preservar atribuição ODbL e não guardar contactos desnecessários.
- Usar SafeClient para rede; nunca chamar transporte de baixo nível com URLs do renderer sem validação. DNS público, IP fixado na ligação, TLS, proxy e redirecionamentos devem manter proteção.
- Apenas recolhas completas e comparáveis podem atualizar ausências. Mudanças de pesquisa/configuração/zona alteram âmbito. Não inferir remoção por erro, bloqueio, limite ou importação parcial.
- Não converter área de terreno em útil, moeda estrangeira em EUR ou coordenadas aproximadas em exatas.
- Depois de alterar interface/preview, executar npm run preview e o teste de preview; HTML final tem de ser autónomo, com CSP e dados fictícios identificados.
- Após restauro, permissões/intervalos de recolha ficam desativados para avaliação. Backups devem preservar o diário completo, mesmo que a UI só mostre 100 recolhas.
