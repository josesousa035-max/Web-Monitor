# Relatório de validação — 0.3.1

## Correção do verificador ASAR Windows — 28/10/2026

Log fornecido: verify:win falha em extractFile para `src/core/catalog-store.cjs`. Antes de alterar, 69 testes locais aprovados. A biblioteca @electron/asar 3.4.1 divide diretórios por path.sep; o verificador convertia os caminhos relativos Windows para `/`, impedindo a procura de entradas aninhadas. A correção conserva o caminho nativo, mantendo a comparação integral dos bytes.

Novo teste cria um ASAR sintético real e executa o verificador com a implementação instalada de procura ASAR, usando semântica path.win32 e path.posix. Reproduziu exatamente a mensagem de ficheiro ausente antes da correção; passou depois. Também confirma rejeição de bytes diferentes e ficheiros realmente ausentes. A simulação de caminhos não constitui execução nativa Windows.

`npm run test:report`: **70 aprovados, 0 falhados, 0 ignorados**, ~2,14 s. `node scripts/verify-windows.cjs --portable`: aprovado no pacote Windows local existente, com 21 fontes, PE x64 e WASM iguais; hash do portable mantém-se `fafa745099c81c40e8859bf51f51ca19ed6d2e4ac4c92704751af754a061e339`. `git diff --check` aprovado. Não houve alterações ao runtime da aplicação ou dados, nem necessidade de repetir o build. Aguarda-se resultado da nova CI nativa; não se declara sucesso remoto ou instalador validado.

## Correção da falha Windows comunicada pelo utilizador — 28/10/2026

O log fornecido mostra falha da asserção CSP em tests/preview.test.cjs:29 no runner Windows. Antes de alterar, os 68 testes locais passaram. Uma cópia temporária das fontes com terminações CRLF reproduziu a mesma divergência: o gerador calculava o hash com CRLF, enquanto o parser HTML normalizava para LF. Isso também podia impedir a execução da preview num navegador com CSP aplicada.

O gerador agora normaliza CRLF e CR para LF antes de calcular hashes e incorporar o conteúdo. A CSP não foi enfraquecida e o teste anterior foi mantido. O teste novo executa o gerador real numa pasta temporária com fontes CRLF e CR, verifica os quatro hashes contra o DOM e compara o HTML com a geração LF. Esse teste falhou antes da correção e passou depois.

`npm run test:report`: **69 aprovados, 0 falhados, 0 ignorados**, ~1,88 s. `npm run preview:share` e `git diff --check` concluídos. A preview gerada em Linux mantém o mesmo conteúdo. Não se alteraram aplicação desktop, dados, dependências ou formato de armazenamento. O empacotamento não foi repetido: esta alteração afeta apenas gerador/testes/documentação. A nova execução nativa da CI continua por confirmar; este resultado local não prova que os passos posteriores do job Windows tenham passado.

## Empacotamento Windows — 28 de outubro de 2026

Nesta etapa, os **68 testes existentes passaram antes de alterar** a configuração de entrega; repetidos depois, **68 aprovados, 0 falhados, 0 ignorados**, ~3,09 s. Não se alterou código da aplicação, esquema SQLite ou dados. Não foram acrescentadas dependências de runtime.

