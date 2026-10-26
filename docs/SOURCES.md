# Fontes — versão 0.2.0

O catálogo já não é uma lista fixa de imobiliárias. Fontes novas são registadas por domínio e têm pesquisas específicas por zona. As três iniciais são apenas sementes fornecidas pelo utilizador.

- Idealista: pesquisa inicial conservada, recolha desativada pelas condições observadas sem autorização escrita.
- RE/MAX: URL filtrado por configurar; condições não avaliadas integralmente; sem conector validado.
- Boulder: URL e filtros conservados, sem recolha automática validada.

Para o detalhe da investigação e referências, consulte [SOURCE_CATALOG.md](SOURCE_CATALOG.md). Para configuração dos importadores/motor genérico, consulte [CONNECTOR_GUIDE.md](CONNECTOR_GUIDE.md).

A descoberta OSM procura agências mapeadas com site, não anúncios; a tentativa real ficou bloqueada com 403. A pesquisa assistida prepara consultas e importa referências autorizadas; não afirma pesquisar a web autonomamente. Nenhuma agência descoberta ganha autorização ou cobertura confirmada automaticamente.

Os parsers JSON-LD, HTML específico e RSS são testados com exemplos locais, não com páginas reais dos portais. Alertas .eml continuam limitados a HTML estruturado suportado. Não existe parser real validado de alertas Idealista nesta entrega.

Importações parciais e falhas não marcam remoções. Atualizações completas autorizadas podem aplicar a política conservadora descrita em DATA_MODEL.md. A atualização periódica só existe enquanto o processo da aplicação estiver ativo.
