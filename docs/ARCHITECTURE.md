# Arquitetura e auditoria

## Auditoria inicial

O checkout continha apenas README.md e estava limpo. A pesquisa em /workspace não encontrou ZIP do projeto anterior nem AGENTS.md. Não havia código, dependências, testes ou data/store.json a migrar. A versão histórica e os alegados dez testes não puderam ser recuperados.

## Decisão: Electron + JavaScript + SQLite

Electron integra o runtime Node e Chromium de forma uniforme em Windows/macOS. Facilita parsers locais, diálogos de ficheiros e notificações com uma só aplicação. Consome mais memória e produz pacotes maiores que Tauri. Tauri usa a webview do sistema, geralmente reduz o pacote, mas requer Rust e uma ponte/sidecar para Node, aumentando o trabalho de integração e distribuição desta base nova. A prioridade foi uma integração local simples e testável. Não existe implementação Tauri paralela.

A interface usa DOM nativo e CSS, sem framework ou bundler: o tamanho desta primeira versão não justifica React. A aplicação pode ser mantida com ferramentas JavaScript correntes.

SQLite é executado por sql.js (WebAssembly) no processo principal. Evita recompilações de módulos nativos entre Electron, Windows x64 e macOS arm64. A base reside em memória enquanto aberta e é persistida por substituição de ficheiro temporário. É adequada ao volume inicial de 1.000 anúncios; bases muito maiores exigem medir memória e custo de gravação e podem justificar SQLite nativo. Não se promete a meta de 350 MB sem medir todos os processos desktop.

## Módulos

- `src/core/store.cjs`: normalização, validação, identidade, SQLite, transações, histórico, exportação e backups.
- `src/core/importers.cjs`: JSON, CSV, HTML JSON-LD e MIME .eml; nenhum pedido de rede.
- `src/core/service.cjs`: coordena anúncios e alertas numa única transação.
- `src/core/rules.cjs`: pesquisas, alertas de transição, validação de configurações e candidatos a duplicados.
- `src/desktop/main.cjs`: persistência na pasta da aplicação, diálogos, IPC e notificações.
- `src/desktop/preload.cjs`: ponte limitada; sem exposição genérica de ipcRenderer, fs ou Node.
- `src/ui/`: interface sem dependências de runtime, com paginação de 40 cartões.

## Persistência e consistência

Esquema inicial v1: meta, listings, history, changes e imports. Meta regista schema_version; versões desconhecidas são recusadas. O esquema atual v2 acrescenta catálogo, zonas, diário, observações e associações; existe migração v1→v2 com backup prévio. A migração histórica do store.json ausente continua pendente.

Cada recolha normaliza todos os registos antes de escrever. Referências contraditórias no mesmo ficheiro são rejeitadas. Uma transação altera anúncios, preços e o registo da importação. A persistência usa ficheiro temporário e rename; uma falha de gravação recupera o snapshot anterior em memória. Não há garantia de durabilidade contra perda súbita de energia equivalente a fsync/journal nativo; os backups continuam necessários.

Chave: fonte + referência; sem referência explícita, usa o pathname do URL. URLs/referências alterados podem criar novos registos; convém importar referências estáveis. Reimportar não acrescenta observações de preço iguais. Preço desconhecido é null e a sua transição é preservada no histórico. A percentagem não é calculada com denominador zero/desconhecido.

O campo lastSeen representa a data de importação, não uma data de recolha verificada no portal. previousPriceCents representa a última alteração de preço; os indicadores de subida/descida não significam obrigatoriamente alteração na última importação.

A exportação JSON v2 (com restauro compatível com v1) conserva anúncios, datas, histórico, importações e meta/configurações. Restauro valida a estrutura e aplica uma transação, precedida de backup na camada desktop. Anúncios, histórico e alertas são persistidos numa única transação coordenada pelo serviço de importação. A aplicação permite uma única instância por perfil para evitar gravações concorrentes da base em memória.

## Alertas e privacidade

Regras: novos, descida, passagem para preço abaixo de limite, entrada numa pesquisa guardada. Alertas persistidos até 1.000 registos. Importação repetida não cria novos eventos. Não há reavaliação retroativa ao ativar uma regra. Notificações dependem do suporte/permissão do SO; o histórico interno não depende delas.

Candidatos a duplicado exigem fontes diferentes, mesma localização textual e tipologia, área dentro de 3% e preço dentro de 5%. São sugestões, nunca fusões automáticas; podem ter falsos positivos e negativos.

Não há credenciais, servidor remoto, telemetria ou recursos remotos da interface. Os ficheiros não são cifrados. Os logs limitam-se a operação, data e mensagem de erro. Backups/logs ainda não têm retenção automática.

## Trabalho pendente

Validação real de fontes autorizadas, investigação externa das pequenas agências quando a rede permitir, migração histórica real, testes desktop multiplataforma, desempenho de arranque/RAM total, assinatura e notarização.

## Evolução 0.2.0

O catálogo deixou de ser uma lista fixa: fontes são persistidas por domínio, com pesquisas específicas por zona. A descoberta opcional OSM não é scraping de portais; acrescenta candidatos desativados, sem confirmar cobertura comercial. A pesquisa assistida/importação de referências é alternativa sem subscrição. Nenhuma capacidade de pesquisa do assistente é implicitamente atribuída à aplicação.

Novos módulos: catalog.cjs/catalog-store.cjs (modelo e persistência), discovery.cjs (plano e candidatos), osm-discovery.cjs (fornecedor público opcional), network.cjs (rede validada), collector.cjs (recolha e política de ausências), shared/geography.js (geografia partilhada com a interface). O núcleo anterior e a arquitetura Electron/sql.js foram preservados.

O renderer continua sem rede/Node/fs. Métodos IPC específicos validam fontes/zonas e usam o processo principal. Recolhas autorizadas suportam cancelamento, cache e periodicidade enquanto o processo está ativo. Fonte descoberta, configurada e validada são estados distintos. Consulte DATA_MODEL.md e CONNECTOR_GUIDE.md para contratos e limites.
