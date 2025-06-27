// =================================================================
// ARQUIVO PRINCIPAL DO SERVIDOR - Code.gs (VERSÃO FINAL CORRIGIDA)
// =================================================================

const NOME_ABA_USUARIOS = "Usuarios";
const NOME_ABA_DADOS = "DADOS";
const NOME_ABA_MODELO = "MODELO";

// =================================================================
// ROTEAMENTO E SERVIÇO DE PÁGINAS HTML
// =================================================================
function doGet(e) {
  const page = e.parameter.page || 'index'; // Define 'index' como página padrão
  let template;

  // Usa um switch para determinar qual template carregar
  switch(page) {
    case 'register':
      template = HtmlService.createTemplateFromFile('Register.html');
      break;
    case 'forgot':
      template = HtmlService.createTemplateFromFile('ForgotPassword.html');
      break;
    case 'reset':
      template = HtmlService.createTemplateFromFile('ResetPassword.html');
      template.token = e.parameter.token || ''; // Passa o token para a página de reset
      break;
    case 'cadastro':
      template = HtmlService.createTemplateFromFile('Cadastro.html');
      break;
    case 'lancamentos':
      template = HtmlService.createTemplateFromFile('Lancamentos.html');
      break;
    case 'login':
      template = HtmlService.createTemplateFromFile('Login.html');
      break;
    default: // 'index' ou qualquer outro valor
      template = HtmlService.createTemplateFromFile('Index.html');
  }
  
  // Avalia o template e retorna o HTML processado
  return template.evaluate()
    .setTitle("Dashboard Roça") // Define um título padrão
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

function getLoginPageHtml() {
  return HtmlService.createHtmlOutputFromFile('Login.html').getContent();
}


// ===== LÓGICA DE CACHE DE PERFORMANCE =====
const cache = CacheService.getScriptCache();
function getFromCache(key) { const cached = cache.get(key); if (cached != null) { return JSON.parse(cached); } return null; }
function putInCache(key, value, expiration = 600) { cache.put(key, JSON.stringify(value), expiration); }


// =================================================================
// FUNÇÕES DE LOGIN, CADASTRO E RECUPERAÇÃO DE SENHA
// =================================================================

function registrarUsuario(email, senhaHash, token) {
  try {
    const abaUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    const dados = abaUsuarios.getDataRange().getValues();
    
    // Verifica se o email já existe em alguma conta ativa
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0].toLowerCase() === email) {
        return { success: false, error: "Este email já pertence a um usuário." };
      }
    }

    // Procura pelo token e verifica se ele está disponível
    for (let i = 1; i < dados.length; i++) {
      // Coluna E (índice 4) é o TOKEN_AUT, Coluna F (índice 5) é o STATUS
      if (dados[i][4] === token) {
        if (dados[i][5] === 'Ativo') {
          return { success: false, error: "Este token de autorização já foi utilizado." };
        }
        
        // Token válido e disponível! Atualiza a linha com os dados do novo usuário.
        const linhaParaAtualizar = i + 1;
        abaUsuarios.getRange(linhaParaAtualizar, 1).setValue(email);
        abaUsuarios.getRange(linhaParaAtualizar, 2).setValue(senhaHash);
        abaUsuarios.getRange(linhaParaAtualizar, 6).setValue('Ativo'); // Marca o token como usado
        
        return { success: true };
      }
    }

    // Se o loop terminar e não encontrar o token
    return { success: false, error: "Token de autorização inválido." };

  } catch(e) {
    Logger.log(e);
    return { success: false, error: "Ocorreu um erro no servidor ao registrar." };
  }
}

function verificarLogin(email, senhaHash) {
  try {
    const abaUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    const dados = abaUsuarios.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase() === email) {
        if (dados[i][1] === senhaHash) return { success: true };
        else return { success: false, error: "Email ou Senha incorreta." };
      }
    }
    return { success: false, error: "Usuário não encontrado." };
  } catch(e) {
    Logger.log(e);
    return { success: false, error: "Erro ao verificar o login." };
  }
}

