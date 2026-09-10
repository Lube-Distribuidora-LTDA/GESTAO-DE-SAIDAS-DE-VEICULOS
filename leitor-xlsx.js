/* =====================================================================
   leitor-xlsx.js — lê arquivos .xlsx direto no navegador
   ---------------------------------------------------------------------
   Sem bibliotecas e sem internet: um .xlsx é um ZIP com XML dentro, e o
   navegador já traz o que é preciso — DecompressionStream("deflate-raw")
   para descompactar e DOMParser para ler o XML.

   API:  lerXlsx(arrayBuffer) -> Promise<[{ nome, linhas: [[celula,...]] }]>
         cada célula vem como string, número, ou Date.
   ===================================================================== */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------- ZIP */
  function u16(dv, p) { return dv.getUint16(p, true); }
  function u32(dv, p) { return dv.getUint32(p, true); }

  function abrirZip(buffer) {
    var bytes = new Uint8Array(buffer);
    var dv = new DataView(buffer);

    // acha o End of Central Directory varrendo de trás para frente
    var fim = -1;
    var limite = Math.max(0, bytes.length - 66000);
    for (var i = bytes.length - 22; i >= limite; i--) {
      if (u32(dv, i) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error("Arquivo não é um .xlsx válido (ZIP não encontrado).");

    var total = u16(dv, fim + 10);
    var pos = u32(dv, fim + 16);
    var entradas = {};

    for (var n = 0; n < total; n++) {
      if (u32(dv, pos) !== 0x02014b50) break;
      var metodo = u16(dv, pos + 10);
      var compTam = u32(dv, pos + 20);
      var brutoTam = u32(dv, pos + 24);
      var tamNome = u16(dv, pos + 28);
      var tamExtra = u16(dv, pos + 30);
      var tamCom = u16(dv, pos + 32);
      var deslocamento = u32(dv, pos + 42);
      var nome = new TextDecoder("utf-8")
        .decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
      entradas[nome] = {
        metodo: metodo, compTam: compTam, brutoTam: brutoTam,
        deslocamento: deslocamento
      };
      pos += 46 + tamNome + tamExtra + tamCom;
    }

    return { bytes: bytes, dv: dv, entradas: entradas };
  }

  function inflar(bytes) {
    // DecompressionStream é nativo (Chrome/Edge 103+, Firefox 113+)
    var ds = new DecompressionStream("deflate-raw");
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer();
  }

  function extrair(zip, nome) {
    var e = zip.entradas[nome];
    if (!e) return Promise.resolve(null);
    // pula o local file header para chegar aos dados
    var p = e.deslocamento;
    if (u32(zip.dv, p) !== 0x04034b50) return Promise.resolve(null);
    var tamNome = u16(zip.dv, p + 26);
    var tamExtra = u16(zip.dv, p + 28);
    var ini = p + 30 + tamNome + tamExtra;
    var dados = zip.bytes.subarray(ini, ini + e.compTam);

    if (e.metodo === 0) {                        // armazenado, sem compressão
      return Promise.resolve(new TextDecoder("utf-8").decode(dados));
    }
    if (e.metodo !== 8) {
      return Promise.reject(new Error("Compressão ZIP não suportada no arquivo."));
    }
    return inflar(dados).then(function (buf) {
      return new TextDecoder("utf-8").decode(buf);
    });
  }

  /* ------------------------------------------------------------- XML */
  function xml(texto) {
    var doc = new DOMParser().parseFromString(texto, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("XML inválido dentro do .xlsx");
    }
    return doc;
  }
  function filhos(no, tag) {
    // ignora namespace: compara só o nome local
    var saida = [];
    for (var i = 0; i < no.childNodes.length; i++) {
      var f = no.childNodes[i];
      if (f.nodeType === 1 && (f.localName || f.nodeName) === tag) saida.push(f);
    }
    return saida;
  }
  function porTag(raizNo, tag) {
    var todos = raizNo.getElementsByTagName("*"), saida = [];
    for (var i = 0; i < todos.length; i++) {
      if ((todos[i].localName || todos[i].nodeName) === tag) saida.push(todos[i]);
    }
    return saida;
  }

  /* ------------------------------------------------- textos partilhados */
  function lerSharedStrings(texto) {
    if (!texto) return [];
    var doc = xml(texto);
    return porTag(doc.documentElement, "si").map(function (si) {
      // um <si> pode ter vários <t> (texto com formatação); junta todos,
      // pulando os <rPh> (leitura fonética japonesa)
      var partes = [], ts = porTag(si, "t");
      for (var i = 0; i < ts.length; i++) {
        var pai = ts[i].parentNode;
        var nomePai = pai && (pai.localName || pai.nodeName);
        if (nomePai === "rPh") continue;
        partes.push(ts[i].textContent);
      }
      return partes.join("");
    });
  }

  /* ------------------------------------------------------ formatos data */
  var DATA_EMBUTIDA = {};
  [14,15,16,17,18,19,20,21,22,27,30,36,45,46,47,50,57].forEach(function (n) {
    DATA_EMBUTIDA[n] = true;
  });

  function ehFormatoData(codigo) {
    if (!codigo) return false;
    // remove trechos entre aspas e escapes antes de procurar d/m/y/h/s
    var limpo = codigo.replace(/"[^"]*"/g, "").replace(/\\./g, "")
                      .replace(/\[[^\]]*\]/g, "");
    return /[dmyhs]/i.test(limpo) && !/^[#0.,%\s]*$/.test(limpo);
  }

  function lerEstilos(texto) {
    // devolve: indice do cellXf -> true se for formato de data
    if (!texto) return [];
    var doc = xml(texto);
    var personalizados = {};
    porTag(doc.documentElement, "numFmt").forEach(function (nf) {
      personalizados[+nf.getAttribute("numFmtId")] = nf.getAttribute("formatCode");
    });
    var lista = [];
    var cellXfs = porTag(doc.documentElement, "cellXfs")[0];
    if (!cellXfs) return lista;
    filhos(cellXfs, "xf").forEach(function (xf) {
      var id = +(xf.getAttribute("numFmtId") || 0);
      lista.push(personalizados[id] ? ehFormatoData(personalizados[id])
                                    : !!DATA_EMBUTIDA[id]);
    });
    return lista;
  }

  /* ----------------------------------------------------- serial -> Date */
  function serialParaData(n, base1904) {
    // Excel conta dias desde 1899-12-30 (bug do ano 1900 já compensado)
    var origem = base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    var ms = Math.round(n * 86400000);
    var d = new Date(origem + ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  /* ------------------------------------------------------------ células */
  function colunaParaIndice(ref) {
    var m = /^([A-Z]+)/.exec(ref || "");
    if (!m) return -1;
    var letras = m[1], n = 0;
    for (var i = 0; i < letras.length; i++) {
      n = n * 26 + (letras.charCodeAt(i) - 64);
    }
    return n - 1;
  }

  function lerPlanilha(texto, textos, estilos, base1904) {
    var doc = xml(texto);
    var linhas = [];
    porTag(doc.documentElement, "row").forEach(function (row) {
      var numero = +(row.getAttribute("r") || (linhas.length + 1));
      var celulas = [];
      filhos(row, "c").forEach(function (c) {
        var ref = c.getAttribute("r");
        var idx = colunaParaIndice(ref);
        if (idx < 0) idx = celulas.length;
        var tipo = c.getAttribute("t") || "n";
        var estilo = c.getAttribute("s");
        var valor = null;

        if (tipo === "inlineStr") {
          var is = filhos(c, "is")[0];
          valor = is ? porTag(is, "t").map(function (t) {
            return t.textContent; }).join("") : "";
        } else {
          var v = filhos(c, "v")[0];
          var bruto = v ? v.textContent : null;
          if (bruto === null || bruto === "") {
            valor = null;
          } else if (tipo === "s") {
            valor = textos[+bruto] != null ? textos[+bruto] : "";
          } else if (tipo === "str") {
            valor = bruto;
          } else if (tipo === "b") {
            valor = bruto === "1";
          } else if (tipo === "e") {
            valor = null;                            // erro de fórmula
          } else if (tipo === "d") {
            valor = new Date(bruto);
          } else {
            var n = parseFloat(bruto);
            if (isNaN(n)) { valor = bruto; }
            else if (estilo != null && estilos[+estilo]) {
              valor = serialParaData(n, base1904);
            } else { valor = n; }
          }
        }
        celulas[idx] = valor;
      });
      linhas[numero - 1] = celulas;
    });

    // normaliza: sem buracos, sem undefined
    var alt = linhas.length;
    for (var i = 0; i < alt; i++) {
      if (!linhas[i]) { linhas[i] = []; continue; }
      for (var j = 0; j < linhas[i].length; j++) {
        if (linhas[i][j] === undefined) linhas[i][j] = null;
      }
    }
    return linhas;
  }

  /* ------------------------------------------------------------- topo */
  function lerXlsx(buffer) {
    var zip;
    try { zip = abrirZip(buffer); }
    catch (e) { return Promise.reject(e); }

    if (!zip.entradas["xl/workbook.xml"]) {
      return Promise.reject(new Error(
        "Arquivo não parece ser um .xlsx (falta xl/workbook.xml). " +
        "Se for .xls antigo, abra no Excel e salve como .xlsx."));
    }

    return Promise.all([
      extrair(zip, "xl/workbook.xml"),
      extrair(zip, "xl/_rels/workbook.xml.rels"),
      extrair(zip, "xl/sharedStrings.xml"),
      extrair(zip, "xl/styles.xml")
    ]).then(function (partes) {
      var docWb = xml(partes[0]);
      var base1904 = false;
      var pr = porTag(docWb.documentElement, "workbookPr")[0];
      if (pr && (pr.getAttribute("date1904") === "1" ||
                 pr.getAttribute("date1904") === "true")) base1904 = true;

      // rels: r:id -> caminho da planilha
      var caminhos = {};
      if (partes[1]) {
        porTag(xml(partes[1]).documentElement, "Relationship")
          .forEach(function (r) {
            var alvo = r.getAttribute("Target") || "";
            alvo = alvo.replace(/^\/xl\//, "").replace(/^\.\//, "");
            caminhos[r.getAttribute("Id")] = alvo.indexOf("xl/") === 0
              ? alvo : "xl/" + alvo;
          });
      }

      var textos = lerSharedStrings(partes[2]);
      var estilos = lerEstilos(partes[3]);

      var abas = porTag(docWb.documentElement, "sheet").map(function (s, i) {
        var rid = s.getAttribute("r:id") ||
                  s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        return {
          nome: s.getAttribute("name") || ("Planilha" + (i + 1)),
          caminho: caminhos[rid] || ("xl/worksheets/sheet" + (i + 1) + ".xml")
        };
      });
      if (!abas.length) abas = [{nome:"Planilha1", caminho:"xl/worksheets/sheet1.xml"}];

      return Promise.all(abas.map(function (aba) {
        return extrair(zip, aba.caminho).then(function (txt) {
          return {
            nome: aba.nome,
            linhas: txt ? lerPlanilha(txt, textos, estilos, base1904) : []
          };
        });
      }));
    });
  }

  raiz.lerXlsx = lerXlsx;
  if (typeof module !== "undefined" && module.exports) module.exports = { lerXlsx: lerXlsx };
})(typeof window !== "undefined" ? window : globalThis);