- Electron 45 Windows x64 descarregado e pasta `dist/win-unpacked` gerada nesta cloud Linux. Verificação estrutural aprovada: PE x64, versão 0.3.1, 21 ficheiros de src iguais à fonte e SQLite WASM igual à dependência instalada. Não é prova de execução Windows.
- `npm run dist:win:portable` concluído com sucesso: `dist/Web-Monitor-0.3.1-windows-x64-portable.exe`, ~110 MiB. SHA-256 desta geração local: `fafa745099c81c40e8859bf51f51ca19ed6d2e4ac4c92704751af754a061e339`. Stub autoextrator NSIS PE32, contendo a aplicação PE x64 verificada. A CI fará outro build; use os hashes do respetivo artefacto, que podem ser diferentes.
- Primeira tentativa de instalador NSIS: falhou por falta de Wine (`spawn wine ENOENT`). Segunda, com a ferramenta oficial `toolsets.wine=1.0.1`: download concluído, mas Wine 11 falhou ao carregar ntdll (`c0000135`) antes de concluir o instalador. O setup intermédio não é distribuível nem um instalador validado.
- Configuração final inclui NSIS assistido e portable, x64, nomes distintos, atalhos, idiomas português/inglês, e desinstalação configurada para conservar dados. A CI Windows nativa gera ambos, verifica os pacotes, calcula SHA-256 e disponibiliza o artefacto **Web-Monitor-Windows-x64**, com instruções. Nada é publicado como release.
- YAML da CI analisado com js-yaml; sintaxe Node do verificador e `git diff --check` aprovados. O verificador confere estrutura/correspondência do pacote; não testa instalação ou funcionamento.
- Tentativa atual de ler resultados via `gh run list`: API GitHub recusou acesso (Forbidden). Não se confirmou execução ou sucesso remoto. O download do runtime Windows e das ferramentas de build funcionou; isto não confirma acesso aos portais imobiliários.

O teste Electron em Linux permanece bloqueado pela sandbox conforme execução anterior. Não se executaram os EXE em Windows, nem se testaram instalação, atualização, desinstalação, notificações, reputação SmartScreen ou assinatura. Os executáveis são de desenvolvimento e não assinados. Os dados da edição portable permanecem em APPDATA/web-monitor, partilhados com a edição instalada. Instruções reproduzíveis e checklist manual em [WINDOWS.md](WINDOWS.md).

Reprodução local da edição portable nesta cloud: `XDG_CACHE_HOME=/tmp/web-monitor-cache ELECTRON_CACHE=/tmp/web-monitor-electron ELECTRON_BUILDER_CACHE=/tmp/web-monitor-builder CSC_IDENTITY_AUTO_DISCOVERY=false NODE_USE_ENV_PROXY=1 npm run dist:win:portable`. Verificação posterior: `node scripts/verify-windows.cjs --portable`. O EXE gerado e os pacotes de build permanecem em dist (ignorado por Git); o canal de entrega no browser é o artefacto da CI, não o ZIP do código fonte. A API indisponível impede confirmar que esse download remoto já existe.

## Auditoria e revisão de importação

28 de outubro de 2026, Linux x64, Node v24.19.0. Leitura de AGENTS.md e execução dos **66 testes existentes, todos aprovados, antes de alterar código**. A maior parte da prompt já estava implementada em 0.3.0; esta entrega completa a apresentação da revisão/diagnóstico sem alterar arquitetura nem esquema SQLite.

| Verificação desta execução | Resultado |
| --- | --- |
| `npm run test:report` | **68 aprovados, 0 falhados, 0 ignorados**, ~2,77 s; JUnit com 68 casos e zero falhas |
| `npm audit --json` | **0 vulnerabilidades**, incluindo desenvolvimento |
| `npm run preview:share` | HTML autónomo atualizado; CSP e fluxo interativo testados em jsdom |
| Build Linux com Electron local | Concluído; código atual de sessão, diagnóstico, UI e main/preload verificado no ASAR |
| `npm run test:desktop` | Código 1/SIGTRAP antes de asserções: sandbox SUID indisponível; não foi desativada |
| API GitHub Actions e consulta Overpass | Ambos recusados pelo proxy CONNECT com HTTP 403, curl 56/HTTP de origem 000; não se obteve resposta das origens |

Adicionados testes para desconhecidos no resultado final (dados conservados e zero não contam como desconhecidos) e alteração de catálogo após revisão (rejeição sem backup/escrita). Asserções de interface verificam totais de conhecidos/metadados/desconhecidos, nomes de campos e método no diagnóstico. Teste Electron atualizado, mas não executou asserções. A primeira execução do novo teste falhou porque o exemplo enviava tipo de área sem área; corrigiu-se o exemplo para omitir ambos, respeitando a regra existente. Os 66 testes anteriores continuam aprovados.