function iniciarResetSenha(email) {
  try {
    const abaUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    const dados = abaUsuarios.getRange(1, 1, abaUsuarios.getLastRow(), 1).getValues();
    const emails = dados.flat().map(e => String(e).toLowerCase());
    const rowIndex = emails.indexOf(email);

    if (rowIndex === -1) {
      return { success: true };
    }
    
    const token = Utilities.getUuid();
    const expiration = new Date(new Date().getTime() + 60 * 60 * 1000); // Válido por 1 hora
    
    abaUsuarios.getRange(rowIndex + 1, 3).setValue(token);
    abaUsuarios.getRange(rowIndex + 1, 4).setValue(expiration);
    
    const resetUrl = `${getScriptUrl()}?page=reset&token=${token}`;
    const subject = "Redefinição de Senha - Dashboard da Roça";
    const body = `Olá,\n\nVocê solicitou a redefinição de sua senha. Clique no link abaixo para criar uma nova senha. Este link é válido por 1 hora.\n\n${resetUrl}\n\nSe você não solicitou isso, pode ignorar este e-mail.\n\nAtenciosamente,\nEquipe Dashboard da Roça`;
    
    MailApp.sendEmail(email, subject, body);
    return { success: true };
  } catch (e) {
    Logger.log(e);
    return { success: true };
  }
}

function verificarToken(token) {
  try {
    if (!token) return { success: false };
    const abaUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    const dados = abaUsuarios.getRange(1, 3, abaUsuarios.getLastRow(), 2).getValues();
    
    for (let i = 0; i < dados.length; i++) {
      if (dados[i][0] === token) {
        const expirationDate = new Date(dados[i][1]);
        if (expirationDate > new Date()) {
          return { success: true };
        }
      }
    }
    return { success: false };
  } catch (e) { Logger.log(e); return { success: false }; }
}

function redefinirSenha(token, novaSenhaHash) {
  try {
    if (!token) return { success: false, error: "Token inválido." };
    const abaUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    const dados = abaUsuarios.getRange(1, 3, abaUsuarios.getLastRow(), 2).getValues();
    
    for (let i = 0; i < dados.length; i++) {
      if (dados[i][0] === token) {
        const expirationDate = new Date(dados[i][1]);
        if (expirationDate > new Date()) {
          const userRow = i + 1;
          abaUsuarios.getRange(userRow, 2).setValue(novaSenhaHash);
          abaUsuarios.getRange(userRow, 3, 1, 2).clearContent();
          return { success: true };
        }
      }
    }
    return { success: false, error: "Link de redefinição inválido ou expirado." };
  } catch (e) { Logger.log(e); return { success: false, error: "Ocorreu um erro ao redefinir a senha." }; }
}

// =================================================================
// FUNÇÕES DE NEGÓCIO (CADASTRO, LANÇAMENTOS, DASHBOARD)
// =================================================================

function getFuncionarios() {
  const cacheKey = 'lista_funcionarios';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const todasAsAbas = planilha.getSheets();
  const funcionarios = [];
  const abasParaIgnorar = [NOME_ABA_MODELO, NOME_ABA_DADOS, NOME_ABA_USUARIOS];
  
  todasAsAbas.forEach(aba => {
    const nomeAba = aba.getName();
    if (!abasParaIgnorar.map(n => n.toUpperCase()).includes(nomeAba.toUpperCase())) {
      funcionarios.push(nomeAba);
    }
  });
  
  const sortedFuncionarios = funcionarios.sort();
  putInCache(cacheKey, sortedFuncionarios);
  return sortedFuncionarios;
}

