# Web Monitor para Windows x64 — 0.3.1

Aplicação Electron/JavaScript/sql.js para Windows 10/11 de 64 bits. Não precisa de Node.js no computador de utilização. Esta edição de desenvolvimento não tem assinatura digital; não foi validada a instalação nem a execução gráfica num Windows real nesta cloud Linux. Não existem conectores reais novos validados.

Em 28/10/2026, o EXE portable foi gerado e verificado estruturalmente em Linux; o instalador NSIS ficou bloqueado pelo runtime Wine. A CI está configurada para gerar os dois em Windows nativo. A API GitHub recusou leitura nesta cloud, pelo que a existência do artefacto remoto ainda não foi confirmada. Consulte [o relatório](TEST_REPORT.md) para distinguir estes resultados.

## Obter no GitHub

1. Entre no GitHub e abra [Actions](https://github.com/josesousa035-max/Web-Monitor/actions/workflows/desktop.yml).
2. Escolha a execução da branch `codex/web-monitor-v0.2` correspondente ao commit da entrega. Aguarde pela conclusão do job Windows; uma falha só no job macOS não invalida o artefacto Windows.
3. Em **Artifacts**, descarregue **Web-Monitor-Windows-x64** e extraia o ZIP. O ZIP do código fonte não contém os executáveis. Os artefactos ficam disponíveis durante 30 dias e exigem acesso ao repositório; pode voltar a executar o workflow com **Run workflow**, selecionando a branch.
4. Se não existir o artefacto, consulte o job Windows: não se declara um instalador disponível quando o build ou os testes falham. Não há release pública criada automaticamente.

O artefacto inclui, após build e verificações bem sucedidos:

- `Web-Monitor-0.3.1-windows-x64-setup.exe`: assistente NSIS, atalhos e desinstalador. Instalação por utilizador por omissão, com seleção da pasta.
- `Web-Monitor-0.3.1-windows-x64-portable.exe`: executável sem instalação; extrai os componentes para uma pasta temporária ao abrir.
- `SHA256SUMS.txt`: hashes SHA-256 dos dois executáveis.
- `LEIA-ME-Windows.md`: estas instruções.

Não execute um `setup.exe` intermédio que tenha ficado num build interrompido. Os comandos oficiais só terminam com sucesso depois das verificações estruturais.

## Utilizar e conservar dados

Execute o instalador e abra **Web Monitor** no menu Iniciar, ou abra a edição portable. Windows pode apresentar avisos por a edição não ser assinada; confirme a origem e o hash, e respeite as políticas de segurança do computador. Não é necessário desativar antivírus, SmartScreen ou sandbox. O hash verifica integridade, não identidade do editor.

Os dados continuam em `%APPDATA%\web-monitor\`: `monitor.sqlite`, `backups` e `diagnostics.log`. **Portable refere-se ao executável; os dados não ficam junto ao EXE.** As duas edições partilham a mesma pasta de dados e a aplicação só permite uma instância. Não execute o EXE interno isoladamente da pasta `win-unpacked`; use o instalador ou a edição portable completa.

Antes de atualizar, faça uma exportação pela aplicação e feche-a. O instalador está configurado para conservar os dados na desinstalação; isso não substitui um backup. A preservação numa atualização/desinstalação real está por validar. Não apague `%APPDATA%\web-monitor` para resolver erros.

Para verificar um ficheiro em PowerShell, na pasta extraída:

```powershell
Get-FileHash .\Web-Monitor-0.3.1-windows-x64-setup.exe -Algorithm SHA256
Get-FileHash .\Web-Monitor-0.3.1-windows-x64-portable.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Reproduzir o build em Windows

Requer Node.js 24 e npm; estes são necessários apenas para desenvolvimento/build. No checkout da branch de entrega:

```powershell
npm ci
npm run test:report
npm run test:desktop
npm run dist:win
```

Verifique o sucesso de cada comando antes de continuar. A CI usa estes mesmos controlos, incluindo o teste Electron com sandbox. O build não publica releases. Sem certificado configurado, os executáveis não são assinados. A verificação estrutural compara o código em app.asar com a fonte, versão, arquitetura PE x64 e WASM SQLite; não substitui execução, instalação ou validação de assinatura.

Para gerar apenas a edição portable: `npm run dist:win:portable`. Para rever um pacote já gerado: `npm run verify:win` ou `node scripts/verify-windows.cjs --portable`. O formato da base e os backups mantêm-se inalterados.

## Validação manual ainda necessária

Num Windows de teste, confirmar abertura, importar um ficheiro sintético com revisão/cancelamento/confirmação, consultar histórico, fechar/reabrir e verificar persistência; exportar/restaurar e verificar notificações. Testar instalação, atalhos, atualização e desinstalação preservando dados. Testar portable separadamente, com a aplicação instalada fechada. Não usar dados pessoais sem backup para esta validação.