Auditoria confirmou: revisão pura, sessão temporária/única, fingerprint de dados/catálogo/configuração, limites, backup na confirmação, transação e rollback; avisos parciais conservados, sem inferir remoções; cliente SafeClient partilhado, TLS e validações mantidas. Não se alterou o esquema SQLite 2 nem o backup JSON 3, mantendo leitura 1/2/3. Não houve reset ou migração de dados.

Os resultados remotos da CI continuam desconhecidos. Não foram validados conectores reais ou novas agências. Testes DOM e pacote Linux não validam execução gráfica, instaladores Windows/macOS, assinatura ou notificações. Instruções reproduzíveis abaixo e no README mantidas: `npm ci`, `npm run test:report`, `npm run preview:share`; `XDG_CACHE_HOME=/tmp/web-monitor-cache npm run build -- --config.electronDist=node_modules/electron/dist`. Numa sessão gráfica com sandbox utilizável, executar `npm run test:desktop`.

---

# Histórico — validação 0.3.0

27 de outubro de 2026. Debian 13/Linux x64; Node v24.19.0; Electron 45.0.0. Os 49 testes anteriores foram executados e aprovados antes de alterar o projeto.

## Resultado desta entrega

| Verificação executada | Resultado |
| --- | --- |
| `npm run test:report` | **66 aprovados, 0 falhados, 0 ignorados**; ~1,89 s |
| JUnit em dist/reports/tests.xml | 66 casos, zero failure/skip; ficheiro da execução atual verificado |
| `npm audit` | **0 vulnerabilidades** reportadas |
| `npm run preview:share` | Preview autónoma gerada em preview/Web-Monitor.html, incluída no repositório/ZIP |
| Build Linux com Electron local | Concluído; pacote dist/linux-unpacked |
| Inspeção ASAR | Código atual de observações, sessões de importação, diagnóstico, main/preload e UI confirmado no pacote |
| `npm run test:desktop` | Tentado; abortou antes das asserções, código 1, pela sandbox SUID indisponível |

## Novos comportamentos verificados

- Revisão e cancelamento não alteram anúncios, alertas, diário ou backups.
- Confirmação única, revisão expirada/substituída/obsoleta, limite de 10.000 anúncios e JSON com BOM.
- Backup só na confirmação; falhas de backup/gravação com rollback de anúncios, alertas e diário; repetição segura após falha.
- Diário separado pelas fontes realmente presentes em ficheiros mistos.
- Campos ausentes e CSV vazio preservam preços e metadados; null explícito e zero têm significados distintos.
- Área/tipo e preço/moeda não são reaproveitados incoerentemente; datas sem fuso ou calendário inválido não apagam valores anteriores.
- Metadados de campos conservados sobrevivem ao backup JSON v3; leitura de v1/v2 mantida.
- HTML parcial conserva avisos e exige aceitação explícita; referências contraditórias entre páginas, incluindo RSS, são excluídas.
- Diagnóstico local com quick_check, contexto por fonte/zona, sem mensagens brutas, evidência de autorização, caminhos privados ou pedidos de rede. Última tentativa encontrada mesmo além das 100 linhas da interface.
- Preview em jsdom: abrir revisão, cancelar sem alterar 12 exemplos, confirmar parcialidade e passar a 13 exemplos, consultar diagnóstico demonstrativo.

Testes de interface são DOM simulado; não houve inspeção gráfica real. O teste Electron foi atualizado para revisão/confirmar/cancelar/diagnóstico, mas **não executou as asserções** devido ao bloqueio da sandbox. Não se usou --no-sandbox.

## Benchmark indicativo

Com 1.000 anúncios sintéticos no núcleo Node, base em memória: inicializar SQLite ~56,95 ms; importar ~122,60 ms; 100 listagens/filtros ~884,36 ms; RSS final ~104,27 MiB. A medição coincidiu com preparação de build; não mede disco/backups, pintura da UI, arranque ou RAM total de Electron. Não comprova a meta de 350 MB em repouso desktop.