function getDadosFuncionario(nomeFuncionario) {
  const cacheKey = `dados_func_${nomeFuncionario}`;
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName(nomeFuncionario);
    if (!aba) throw new Error("Funcionário não encontrado");
    if (aba.getLastRow() < 2) return { sucesso: true, vendas: [], gastos: [] };

    const data = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();
    const vendas = [];
    const gastos = [];

    data.forEach((linha, index) => {
      if (linha[0] && linha[0] instanceof Date) {
        vendas.push({
          id: `venda_${index}`, data: linha[0].toISOString(), quantidade: linha[1],
          produto: linha[2], comprador: linha[3], valor: linha[4],
          valorTotal: linha[5], status: linha[6]
        });
      }
      if (linha[8] && linha[8] instanceof Date) {
        gastos.push({
          id: `gasto_${index}`, data: linha[8].toISOString(), quantidade: linha[9],
          insumo: linha[10], valor: linha[11], valorTotal: linha[12], status: linha[13]
        });
      }
    });
    const resultado = { sucesso: true, vendas, gastos };
    putInCache(cacheKey, resultado, 300);
    return resultado;
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function salvarLancamentos(nomeFuncionario, dados) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName(nomeFuncionario);
    if (!aba) throw new Error("Funcionário não encontrado");

    if (aba.getLastRow() > 1) {
      aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).clearContent();
    }

    const vendas = dados.vendas || [];
    const gastos = dados.gastos || [];
    const maxLinhas = Math.max(vendas.length, gastos.length);

    if (maxLinhas === 0) {
        cache.remove(`dados_func_${nomeFuncionario}`);
        cache.remove('dados_iniciais_dashboard');
        return { sucesso: true };
    }
    
    const dadosParaSalvar = [];
    for (let i = 0; i < maxLinhas; i++) {
      const linha = new Array(14).fill(null);
      if (vendas[i]) {
        linha[0] = new Date(vendas[i].data);
        linha[1] = vendas[i].quantidade || null;
        linha[2] = vendas[i].produto || null;
        linha[3] = vendas[i].comprador || null;
        linha[4] = vendas[i].valor || null;
        linha[5] = vendas[i].valorTotal || null;
        linha[6] = vendas[i].status || null;
      }
      if (gastos[i]) {
        linha[8] = new Date(gastos[i].data);
        linha[9] = gastos[i].quantidade || null;
        linha[10] = gastos[i].insumo || null;
        linha[11] = gastos[i].valor || null;
        linha[12] = gastos[i].valorTotal || null;
        linha[13] = gastos[i].status || null;
      }
      dadosParaSalvar.push(linha);
    }

    if (dadosParaSalvar.length > 0) {
      aba.getRange(2, 1, dadosParaSalvar.length, 14).setValues(dadosParaSalvar);
    }
    
    cache.remove(`dados_func_${nomeFuncionario}`);
    cache.remove('dados_iniciais_dashboard');

    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, erro: e.message };
  }
}

const COLUNAS_CADASTRO = { 'produto': 1, 'comprador': 2, 'insumo': 3 };

function getDadosCadastro() {
  const cacheKey = 'dados_cadastro';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DADOS);
    if (!aba) throw new Error(`A aba "${NOME_ABA_DADOS}" não foi encontrada.`);
    
    const lastRow = aba.getLastRow();
    const dados = {
      produtos: lastRow > 1 ? aba.getRange(2, COLUNAS_CADASTRO.produto, lastRow - 1).getValues().flat().filter(String) : [],
      compradores: lastRow > 1 ? aba.getRange(2, COLUNAS_CADASTRO.comprador, lastRow - 1).getValues().flat().filter(String) : [],
      insumos: lastRow > 1 ? aba.getRange(2, COLUNAS_CADASTRO.insumo, lastRow - 1).getValues().flat().filter(String) : []
    };
    putInCache(cacheKey, dados);
    return dados;
  } catch (e) {
    return { erro: e.message };
  }
}

