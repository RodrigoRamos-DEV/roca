// =================================================================
// ARQUIVO PRINCIPAL DO SERVIDOR - Code.gs (VERSÃO FINAL COMPLETA)
// =================================================================

/**
 * Função principal que serve a página correta (Dashboard, Cadastro ou Lançamentos)
 * com base no parâmetro 'page' na URL.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'cadastro') {
    return HtmlService.createHtmlOutputFromFile('Cadastro.html').setTitle("Cadastro - Dashboard Roça");
  }
  if (e && e.parameter && e.parameter.page === 'lancamentos') {
    return HtmlService.createHtmlOutputFromFile('Lancamentos.html').setTitle("Lançamentos - Dashboard Roça");
  }
  // Por padrão, abre o Dashboard
  return HtmlService.createHtmlOutputFromFile('Index.html').setTitle("Dashboard Roça");
}

/**
 * Retorna a URL base do script, útil para criar links de navegação entre as páginas.
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ===== LÓGICA DE CACHE DE PERFORMANCE =====
const cache = CacheService.getScriptCache();

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached != null) {
    return JSON.parse(cached);
  }
  return null;
}

function putInCache(key, value, expirationInSeconds = 600) { // Cache de 10 minutos por padrão
  cache.put(key, JSON.stringify(value), expirationInSeconds);
}


// =================================================================
// FUNÇÕES PARA A PÁGINA DE LANÇAMENTOS
// =================================================================

function getFuncionarios() {
  const cacheKey = 'lista_funcionarios';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const todasAsAbas = planilha.getSheets();
  const funcionarios = [];
  const abasParaIgnorar = ["MODELO", "DADOS"];
  todasAsAbas.forEach(aba => {
    const nomeAba = aba.getName();
    if (!abasParaIgnorar.includes(nomeAba.toUpperCase())) {
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
      if (linha[0]) {
        let dataVenda = new Date(linha[0]);
        if (!isNaN(dataVenda.getTime())) {
          vendas.push({
            id: `venda_${index}`, data: dataVenda.toISOString(), quantidade: linha[1],
            produto: linha[2], comprador: linha[3], valor: linha[4],
            valorTotal: linha[5], status: linha[6]
          });
        }
      }
      if (linha[8]) {
        let dataGasto = new Date(linha[8]);
        if (!isNaN(dataGasto.getTime())) {
          gastos.push({
            id: `gasto_${index}`, data: dataGasto.toISOString(), quantidade: linha[9],
            insumo: linha[10], valor: linha[11], valorTotal: linha[12], status: linha[13]
          });
        }
      }
    });
    const resultado = { sucesso: true, vendas, gastos };
    putInCache(cacheKey, resultado, 300); // Cache de 5 minutos
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

    aba.getRange(2, 1, dadosParaSalvar.length, 14).setValues(dadosParaSalvar);
    
    cache.remove(`dados_func_${nomeFuncionario}`);
    cache.remove('dados_iniciais_dashboard');

    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, erro: e.message };
  }
}


// =================================================================
// FUNÇÕES PARA A PÁGINA DE CADASTRO
// =================================================================

const NOME_ABA_DADOS = "DADOS";
const COLUNAS_CADASTRO = {
  'produto': 1,
  'comprador': 2,
  'insumo': 3
};

function getDadosCadastro() {
  const cacheKey = 'dados_cadastro';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DADOS);
    if (!aba) throw new Error(`A aba "${NOME_ABA_DADOS}" não foi encontrada.`);
    
    const maxRows = aba.getMaxRows();
    const dados = {
      produtos: aba.getRange(2, COLUNAS_CADASTRO.produto, maxRows).getValues().flat().filter(String),
      compradores: aba.getRange(2, COLUNAS_CADASTRO.comprador, maxRows).getValues().flat().filter(String),
      insumos: aba.getRange(2, COLUNAS_CADASTRO.insumo, maxRows).getValues().flat().filter(String)
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
    const valoresColuna = aba.getRange(1, coluna, aba.getMaxRows()).getValues();
    let proximaLinhaVazia = valoresColuna.findIndex(celula => celula[0] === '') + 1;
    if (proximaLinhaVazia === 0) proximaLinhaVazia = valoresColuna.length + 1;
    aba.getRange(proximaLinhaVazia, coluna).setValue(valor);

    cache.remove('dados_cadastro');
    cache.remove('dados_iniciais_dashboard');
    return { sucesso: true, mensagem: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} "${valor}" adicionado com sucesso.` };
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
      return { sucesso: true, mensagem: "Item editado com sucesso." };
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
      celulaEncontrada.deleteCells(SpreadsheetApp.Dimension.ROWS);
      cache.remove('dados_cadastro');
      cache.remove('dados_iniciais_dashboard');
      return { sucesso: true, mensagem: "Item excluído com sucesso." };
    } else {
      throw new Error(`Item "${valor}" não encontrado para excluir.`);
    }
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function deletarFuncionario(nomeFuncionario) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const abaParaDeletar = planilha.getSheetByName(nomeFuncionario);
    if (abaParaDeletar) {
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


// =================================================================
// FUNÇÕES PARA A PÁGINA DO DASHBOARD
// =================================================================

function getDadosIniciais() {
  const cacheKey = 'dados_iniciais_dashboard';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const todasAsAbas = planilha.getSheets();
  const transacoes = [];
  const funcionariosSet = new Set();
  const produtosSet = new Set();  
  const insumosSet = new Set();   
  const compradoresSet = new Set(); 
  const statusSet = new Set();
  const abasParaIgnorarCompletamente = ["MODELO", "DADOS"];

  for (const aba of todasAsAbas) {
    const nomeDaAba = aba.getName().trim(); 
    if (abasParaIgnorarCompletamente.includes(nomeDaAba.toUpperCase()) || aba.getLastRow() <= 1) {
      continue; 
    }
    funcionariosSet.add(nomeDaAba); 
    const valores = aba.getDataRange().getValues();
    for (let i = 1; i < valores.length; i++) { 
      const linha = valores[i];
      let dataVenda = linha[0];
      if (dataVenda && dataVenda.getMonth) {
        const produto = linha[2]; const comprador = linha[3]; const statusVenda = linha[6];
        transacoes.push({ funcionario: nomeDaAba, tipo: 'venda', data: dataVenda.toISOString(), quantidade: linha[1], produto: produto, comprador: comprador, valorUnitario: linha[4], valorTotal: linha[5], status: statusVenda });
        if (produto) produtosSet.add(produto); if (comprador) compradoresSet.add(comprador); if (statusVenda) statusSet.add(statusVenda);
      }
      let dataGasto = linha[8];
      if (dataGasto && dataGasto.getMonth) {
        const insumo = linha[10]; const statusGasto = linha[13];
        transacoes.push({ funcionario: nomeDaAba, tipo: 'gasto', data: dataGasto.toISOString(), insumo: insumo, valorTotal: linha[12], status: statusGasto });
        if (insumo) insumosSet.add(insumo); if (statusGasto) statusSet.add(statusGasto);
      }
    }
  }
  const resultado = { transacoes: [...transacoes], funcionarios: [...funcionariosSet], produtos: [...produtosSet], insumos: [...insumosSet], compradores: [...compradoresSet], status: [...statusSet] };
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

  return `<!DOCTYPE html><html><head><title>Relatório de Fechamento</title><style>body{font-family:Arial,sans-serif;margin:40px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background-color:#f2f2f2}h1,h2{text-align:center;color:#333}.resumo{margin-top:20px;padding:15px;border:1px solid #ccc;background:#f9f9f9;border-radius:8px}.resumo p{margin:5px 0;font-size:1.1em}.resumo strong{color:#555}</style></head><body><h1>${tituloRelatorio}</h1><table>${cabecalhoTabela}${linhasTabela}</table><div class="resumo"><h2>Resumo Financeiro</h2><p><strong>Total de Ganhos:</strong> ${totalGanhos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p><strong>Total de Gastos:</strong> ${totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><hr><p><strong>Saldo Final:</strong> ${saldoFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></body></html>`;
}