## CI e acesso externo

A leitura de Actions pela API e por gh devolveu 403. O acesso Git nativo à branch funcionou. Não se inferiu falta de credenciais nem se pediu um novo token. A CI foi preparada para produzir JUnit e guardar relatórios/preview mesmo após falhas; **os resultados remotos não foram obtidos nesta sessão**.

A consulta documentada Overpass, com identificação WebMonitor e Accept application/json, devolveu HTTP 406. Não foram contornadas restrições ou declaradas agências/conectores reais novos. Continuam pendentes a investigação externa autorizada e a validação dos portais.

## Limites mantidos

Instaladores Windows/macOS, diálogos/notificações reais, programação periódica em desktop, assinatura/notarização, arranque e memória total não foram validados neste Linux. A preview não recebe ficheiros reais, não usa SQLite e não pesquisa a Internet. O ZIP/store.json histórico continua ausente.

## Reproduzir

`npm ci`, `npm run test:report`, `npm run benchmark`, `npm run preview:share`. Nesta cloud, use as caches em /tmp e NODE_USE_ENV_PROXY=1 já documentadas. Build verificado: `XDG_CACHE_HOME=/tmp/web-monitor-cache npm run build -- --config.electronDist=node_modules/electron/dist`. Numa sessão gráfica com sandbox utilizável: `npm start` e `npm run test:desktop`.

---

# Histórico — versão 0.2.0

26 de outubro de 2026. Debian 13/Linux x64; Node v24.19.0; npm 11.9.0; Electron 45.0.0; electron-builder 26.18.0. A auditoria inicial repetiu os **22 testes anteriores**, todos aprovados, antes da evolução do projeto.

### Resultado atual

| Verificação executada | Resultado observado |
| --- | --- |
| `npm test` | **49 aprovados, 0 falhados, 0 ignorados**; última execução ~1.306 ms |
| `npm audit` | **0 vulnerabilidades** reportadas, incluindo desenvolvimento |
| `npm run preview` | HTML autónomo gerado com dados fictícios e CSP por hashes |
| Build Linux com distribuição Electron local | Concluído, `dist/linux-unpacked`; não é instalador Windows/macOS |
| Inspeção ASAR | Código do núcleo, rede, descoberta, UI e geografia coincide com a fonte; SQLite WASM presente |
| `npm run test:desktop` | Tentado; código 1 antes das asserções devido à sandbox SUID indisponível |

### Testes efetivamente executados

- Todos os comportamentos anteriores: preços, novos anúncios, alterações, idempotência, persistência, exportação/restauro, falhas de validação e interface.
- Fonte adicional sem alterar código, domínio incoerente/duplicado, pesquisas por zona independentes.
- Migração de uma base SQLite v1 real em ficheiro para v2, backup binário exato e preservação dos registos.
- Backups v1/v2, catálogo, zonas, associações, observações, novo histórico e diário com mais de 100 recolhas. Restauro desativa permissões/intervalos.
- Raio com precisão explícita, coordenadas desconhecidas/aproximadas, filtros e correspondência textual.
- Importação de referências HTML, deduplicação por domínio e ausência de cobertura presumida.
- Descoberta OSM com fixtures: sites, agências sem site, domínios recusados, atribuição, cache e exclusão de contactos desnecessários.
- Coletores JSON-LD, HTML configurado e RSS com exemplos sintéticos; paginação, limites, ciclos, robots e falta de autorização.
- Falha intermédia, página alterada e cancelamento sem falsas remoções.
- Ausências completas espaçadas, indisponibilidade conservadora e reaparecimento sem novo anúncio.
- Preservação de moeda original sem conversão indevida, tipo de área, datas explícitas e identidade em query string sem tracking.
- Rede com transporte simulado: DNS privado/misto, redirecionamentos, limites de retries, 403, 429/Retry-After, ETag/304, timeout e cancelamento.
- **Transporte HTTPS local real:** servidor TLS de teste com CA temporária explícita; certificado não confiável rejeitado, certificado confiável validado, corpo gzip descomprimido e resposta excessiva recusada. Não se desativou TLS. Este teste é explicitamente ignorado se OpenSSL não existir; nesta execução foi executado e aprovado.
- Interface em jsdom: filtros, paginação de 1.000 anúncios, formulários, criação de zona/fonte, seleção geográfica, plano de pesquisa e ausência de resultados externos inventados na preview.