function adicionarItem(tipo, valor) {
  try {
    if (!valor || !tipo) throw new Error("Dados inválidos para adicionar.");
    const coluna = COLUNAS_CADASTRO[tipo];
    if (!coluna) throw new Error("Tipo de cadastro inválido.");
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DADOS);
    const novaLinha = new Array(Object.keys(COLUNAS_CADASTRO).length).fill('');
    novaLinha[coluna - 1] = valor;
    aba.appendRow(novaLinha);

    cache.remove('dados_cadastro');
    cache.remove('dados_iniciais_dashboard');
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function editarItem(tipo, valorAntigo, valorNovo) {
  try {
    if (!valorAntigo || !valorNovo || !tipo) throw new Error("Dados inválidos para editar.");
    const coluna = COLUNAS_CADASTRO[tipo];
    if (!coluna) throw new Error("Tipo de cadastro inválido.");
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DADOS);
    const textFinder = aba.getRange(1, coluna, aba.getLastRow()).createTextFinder(valorAntigo).matchEntireCell(true);
    const celulaEncontrada = textFinder.findNext();
    if (celulaEncontrada) {
      celulaEncontrada.setValue(valorNovo);
      cache.remove('dados_cadastro');
      cache.remove('dados_iniciais_dashboard');
      return { sucesso: true };
    } else {
      throw new Error(`Item "${valorAntigo}" não encontrado para editar.`);
    }
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function excluirItem(tipo, valor) {
  try {
    if (!valor || !tipo) throw new Error("Dados inválidos para excluir.");
    const coluna = COLUNAS_CADASTRO[tipo];
    if (!coluna) throw new Error("Tipo de cadastro inválido.");
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DADOS);
    const textFinder = aba.getRange(1, coluna, aba.getLastRow()).createTextFinder(valor).matchEntireCell(true);
    const celulaEncontrada = textFinder.findNext();
    if (celulaEncontrada) {
      aba.deleteRow(celulaEncontrada.getRow());
      cache.remove('dados_cadastro');
      cache.remove('dados_iniciais_dashboard');
      return { sucesso: true };
    } else {
      throw new Error(`Item "${valor}" não encontrado para excluir.`);
    }
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function adicionarFuncionario(nome) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return { sucesso: false, erro: 'O nome do funcionário não pode estar vazio.' };
    if (planilha.getSheetByName(nomeNormalizado)) return { sucesso: false, erro: 'Já existe um funcionário com esse nome.' };
    const modeloSheet = planilha.getSheetByName(NOME_ABA_MODELO);
    if (!modeloSheet) return { sucesso: false, erro: `A aba "${NOME_ABA_MODELO}" não foi encontrada.` };
    
    const novaAba = modeloSheet.copyTo(planilha);
    novaAba.setName(nomeNormalizado);
    
    cache.remove('lista_funcionarios');
    cache.remove('dados_iniciais_dashboard');
    return { sucesso: true, mensagem: `Funcionário "${nomeNormalizado}" criado com sucesso!` };
  } catch (e) {
    Logger.log(e);
    return { sucesso: false, erro: 'Ocorreu um erro inesperado: ' + e.toString() };
  }
}

function deletarFuncionario(nomeFuncionario) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const abaParaDeletar = planilha.getSheetByName(nomeFuncionario);
    if (abaParaDeletar) {
      if([NOME_ABA_MODELO, NOME_ABA_DADOS, NOME_ABA_USUARIOS].includes(nomeFuncionario.toUpperCase())){
        return { sucesso: false, erro: "Esta aba de sistema não pode ser deletada." };
      }
      planilha.deleteSheet(abaParaDeletar);
      cache.remove('lista_funcionarios');
      cache.remove(`dados_func_${nomeFuncionario}`);
      cache.remove('dados_iniciais_dashboard');
      return { sucesso: true, mensagem: `Funcionário "${nomeFuncionario}" deletado com sucesso.` };
    } else {
      throw new Error("Funcionário não encontrado.");
    }
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}


