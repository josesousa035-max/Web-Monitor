# Changelog

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