Os testes usam dados sintéticos e servidores locais de teste. Não comprovam compatibilidade de conectores com os portais reais. Não constituem inspeção gráfica num navegador/desktop real nem testes completos de permissões do sistema operativo.

### Benchmark de 1.000 anúncios sintéticos

Uma execução do núcleo Node, base em memória:

| Medida | Resultado |
| --- | --- |
| Inicializar SQLite/WASM | 46,93 ms |
| Importar 1.000 anúncios | 68,43 ms |
| 100 listagens/filtros | 466,53 ms |
| RSS do processo Node no fim | 103,18 MiB |

Não inclui gravação em disco, backups, renderização Chromium, diálogos ou todos os processos Electron. Não demonstra a meta de RAM em repouso inferior a 350 MB ou o tempo de arranque desktop. Não extrapolar para Windows/Mac ou hardware modesto.

### Investigação externa real

Nesta execução, ao contrário da anterior, foi possível receber robots dos três sites iniciais, homepage/condições/diretório inicial Idealista e homepage/diretório/rota de condições RE/MAX. As condições Idealista restringem monitorização/cópia sem autorização escrita; não se prosseguiu na extração de anúncios. As condições RE/MAX não ficaram legíveis no HTML recebido. Boulder foi mantida manual, com a regra GPTBot registada.

Bing, Google e DuckDuckGo recusaram acesso com 403. Uma consulta Overpass para Póvoa de Lanhoso também recebeu 403. Não se tentou contornar restrições. **Não há novas agências locais verificadas nem anúncios reais extraídos nesta execução.** A impossibilidade de pesquisa externa não foi descrita como zero oferta imobiliária.

Veja SOURCE_CATALOG.md para URLs, evidência e limites. Foram guardadas adições de domínios no rascunho de rede; isso não confirma aplicação/publicação ou sucesso em nova tarefa.

### Limitações não resolvidas neste ambiente

- Electron continua sem sandbox utilizável no contentor. `test:desktop` não executou as asserções; não foram validados abertura, IPC real, diálogos ou notificações.
- Programação periódica integrada e cancelamento na saída não foram validados numa sessão Electron real.
- Proxy CONNECT com IP fixado e DNS público: código presente; integração com o proxy da cloud não validada ao vivo.
- Descoberta OSM e fontes novas: implementação local testada, obtenção real bloqueada. Pesquisa web ampla exige aplicar/rever rede e retomar investigação.
- Nenhum conector real de Idealista, RE/MAX ou Boulder foi validado. .eml não equivale a suporte completo de alertas Idealista.
- Windows/macOS, instaladores NSIS/DMG, assinatura e notarização não executados neste Linux. CI preparada, não acionada por esta sessão.
- ZIP/store.json históricos ausentes; sem migração desse formato inventada.

### Reprodução

```sh
cd /workspace/Web-Monitor
export npm_config_cache=/tmp/web-monitor-npm
export electron_config_cache=/tmp/web-monitor-electron
export NODE_USE_ENV_PROXY=1
npm ci --no-audit --no-fund
npm test
npm run benchmark
npm run preview
XDG_CACHE_HOME=/tmp/web-monitor-cache npm run build -- --config.electronDist=node_modules/electron/dist
```

Numa sessão gráfica com sandbox utilizável: `npm start` e `npm run test:desktop`. Não adicionar `--no-sandbox` para ocultar o bloqueio desta cloud. A preview abre como ficheiro HTML sem servidor ou Internet e não consulta anúncios reais.