function getDadosIniciais() {
  const cacheKey = 'dados_iniciais_dashboard';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const todasAsAbas = planilha.getSheets();
  const transacoes = [];
  const funcionariosSet = new Set();
  const dadosCadastrados = getDadosCadastro();
  const produtosSet = new Set(dadosCadastrados.produtos || []);
  const insumosSet = new Set(dadosCadastrados.insumos || []);
  const compradoresSet = new Set(dadosCadastrados.compradores || []);
  const statusSet = new Set();
  const abasParaIgnorar = [NOME_ABA_MODELO, NOME_ABA_DADOS, NOME_ABA_USUARIOS];

  for (const aba of todasAsAbas) {
    const nomeDaAba = aba.getName().trim(); 
    if (abasParaIgnorar.map(n => n.toUpperCase()).includes(nomeDaAba.toUpperCase()) || aba.getLastRow() <= 1) {
      continue; 
    }
    funcionariosSet.add(nomeDaAba); 
    const valores = aba.getDataRange().getValues();
    for (let i = 1; i < valores.length; i++) { 
      const linha = valores[i];
      let dataVenda = linha[0];
      if (dataVenda && typeof dataVenda.getMonth === 'function') {
        const statusVenda = linha[6];
        transacoes.push({ funcionario: nomeDaAba, tipo: 'venda', data: dataVenda.toISOString(), quantidade: linha[1], produto: linha[2], comprador: linha[3], valorUnitario: linha[4], valorTotal: linha[5], status: statusVenda });
        if (statusVenda) statusSet.add(statusVenda);
      }
      let dataGasto = linha[8];
      if (dataGasto && typeof dataGasto.getMonth === 'function') {
        const statusGasto = linha[13];
        transacoes.push({ funcionario: nomeDaAba, tipo: 'gasto', data: dataGasto.toISOString(), quantidade: linha[9], insumo: linha[10], valorUnitario: linha[11], valorTotal: linha[12], status: statusGasto });
        if (statusGasto) statusSet.add(statusGasto);
      }
    }
  }
  const resultado = { transacoes, funcionarios: [...funcionariosSet], produtos: [...produtosSet], insumos: [...insumosSet], compradores: [...compradoresSet], status: [...statusSet] };
  putInCache(cacheKey, resultado);
  return resultado;
}

