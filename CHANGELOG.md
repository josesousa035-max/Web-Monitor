# Changelog

## 0.3.1 — 28 de outubro de 2026

- Corrigida condição de corrida no teste do pacote Windows: aguardar o fim do fluxo de escrita do ASAR sintético antes da leitura. Gravação final atrasada no teste reproduz deterministicamente a falha anterior, mantendo todas as verificações de integridade. 70 testes locais aprovados.

- Corrigido verify:win: consultas ASAR usam separadores nativos, sem converter caminhos Windows em POSIX. Regressão reproduz a falha com a implementação ASAR instalada, verifica POSIX/Windows e mantém rejeição de fontes alteradas/ausentes. 70 testes locais aprovados.

- Corrigida falha CSP da preview em checkout Windows: normalizar CRLF/CR para LF antes de calcular hashes e incorporar scripts/estilos. Teste de regressão reproduziu a falha e verifica HTML idêntico entre terminações de linha; 69 testes locais aprovados.

- Empacotamento Windows x64 com instalador NSIS assistido e executável portable, nomes explícitos e preservação de dados na configuração de desinstalação.
- Comandos dist:win/dist:win:portable e verificação de PE, versão, fontes no ASAR e SQLite WASM; hashes SHA-256 e instruções incluídos no artefacto Windows da CI, sem publicação de release.
- CI entrega o artefacto Web-Monitor-Windows-x64 apenas após testes/build/verificação; execução Windows e assinatura continuam por validar.

- Auditoria da implementação existente e 66 testes aprovados antes das alterações; arquitetura, armazenamento e funcionalidades preservados.
- Revisão com totais visíveis de conhecidos, alterações de metadados e campos desconhecidos; amostra identifica campos desconhecidos no resultado após conservação dos valores anteriores. Zero não é desconhecido.
- Método explícito no diagnóstico e demonstração autónoma atualizada, sempre fictícia.
- Testes adicionais para totais/desconhecidos e catálogo alterado após revisão; asserções DOM e teste Electron atualizados.
- 68 testes locais aprovados e auditoria de dependências sem vulnerabilidades; limitações externas e desktop registadas no relatório.

## 0.3.0 — revisão de importações e conservação de dados

- Prompt de execução guardada em docs/prompts/NEXT_STEPS_v0.3.md.
- Rever, cancelar e confirmar importações, com sessão temporária, deteção de revisão obsoleta e backup só na confirmação.
- Campos ausentes não apagam valores conhecidos; datas inválidas, área/tipo e preço/moeda tratados conservadoramente.
- Avisos HTML/EML conservados e confirmação explícita de parcialidade; referências contraditórias excluídas.
- RSS com paginação e reutilização do cliente de rede entre atualizações.
- Diagnóstico local por fonte/zona, sem pedidos de rede ou mensagens brutas sensíveis.
- Backup JSON v3, compatível com leitura de v1/v2; preservação de datas por campo e campos conservados.
- Preview interativa incluída no repositório/ZIP; relatórios JUnit e artefactos de validação preparados na CI.
- Acesso à API GitHub/Overpass e arranque Electron continuam sujeitos às limitações descritas no relatório.

## 0.2.0 — zonas e catálogo extensível

- Fontes por domínio e pesquisas por zona, sem limite às três imobiliárias iniciais.
- Zonas administrativas textuais ou raio com precisão explícita; filtros e zona ativa persistida.
- Descoberta opcional OpenStreetMap, cache filtrada e atribuição; plano de pesquisa e importação de referências.
- Motor autorizado JSON-LD/HTML/RSS, paginação, robots, cancelamento, proteção DNS/TLS, cache e limites.
- Diário e política conservadora de ausências; periodicidade da zona ativa com recuo após falhas.
- Proveniência, datas explícitas, moeda original e tipos de área; associações reversíveis sem fusão.
- Migração SQLite v1→v2 com backup; restauro JSON v1/v2 preservando catálogos e histórico.
- Preview atualizada e testes de migração, rede, conectores, descoberta e formulários.
- Investigação real documentada: sem novas agências verificadas, motores/Overpass bloqueados, restrição Idealista identificada. Nenhum conector de portal promovido a validado sem evidência.

## 0.1.0 — primeira base de desenvolvimento

- Aplicação Electron com interface em português de Portugal, tema escuro e consulta local.
- SQLite via WebAssembly, normalização, histórico de preços e importações idempotentes.
- JSON/CSV; suporte limitado e explícito a JSON-LD em HTML/e-mail MIME.
- Filtros, ordenação, paginação, detalhe e gráfico simples de preços.
- Regras de alerta, pesquisas guardadas e candidatos a duplicados sem fusão.
- Backups preventivos, exportação e restauro transacional.
- Testes do núcleo/DOM, benchmark sintético e CI desktop preparada.
- Sem migração do projeto anterior, conectores reais validados ou instaladores Windows/macOS testados.
- Pré-visualização HTML autónoma e responsiva, reutilizando a interface e com dados fictícios identificados; teste de navegação, filtros, histórico e hashes CSP.
