# Relatório de validação — 0.2.0

26 de outubro de 2026. Debian 13/Linux x64; Node v24.19.0; npm 11.9.0; Electron 45.0.0; electron-builder 26.18.0. A auditoria inicial repetiu os **22 testes anteriores**, todos aprovados, antes da evolução do projeto.

## Resultado atual

| Verificação executada | Resultado observado |
| --- | --- |
| `npm test` | **49 aprovados, 0 falhados, 0 ignorados**; última execução ~1.306 ms |
| `npm audit` | **0 vulnerabilidades** reportadas, incluindo desenvolvimento |
| `npm run preview` | HTML autónomo gerado com dados fictícios e CSP por hashes |
| Build Linux com distribuição Electron local | Concluído, `dist/linux-unpacked`; não é instalador Windows/macOS |
| Inspeção ASAR | Código do núcleo, rede, descoberta, UI e geografia coincide com a fonte; SQLite WASM presente |
| `npm run test:desktop` | Tentado; código 1 antes das asserções devido à sandbox SUID indisponível |

## Testes efetivamente executados

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

## Benchmark de 1.000 anúncios sintéticos

Uma execução do núcleo Node, base em memória:

| Medida | Resultado |
| --- | --- |
| Inicializar SQLite/WASM | 46,93 ms |
| Importar 1.000 anúncios | 68,43 ms |
| 100 listagens/filtros | 466,53 ms |
| RSS do processo Node no fim | 103,18 MiB |

Não inclui gravação em disco, backups, renderização Chromium, diálogos ou todos os processos Electron. Não demonstra a meta de RAM em repouso inferior a 350 MB ou o tempo de arranque desktop. Não extrapolar para Windows/Mac ou hardware modesto.

## Investigação externa real

Nesta execução, ao contrário da anterior, foi possível receber robots dos três sites iniciais, homepage/condições/diretório inicial Idealista e homepage/diretório/rota de condições RE/MAX. As condições Idealista restringem monitorização/cópia sem autorização escrita; não se prosseguiu na extração de anúncios. As condições RE/MAX não ficaram legíveis no HTML recebido. Boulder foi mantida manual, com a regra GPTBot registada.

Bing, Google e DuckDuckGo recusaram acesso com 403. Uma consulta Overpass para Póvoa de Lanhoso também recebeu 403. Não se tentou contornar restrições. **Não há novas agências locais verificadas nem anúncios reais extraídos nesta execução.** A impossibilidade de pesquisa externa não foi descrita como zero oferta imobiliária.

Veja SOURCE_CATALOG.md para URLs, evidência e limites. Foram guardadas adições de domínios no rascunho de rede; isso não confirma aplicação/publicação ou sucesso em nova tarefa.

## Limitações não resolvidas neste ambiente

- Electron continua sem sandbox utilizável no contentor. `test:desktop` não executou as asserções; não foram validados abertura, IPC real, diálogos ou notificações.
- Programação periódica integrada e cancelamento na saída não foram validados numa sessão Electron real.
- Proxy CONNECT com IP fixado e DNS público: código presente; integração com o proxy da cloud não validada ao vivo.
- Descoberta OSM e fontes novas: implementação local testada, obtenção real bloqueada. Pesquisa web ampla exige aplicar/rever rede e retomar investigação.
- Nenhum conector real de Idealista, RE/MAX ou Boulder foi validado. .eml não equivale a suporte completo de alertas Idealista.
- Windows/macOS, instaladores NSIS/DMG, assinatura e notarização não executados neste Linux. CI preparada, não acionada por esta sessão.
- ZIP/store.json históricos ausentes; sem migração desse formato inventada.

## Reprodução

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
