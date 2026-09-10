/* =====================================================================
   escritor-planilha.js — gera um .xls com a formatação da marca Lube
   ---------------------------------------------------------------------
   Sem bibliotecas: usa o formato "XML Spreadsheet 2003" (SpreadsheetML),
   que é um XML puro (sem ZIP) que o Excel abre nativamente com cores,
   fontes, formatos de data/hora, congelamento de painel e autofiltro —
   o mesmo princípio de leitor-xlsx.js (sem internet, sem dependências).

   API: gerarPlanilhaSaida(linhas, opcoes) -> string (conteúdo do .xls)
   ===================================================================== */
(function (raiz) {
  "use strict";

  var MARCA = "#0E176C", MARCA_ESCURO = "#0B1252";
  var ATRASO_TINTA = "#C52C27", ATRASO_FUNDO = "#FBEAEA";
  var OK_TINTA = "#5D6785", OK_FUNDO = "#EAF6EE";
  var OK_TINTA_FORTE = "#0F7A35";

  function escXml(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function isoHoraPura(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return "1899-12-31T" + p2(h) + ":" + p2(m) + ":" + p2(s) + ".000";
  }
  function isoData(iso) { return iso + "T00:00:00.000"; }

  function celTexto(styleId, texto) {
    return '<Cell ss:StyleID="' + styleId + '"><Data ss:Type="String">' +
      escXml(texto) + "</Data></Cell>";
  }
  function celNumero(styleId, valor) {
    return '<Cell ss:StyleID="' + styleId + '"><Data ss:Type="Number">' +
      (Number(valor) || 0) + "</Data></Cell>";
  }
  function celData(styleId, iso) {
    return '<Cell ss:StyleID="' + styleId + '"><Data ss:Type="DateTime">' +
      isoData(iso) + "</Data></Cell>";
  }
  function celHora(styleId, seg) {
    return '<Cell ss:StyleID="' + styleId + '"><Data ss:Type="DateTime">' +
      isoHoraPura(seg) + "</Data></Cell>";
  }

  var ESTILOS =
    '<Style ss:ID="banner1">' +
      '<Alignment ss:Horizontal="Left" ss:Vertical="Center"/>' +
      '<Font ss:FontName="Calibri" ss:Color="#FFFFFF" ss:Bold="1" ss:Size="16"/>' +
      '<Interior ss:Color="' + MARCA + '" ss:Pattern="Solid"/>' +
    "</Style>" +
    '<Style ss:ID="banner2">' +
      '<Alignment ss:Horizontal="Left" ss:Vertical="Center"/>' +
      '<Font ss:FontName="Calibri" ss:Color="#D8DCF2" ss:Size="10"/>' +
      '<Interior ss:Color="' + MARCA_ESCURO + '" ss:Pattern="Solid"/>' +
    "</Style>" +
    '<Style ss:ID="head">' +
      '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>' +
      '<Font ss:FontName="Calibri" ss:Color="#FFFFFF" ss:Bold="1" ss:Size="10.5"/>' +
      '<Interior ss:Color="' + MARCA + '" ss:Pattern="Solid"/>' +
    "</Style>" +
    '<Style ss:ID="rodape">' +
      '<Alignment ss:Horizontal="Left" ss:Vertical="Center"/>' +
      '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Bold="1" ss:Size="10"/>' +
      '<Interior ss:Color="#E7E9F5" ss:Pattern="Solid"/>' +
    "</Style>" +
    linhaEstilos("atr", ATRASO_FUNDO, ATRASO_TINTA) +
    linhaEstilos("ok", OK_FUNDO, OK_TINTA);

  function linhaEstilos(prefixo, fundo, tintaForte) {
    function base(id, extra) {
      return '<Style ss:ID="' + prefixo + "_" + id + '">' +
        '<Interior ss:Color="' + fundo + '" ss:Pattern="Solid"/>' +
        (extra || "") + "</Style>";
    }
    return (
      base("txt", '<Alignment ss:Horizontal="Left" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Size="10"/>') +
      base("num", '<Alignment ss:Horizontal="Right" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Size="10"/><NumberFormat ss:Format="0"/>') +
      base("km", '<Alignment ss:Horizontal="Right" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Size="10"/><NumberFormat ss:Format="#,##0.0"/>') +
      base("data", '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Size="10"/><NumberFormat ss:Format="dd/mm/yyyy"/>') +
      base("hora", '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="#0C1024" ss:Size="10"/><NumberFormat ss:Format="hh:mm:ss"/>') +
      base("dur", '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="' + tintaForte + '" ss:Bold="1" ss:Size="10"/>' +
        '<NumberFormat ss:Format="[hh]:mm:ss"/>') +
      base("sit", '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/>' +
        '<Font ss:FontName="Calibri" ss:Color="' + tintaForte + '" ss:Bold="1" ss:Size="10"/>')
    );
  }

  var LARGURAS = [78, 90, 68, 175, 95, 110, 100, 95, 62, 75];
  var CABECALHO = ["Data", "Dia da semana", "Placa", "Motorista", "1º horário do dia",
    "Entrada do motorista", "Horas de atraso", "Situação", "Viagens", "KM do dia"];

  function gerarPlanilhaSaida(linhas, opcoes) {
    opcoes = opcoes || {};
    var entradaTxt = opcoes.entrada || "06:30";
    var geradoEm = opcoes.geradoEm || new Date().toLocaleString("pt-BR");
    var periodo = opcoes.periodo || "";

    var ordenadas = linhas.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1
        : a.placa < b.placa ? -1 : a.placa > b.placa ? 1 : 0;
    });

    var linhasXml = ordenadas.map(function (d) {
      var pfx = d.atrasado ? "atr" : "ok";
      return "<Row>" +
        celData(pfx + "_data", d.data) +
        celTexto(pfx + "_txt", d.diaSemana) +
        celTexto(pfx + "_txt", d.placa) +
        celTexto(pfx + "_txt", d.motorista || "Não identificado") +
        celHora(pfx + "_hora", d.saidaSeg) +
        celTexto(pfx + "_hora", entradaTxt) +
        celHora(pfx + "_dur", d.atrasado ? d.atraso : 0) +
        celTexto(pfx + "_sit", d.atrasado ? "Com atraso" : "Sem atraso") +
        celNumero(pfx + "_num", d.viagens) +
        celNumero(pfx + "_km", d.km) +
        "</Row>";
    }).join("");

    var totalAtraso = ordenadas.reduce(function (s, d) { return s + (d.atrasado ? d.atraso : 0); }, 0);
    var totalViagens = ordenadas.reduce(function (s, d) { return s + d.viagens; }, 0);
    var totalKm = Math.round(ordenadas.reduce(function (s, d) { return s + d.km; }, 0) * 10) / 10;
    var totalAtrasados = ordenadas.filter(function (d) { return d.atrasado; }).length;
    function hhmmss(seg) {
      seg = Math.round(Math.abs(seg || 0));
      var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
      return p2(h) + ":" + p2(m) + ":" + p2(s);
    }
    var rodapeTxt = ordenadas.length + " dia(s) no período" +
      (periodo ? " (" + periodo + ")" : "") +
      " · " + totalAtrasados + " com atraso · atraso total " + hhmmss(totalAtraso) +
      " · " + totalViagens + " viagem(ns) · " + totalKm.toLocaleString("pt-BR", { minimumFractionDigits: 1 }) + " km" +
      " · entrada do motorista " + entradaTxt + " · gerado em " + geradoEm;

    var nColunas = CABECALHO.length;
    var nLinhaHeader = 3;
    var nLinhaFim = nLinhaHeader + ordenadas.length;

    var colunasXml = LARGURAS.map(function (w) {
      return '<Column ss:Width="' + w + '"/>';
    }).join("");

    var cabecalhoXml = "<Row ss:Height=\"30\">" + CABECALHO.map(function (c) {
      return celTexto("head", c);
    }).join("") + "</Row>";

    var xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:html="http://www.w3.org/TR/REC-html40">' +
      '<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">' +
      "<Title>Saída de Veículos</Title><Author>Lube Distribuidora</Author>" +
      "</DocumentProperties>" +
      "<Styles>" + ESTILOS + "</Styles>" +
      '<Worksheet ss:Name="Saída de Veículos">' +
      '<Table ss:DefaultColumnWidth="70">' + colunasXml +
      "<Row ss:Height=\"26\">" +
      '<Cell ss:Index="1" ss:MergeAcross="' + (nColunas - 1) + '" ss:StyleID="banner1">' +
        "<Data ss:Type=\"String\">Gestão de Saída de Veículos — Lube Distribuidora</Data></Cell></Row>" +
      "<Row ss:Height=\"20\">" +
      '<Cell ss:Index="1" ss:MergeAcross="' + (nColunas - 1) + '" ss:StyleID="banner2">' +
        "<Data ss:Type=\"String\">" +
        escXml((periodo ? periodo + " · " : "") + "entrada do motorista " + entradaTxt +
          " · sem tolerância · gerado em " + geradoEm) +
        "</Data></Cell></Row>" +
      cabecalhoXml +
      linhasXml +
      "<Row ss:Height=\"22\">" +
      '<Cell ss:Index="1" ss:MergeAcross="' + (nColunas - 1) + '" ss:StyleID="rodape">' +
        "<Data ss:Type=\"String\">" + escXml(rodapeTxt) + "</Data></Cell></Row>" +
      "</Table>" +
      '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' +
      "<FreezePanes/><FrozenNoSplit/>" +
      "<SplitHorizontal>" + nLinhaHeader + "</SplitHorizontal>" +
      "<TopRowBottomPane>" + nLinhaHeader + "</TopRowBottomPane>" +
      "<ActivePane>2</ActivePane><Selected/>" +
      "</WorksheetOptions>" +
      (ordenadas.length
        ? '<AutoFilter x:Range="R' + nLinhaHeader + 'C1:R' + nLinhaFim + 'C' + nColunas +
          '" xmlns="urn:schemas-microsoft-com:office:excel"/>'
        : "") +
      "</Worksheet></Workbook>";

    return xml;
  }

  raiz.gerarPlanilhaSaida = gerarPlanilhaSaida;
  if (typeof module !== "undefined" && module.exports) module.exports = { gerarPlanilhaSaida: gerarPlanilhaSaida };
})(typeof window !== "undefined" ? window : globalThis);
