# Web Monitor

Aplicação desktop local para acompanhar anúncios imobiliários. Interface em português de Portugal, modo escuro, dados SQLite no computador e consulta sem Internet.

**Estado: versão de desenvolvimento 0.3.1.** O núcleo e a interface têm testes locais; a execução gráfica e os instaladores Windows/macOS ainda precisam de validação nas plataformas respetivas. Não há conector automático validado para os portais iniciais. Existe um motor de recolha para fontes autorizadas configuradas, validado com exemplos locais.

A revisão apresenta totais de novos/conhecidos, alterações de preço/metadados e campos desconhecidos no resultado final, com identificação na amostra. O diagnóstico mostra explicitamente o método da fonte. Revalidação de 28/10/2026: 68 testes locais aprovados; acesso à CI/Overpass bloqueado pelo proxy; Electron bloqueado pela sandbox. Consulte [o relatório](docs/TEST_REPORT.md).

## Aplicação Windows

Preparados instalador e executável portable **Windows x64**, com Node/Electron incluídos. Para descarregar, abra [GitHub Actions](https://github.com/josesousa035-max/Web-Monitor/actions/workflows/desktop.yml), selecione a execução da branch de entrega e procure o artefacto **Web-Monitor-Windows-x64** após o job Windows terminar com sucesso. O ZIP do código fonte não inclui EXE. Não há release publicada nem resultado remoto confirmado a partir desta cloud.

O artefacto contém `Web-Monitor-0.3.1-windows-x64-setup.exe`, `Web-Monitor-0.3.1-windows-x64-portable.exe` e hashes SHA-256. A edição não é assinada. Consulte [as instruções Windows](docs/WINDOWS.md) para utilização, dados, build e validação pendente. Para gerar em Windows: `npm ci`, `npm run test:report`, `npm run test:desktop`, `npm run dist:win`, verificando sucesso em cada etapa.

## Novidades da versão 0.3

- **Revisão antes de importar:** veja novos anúncios, alterações, campos conservados e avisos; confirme ou cancele antes de gravar.
- **Dados parciais seguros:** campos ausentes/vazios conservam informação anterior; null explícito em JSON indica valor desconhecido. Datas inválidas não apagam datas anteriores.
- **Diagnóstico local:** estado por fonte/zona, ações recomendadas e integridade da base carregada, sem fazer pedidos de rede ou apresentar acesso por testar como validado.
- **Preview incluída no ZIP:** abra `preview/Web-Monitor.html` no navegador, sem instalar Node/Electron. Todos os dados são fictícios; pode experimentar revisão, cancelamento e confirmação.

A prompt desta etapa está em [docs/prompts/NEXT_STEPS_v0.3.md](docs/prompts/NEXT_STEPS_v0.3.md). Leia [o fluxo de importação](docs/IMPORT_WORKFLOW.md) para conhecer as regras e os limites.

## Pesquisa por localização

A aplicação já não está limitada a três imobiliárias. Em **Zonas de interesse**, crie concelhos/localidades ou centros com raio e guarde os critérios. Em **Fontes**, acrescente qualquer agência ou portal e configure pesquisas próprias para cada zona.

- **OpenStreetMap:** procura agências mapeadas com site, com cache de 24 horas e atribuição. É opcional, requer Internet e não confirma imóveis disponíveis. A descoberta real continua sem validação nesta cloud; o processamento foi testado com exemplos sintéticos e as falhas de acesso estão no relatório.
- **Pesquisa assistida:** prepara consultas por localização para abrir no navegador. Não executa pesquisas web silenciosas.
- **Referências importadas:** acrescenta candidatos de JSON/CSV/HTML que tenha direito a processar.
- **Recolha configurável:** JSON-LD, HTML por seletores e RSS/Atom, sempre após autorização documentada. Estado, avisos, completude e falhas são visíveis. Nenhuma fonte descoberta é ativada automaticamente.
- **Geografia explícita:** localização textual não equivale a confirmação de limites; coordenadas aproximadas não comprovam inclusão num raio.

A migração da base v1 é automática, com cópia binária prévia. Backups JSON antigos continuam a ser aceites; após restauro, a recolha automática exige nova revisão.

Leia [o catálogo e a investigação real](docs/SOURCE_CATALOG.md), [o modelo de dados](docs/DATA_MODEL.md) e [o guia dos conectores](docs/CONNECTOR_GUIDE.md).

## Instalar e abrir a partir do código

1. Instale Node.js 24 LTS a partir de https://nodejs.org.
2. Abra um terminal na pasta do projeto.
3. Execute `npm ci` para instalar as versões fixadas no lockfile.
4. Execute `npm start` para abrir a aplicação.

A primeira instalação precisa de Internet para descarregar dependências e Electron. A consulta posterior dos dados é local. Não é necessário instalar um servidor de base de dados, criar conta ou fornecer credenciais.

Windows x64 e macOS Apple Silicon são os alvos de distribuição. Neste ambiente Linux não foi possível abrir Electron: o contentor não fornece uma sandbox utilizável. Não desative a sandbox para contornar esse problema; use uma sessão desktop compatível.

## Começar a utilizar

1. Abra **Fontes e importação** e escolha a fonte do ficheiro.
2. Selecione JSON/CSV ou outro formato suportado. Fontes indicadas em cada registo prevalecem sobre a seleção.
3. Reveja a amostra, totais e avisos. Só **Confirmar importação** grava dados; cancelar mantém a base. Se o ficheiro for parcial, é necessário aceitar explicitamente os avisos.
4. Consulte os cartões, filtre os resultados e abra **Ver imóvel e histórico**.
5. Importe novamente o mesmo ficheiro: os anúncios conhecidos não são criados outra vez.
6. Altere um preço no ficheiro e reimporte: o histórico regista a alteração.
7. Em **Configurações**, ajuste URLs, regras de alerta e pesquisas guardadas.
8. Use **Exportar backup** para guardar anúncios, histórico, alertas e configurações. **Restaurar backup** substitui os dados atuais após confirmação e backup preventivo.

Os exemplos em `tests/fixtures/` são **sintéticos e não representam anúncios reais**. A aplicação começa vazia e não os carrega automaticamente. Para experimentar, importe `tests/fixtures/listings.synthetic.json` numa instalação de teste. Use outro perfil do sistema operativo para manter demonstrações separadas de dados reais; não misture os ficheiros de exemplo com a sua base de produção.

### JSON de importação

O preço é expresso em euros; em alternativa, use `priceCents` inteiro. `null` explícito significa desconhecido e pode substituir um valor anterior. Omitir um campo ou deixá-lo vazio conserva o valor conhecido. Referência e título são obrigatórios, e o URL deve pertencer à fonte.

```json
[
  {
    "source": "idealista",
    "reference": "EXEMPLO-SINTETICO-1",
    "url": "https://www.idealista.pt/imovel/exemplo-sintetico-1/",
    "title": "EXEMPLO SINTÉTICO — Moradia T3",
    "location": "Póvoa de Lanhoso",
    "price": "185.000,00",
    "area": 140,
    "typology": "T3",
    "propertyType": "Moradia",
    "description": "Exclusivamente para demonstração."
  }
]
```

CSV usa cabeçalho, vírgula como separador e aspas nos valores com vírgulas:

```csv
source,reference,url,title,location,price,area,typology
idealista,EXEMPLO-1,https://idealista.pt/imovel/exemplo-1/,EXEMPLO SINTÉTICO,Póvoa de Lanhoso,"185.000,00",140,T3
```

O backup JSON versionado **não é** uma recolha. Use a ação de restauro para preservar o histórico. A importação comum representa uma nova observação no momento da importação.

## Fontes

- **Idealista:** pesquisa inicial configurada; JSON/CSV disponíveis. Importação de alertas reais não validada.
- **Boulder:** URL inicial conserva os filtros fornecidos; JSON/CSV disponíveis. HTML real não validado.
- **RE/MAX:** URL por configurar pelo utilizador; JSON/CSV disponíveis.
- **HTML/EML:** suporte genérico e limitado a anúncios em JSON-LD com tipo, título e URL reconhecidos; preços só quando existirem dados monetários suportados. Não é um extrator universal nem um conector validado de e-mails Idealista. Formatos não reconhecidos são rejeitados.

As fontes iniciais não têm automatização ativada. Não há contorno de bloqueios, consulta de caixas de e-mail ou pedidos de credenciais. Nenhuma ausência num ficheiro importado altera o estado de anúncios conhecidos. Apenas recolhas completas e comparáveis podem aplicar a política conservadora de indisponibilidade. Consulte [docs/SOURCES.md](docs/SOURCES.md).

## Onde ficam os dados

A pasta é a devolvida por `app.getPath('userData')` do Electron, normalmente:

- Windows: `%APPDATA%/web-monitor/`
- macOS: `~/Library/Application Support/web-monitor/`
- Linux: `~/.config/web-monitor/`

Contém `monitor.sqlite`, `backups/` e `diagnostics.log`. Não altere a base manualmente com a aplicação aberta. Os backups preventivos não têm limpeza automática nesta versão; reveja o espaço ocupado periodicamente. Os dados não são cifrados: a privacidade depende também das permissões da conta e da proteção do disco. Não se guardam palavras-passe.

## Desenvolvimento e verificação

```sh
npm test
npm run test:report
npm run benchmark
npm run test:desktop
npm run build
```

`npm test` executa testes do núcleo e da interface em DOM simulado. `test:desktop` exige Electron com sessão gráfica e sandbox utilizável, e valida importação, IPC, histórico, exportação/restauro e isolamento. Usa dados sintéticos numa pasta temporária própria.

`benchmark` mede o núcleo Node com 1.000 anúncios; não mede arranque ou RAM total de Electron.

## Preparar instaladores

Na plataforma correspondente, após `npm ci` e testes:

```sh
# Windows x64
npm run dist -- --win --x64 --publish never
# macOS Apple Silicon
npm run dist -- --mac --arm64 --publish never
```

Os resultados ficam em `dist/`. Estes comandos estão preparados, mas não foram executados em Windows/macOS nesta sessão. Os pacotes não têm assinatura/notarização configuradas; a distribuição pública exige tratar esses passos. A pipeline `.github/workflows/desktop.yml` prepara testes e artefactos sem publicar releases. Não foi enviada nem executada no GitHub por esta sessão.

Leia [arquitetura](docs/ARCHITECTURE.md), [resultados dos testes](docs/TEST_REPORT.md) e [roadmap](ROADMAP.md) para conhecer as limitações.

## Pré-visualização sem instalar Electron

Execute `npm run preview` para gerar `dist/preview.html`. Abra esse ficheiro num navegador: contém a mesma interface, estilos e lógica visual da aplicação desktop, com um adaptador de demonstração e 12 anúncios inteiramente fictícios. Não requer servidor ou Internet.

Pode explorar filtros, ordenação, detalhes, histórico e configurações. Os ajustes de configurações duram apenas enquanto a página estiver aberta. Não há acesso à base real, importação/restauro, notificações ou recolha. A exportação contém apenas exemplos identificados como fictícios e não é um backup da aplicação. A preview não valida a integração desktop.

Os novos backups usam o formato JSON v3; a versão 0.3 também lê v1/v2. Não se deve restaurar um backup novo numa aplicação antiga. O esquema SQLite continua v2, com metadados opcionais nos registos JSON. `npm run preview:share` atualiza a preview incluída no ZIP.