function gerarPaginaDeFechamento(dadosFiltrados, nomeFuncionarioSelecionado, nomeCompradorSelecionado, tipoDeVisualizacaoAtual) {
  let totalGanhos = 0;
  let totalGastos = 0;
  const dadosDeVendas = dadosFiltrados.filter(item => item.tipo === 'venda');
  const dadosDeGastos = dadosFiltrados.filter(item => item.tipo === 'gasto');
  totalGanhos = dadosDeVendas.reduce((acc, d) => acc + (Number(d.valorTotal) || 0), 0);
  totalGastos = dadosDeGastos.reduce((acc, d) => acc + (Number(d.valorTotal) || 0), 0);
  const saldoFinal = totalGanhos - totalGastos;
  let tituloRelatorio;
  let cabecalhoTabela;
  let linhasTabela;

  if (nomeFuncionarioSelecionado === 'TODOS' && nomeCompradorSelecionado !== 'TODOS') {
    tituloRelatorio = 'Relatório de Fechamento - Comprador: ' + nomeCompradorSelecionado;
    cabecalhoTabela = '<tr><th>Data</th><th>Quantidade</th><th>Produto</th><th>Valor Unitário</th><th>Valor Total</th><th>Funcionário</th></tr>';
    linhasTabela = dadosDeVendas.map(item => {
      const dataFormatada = new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      const quantidade = item.quantidade || '';
      const produto = item.produto || '';
      const valorUnitario = (Number(item.valorUnitario) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const valorTotal = (Number(item.valorTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const funcionario = item.funcionario || '';
      return `<tr><td>${dataFormatada}</td><td>${quantidade}</td><td>${produto}</td><td>${valorUnitario}</td><td style="color:green;">${valorTotal}</td><td>${funcionario}</td></tr>`;
    }).join('');
  } else {
    tituloRelatorio = 'Relatório de Fechamento - ' + (nomeFuncionarioSelecionado === 'TODOS' ? 'Geral' : nomeFuncionarioSelecionado);
    if (tipoDeVisualizacaoAtual === 'VENDAS') {
      cabecalhoTabela = '<tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Comprador</th><th>Valor Unitário</th><th>Valor Total</th><th>Status</th></tr>';
      linhasTabela = dadosDeVendas.map(item => `<tr><td>${new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td><td>Venda</td><td>${item.produto || ''}</td><td>${item.comprador || ''}</td><td>${(Number(item.valorUnitario) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td style="color:green;">${(Number(item.valorTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>${item.status || ''}</td></tr>`).join('');
    } else if (tipoDeVisualizacaoAtual === 'GASTOS') {
      cabecalhoTabela = '<tr><th>Data</th><th>Tipo</th><th>Insumo</th><th>Valor Total</th><th>Status</th></tr>';
      linhasTabela = dadosDeGastos.map(item => `<tr><td>${new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td><td>Gasto</td><td>${item.insumo || ''}</td><td style="color:red;">${(Number(item.valorTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>${item.status || ''}</td></tr>`).join('');
    } else {  
      cabecalhoTabela = '<tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Comprador/Insumo</th><th>Valor Unitário</th><th>Valor Total</th><th>Status</th></tr>';
      linhasTabela = dadosFiltrados.map(item => {
        let valorUnitarioOuNaoAplicavel = '-';
        if (item.tipo === 'venda' && item.valorUnitario !== undefined && item.valorUnitario !== null) {
          valorUnitarioOuNaoAplicavel = (Number(item.valorUnitario) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return `<tr><td>${new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td><td>${item.tipo === 'venda' ? 'Venda' : 'Gasto'}</td><td>${item.tipo === 'venda' ? (item.produto || '') : (item.insumo || '')}</td><td>${item.tipo === 'venda' ? (item.comprador || '') : (item.insumo || '')}</td><td>${valorUnitarioOuNaoAplicavel}</td><td style="color:${item.tipo === 'venda' ? 'green' : 'red'};">${(Number(item.valorTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>${item.status || ''}</td></tr>`;
      }).join('');
    }
  }

  // O HTML gerado agora inclui um botão de impressão e o CSS para escondê-lo ao imprimir.
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Relatório de Fechamento</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            h1, h2 { text-align: center; color: #333; }
            .resumo { margin-top: 20px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9; border-radius: 8px; }
            .resumo p { margin: 5px 0; font-size: 1.1em; }
            .resumo strong { color: #555; }
            
            /* --- NOVAS LINHAS ADICIONADAS --- */
            .print-button-container { text-align: center; margin: 20px 0; }
            .print-button { background-color: #6d28d9; color: white; border: none; padding: 12px 25px; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
            @media print {
                .no-print {
                    display: none !important;
                }
            }
            /* --- FIM DAS NOVAS LINHAS --- */
        </style>
    </head>
    <body>
        <h1>${tituloRelatorio}</h1>

        <div class="print-button-container no-print">
            <button class="print-button" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>

        <table>
            <thead>${cabecalhoTabela}</thead>
            <tbody>${linhasTabela}</tbody>
        </table>

        <div class="resumo">
            <h2>Resumo Financeiro</h2>
            <p><strong>Total de Ganhos:</strong> ${totalGanhos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            <p><strong>Total de Gastos:</strong> ${totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            <hr>
            <p><strong>Saldo Final:</strong> ${saldoFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
    </body>
    </html>
  `;
}