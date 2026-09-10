/* =====================================================================
   painel.js — Gestão de Saída de Veículos (Lube Distribuidora / Araujo)
   ---------------------------------------------------------------------
   Indicador: SÓ horas de atraso na primeira saída do dia, contra a
   entrada do motorista (06:30). Sem tolerância — comparação ao segundo.

   Cores e regras seguem o arquivo de design do projeto:
     atraso        #c52c27      ok            #0f7a35
     azul          #2a3ba8      marca         #0e176c
     ranking       vermelho quando >= 60% do maior atraso
     barras do dia vermelho >= 66% do topo, azul >= 33%, cinza abaixo
     aderência     verde >= 80%, azul >= 55%, vermelho abaixo
   ===================================================================== */
(function () {
  "use strict";

  var CHAVE_BASE = "lube.saidaveiculos.base";
  var CHAVE_IMPORT = "lube.saidaveiculos.importacoes";
  var CHAVE_TEMA = "lube.saidaveiculos.tema";

  var COR = {
    atraso: "#c52c27", atrasoClaro: "#f26a5f", atrasoEscuro: "#7c0f0b",
    ok: "#0f7a35", azul: "#2a3ba8", azulClaro: "#6b7ee0", azulEscuro: "#0b1252",
    marca: "#0e176c", marcaVermelho: "#f90a19",
    cinza: "#aab2c6", cinzaClaro: "#c3cadb", cinzaMedio: "#8b95b0",
    cinzaEscuro: "#5d6785", tinta: "#0c1024", apagado: "#8189a3"
  };

  /* ==================================================== utilidades == */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function hhmmss(t) {
    t = Math.round(Math.abs(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(h) + ":" + p(m) + ":" + p(s);
  }
  function hhmm(t) { return hhmmss(t).slice(0, 5); }
  function horaEmSeg(txt) {
    var p = String(txt || "06:30").split(":");
    return (+p[0] || 0) * 3600 + (+p[1] || 0) * 60 + (+p[2] || 0);
  }
  function n(v, c) {
    return Number(v || 0).toLocaleString("pt-BR",
      { minimumFractionDigits: c || 0, maximumFractionDigits: c || 0 });
  }
  function semAcento(txt) {
    return String(txt == null ? "" : txt).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
  function recuperar(chave) {
    try {
      var t = localStorage.getItem(chave);
      return t ? JSON.parse(t) : null;
    } catch (e) { return null; }
  }

  /* ================================================== interatividade ==
     Duas peças pequenas e genéricas, usadas em todo o painel:

     animarNumero()  — conta um número de um valor para outro (usada nos
                       KPIs: "32:16:58" não pula pro novo valor, ele CONTA).

     medirFlip()/animarFlip() — técnica FLIP: mede a posição/tamanho de
                       cada elemento com [data-flip] ANTES do re-render,
                       e depois de o DOM já ter o valor novo, aplica um
                       transform que finge que ele ainda está no lugar
                       antigo e solta, deixando o CSS animar até o normal.
                       Funciona pra qualquer barra do painel (ranking,
                       aderência, dia a dia, faixas, timeline, comparação)
                       sem precisar reescrever cada gráfico. ================ */
  var ANIM_MS = 650;
  function facilitar(t) { return 1 - Math.pow(1 - t, 3); }   // ease-out cubic

  var animacoesNum = {};
  function animarNumero(chave, alvo, aoFrame) {
    var reg = animacoesNum[chave];
    var de = reg ? reg.atual : 0;
    if (reg && reg.raf) cancelAnimationFrame(reg.raf);
    if (Math.abs(de - alvo) < 0.005) {
      animacoesNum[chave] = { atual: alvo, raf: null };
      aoFrame(alvo);
      return;
    }
    var novo = { atual: de, raf: null };
    animacoesNum[chave] = novo;
    var t0 = null;
    function passo(agora) {
      if (t0 === null) t0 = agora;
      var t = Math.min(1, (agora - t0) / ANIM_MS);
      var atual = de + (alvo - de) * facilitar(t);
      novo.atual = atual;
      aoFrame(atual);
      if (t < 1) novo.raf = requestAnimationFrame(passo);
      else { novo.atual = alvo; novo.raf = null; }
    }
    novo.raf = requestAnimationFrame(passo);
  }

  function medirFlip() {
    var mapa = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-flip]"), function (elx) {
      mapa[elx.getAttribute("data-flip")] = elx.getBoundingClientRect();
    });
    return mapa;
  }
  function animarFlip(antes) {
    var pendentes = [], novos = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-flip]"), function (elx) {
      var chave = elx.getAttribute("data-flip");
      var b = elx.getBoundingClientRect();
      if (!b.width && !b.height) return;
      var a = antes[chave];
      if (!a || (!a.width && !a.height)) {
        // elemento novo (não existia no render anterior) — entra com um fade
        elx.style.transition = "none";
        elx.style.opacity = "0";
        novos.push(elx);
        return;
      }
      var dx = (a.left + a.width / 2) - (b.left + b.width / 2);
      var dy = (a.top + a.height / 2) - (b.top + b.height / 2);
      var sx = b.width ? (a.width || b.width) / b.width : 1;
      var sy = b.height ? (a.height || b.height) / b.height : 1;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5 &&
          Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
      elx.style.transition = "none";
      elx.style.transformOrigin = "center center";
      elx.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
      pendentes.push(elx);
    });
    if (!pendentes.length && !novos.length) return;
    void document.body.offsetHeight;    // força reflow, uma vez só
    requestAnimationFrame(function () {
      pendentes.forEach(function (elx) {
        elx.style.transition = "transform .45s cubic-bezier(.22,.9,.3,1)";
        elx.style.transform = "";
      });
      novos.forEach(function (elx) {
        elx.style.transition = "opacity .35s ease";
        elx.style.opacity = "";
      });
      setTimeout(function () {
        pendentes.concat(novos).forEach(function (elx) {
          elx.style.transition = ""; elx.style.transformOrigin = "";
        });
      }, 500);
    });
  }

  /* ============================================ leitura da planilha = */
  var COLUNAS = {
    evento: ["evento"],
    placa: ["placa", "placa / apelido"],
    motorista: ["motorista"],
    inicio: ["hora inicio"],
    final: ["hora final"],
    tempo_movimento: ["tempo em movimento"],
    tempo_ocioso: ["tempo ocioso"],
    duracao: ["duracao"],
    hod_inicial: ["hodometro inicial (km)", "hodometro inicial"],
    hod_final: ["hodometro final (km)", "hodometro final"],
    distancia: ["distancia (km)", "distancia"],
    local_inicial: ["local inicial"],
    local_final: ["local final"]
  };

  function mapearCabecalho(linha) {
    var mapa = {};
    for (var i = 0; i < linha.length; i++) {
      if (linha[i] == null) continue;
      var nome = semAcento(linha[i]);
      for (var chave in COLUNAS) {
        if (chave in mapa) continue;
        if (COLUNAS[chave].indexOf(nome) >= 0) { mapa[chave] = i; break; }
      }
    }
    return mapa;
  }

  function paraData(valor) {
    if (valor == null || valor === "") return null;
    if (valor instanceof Date) return isNaN(valor) ? null : valor;
    var txt = String(valor).trim();
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(txt);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(txt);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  }

  function paraNumero(valor) {
    if (valor == null || valor === "") return 0;
    if (typeof valor === "number") return valor;
    var txt = String(valor).trim().replace(/\./g, "").replace(",", ".");
    var x = parseFloat(txt);
    return isNaN(x) ? 0 : x;
  }

  function duracaoEmSegundos(valor) {
    if (valor == null || valor === "") return 0;
    if (valor instanceof Date) {
      return valor.getHours() * 3600 + valor.getMinutes() * 60 + valor.getSeconds();
    }
    var txt = String(valor).trim(), dias = 0;
    var m = /^(\d+)\s*d\s*/i.exec(txt);
    if (m) { dias = +m[1]; txt = txt.slice(m[0].length).trim(); }
    var partes = txt.split(":").filter(function (p) { return p !== ""; });
    if (!partes.length) return dias * 86400;
    var nums = partes.map(function (p) { return parseInt(p, 10) || 0; });
    while (nums.length < 3) nums.push(0);
    return dias * 86400 + nums[0] * 3600 + nums[1] * 60 + nums[2];
  }

  function p2(x) { return (x < 10 ? "0" : "") + x; }
  function dataBr(d) { return p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function dataIso(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function horaTxt(d) { return p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds()); }
  function isoParaBr(iso) { var p = String(iso).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  var DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  function extrairDeslocamentos(abas, nomeArquivo) {
    var registros = [], avisos = [];
    abas.forEach(function (aba) {
      var linhas = aba.linhas, mapa = null, primeira = 0;
      for (var i = 0; i < linhas.length; i++) {
        var cand = mapearCabecalho(linhas[i] || []);
        if ("inicio" in cand && "placa" in cand) { mapa = cand; primeira = i + 1; break; }
      }
      if (!mapa) return;

      var placaMeta = "";
      for (var k = 0; k < primeira; k++) {
        var lin = linhas[k] || [];
        for (var c = 0; c < lin.length; c++) {
          if (lin[c] && semAcento(lin[c]).indexOf("placa") === 0) {
            placaMeta = String(lin[c]).split(":").pop().trim();
            break;
          }
        }
        if (placaMeta) break;
      }

      function v(linha, chave) {
        var idx = mapa[chave];
        return (idx != null && idx < linha.length) ? linha[idx] : null;
      }

      for (var r = primeira; r < linhas.length; r++) {
        var linha = linhas[r];
        if (!linha || !linha.some(function (x) { return x != null && x !== ""; })) continue;
        var inicio = paraData(v(linha, "inicio"));
        if (!inicio) continue;
        var evento = String(v(linha, "evento") || "D").trim().toUpperCase();
        if (evento && "DP".indexOf(evento[0]) < 0) continue;
        var placa = String(v(linha, "placa") || placaMeta || "").trim().toUpperCase();
        if (!placa) continue;
        var motorista = String(v(linha, "motorista") || "").trim();
        if (["sem motorista", "none", ""].indexOf(semAcento(motorista)) >= 0) {
          motorista = "";
        }
        var fim = paraData(v(linha, "final"));
        registros.push({
          arquivo: nomeArquivo,
          evento: evento[0] || "D",
          placa: placa,
          motorista: motorista,
          inicio: dataBr(inicio) + " " + horaTxt(inicio),
          final: fim ? dataBr(fim) + " " + horaTxt(fim) : "",
          data: dataIso(inicio),
          inicio_seg: inicio.getHours() * 3600 + inicio.getMinutes() * 60 + inicio.getSeconds(),
          seg_movimento: duracaoEmSegundos(v(linha, "tempo_movimento")),
          seg_ocioso: duracaoEmSegundos(v(linha, "tempo_ocioso")),
          seg_duracao: duracaoEmSegundos(v(linha, "duracao")),
          km: paraNumero(v(linha, "distancia")),
          hod_inicial: paraNumero(v(linha, "hod_inicial")),
          hod_final: paraNumero(v(linha, "hod_final")),
          local_inicial: String(v(linha, "local_inicial") || "").trim(),
          local_final: String(v(linha, "local_final") || "").trim()
        });
      }
    });
    if (!registros.length) {
      avisos.push("não encontrei a tabela de deslocamentos (colunas “Placa” e “Hora início”)");
    }
    return { registros: registros, avisos: avisos };
  }

  /* ================================================ base consolidada = */
  var base = { deslocamentos: [], gerado_em: "" };
  var importacoes = [];

  /* bases geradas por versões antigas do processar.py gravam o texto literal
     "Sem motorista" — normaliza para vazio, igual ao que o leitor novo produz */
  function normalizarMotorista(txt) {
    var t = String(txt || "").trim();
    return ["sem motorista", "none", ""].indexOf(semAcento(t)) >= 0 ? "" : t;
  }
  function normalizarRegistros(lista) {
    return (lista || []).map(function (r) {
      if (!r.motorista) return r;
      var m = normalizarMotorista(r.motorista);
      return m === r.motorista ? r : Object.assign({}, r, { motorista: m });
    });
  }

  function chaveRegistro(r) {
    return r.placa + "|" + r.evento + "|" + r.inicio + "|" + r.final;
  }
  function juntar(registros) {
    var vistos = {};
    base.deslocamentos.forEach(function (r) { vistos[chaveRegistro(r)] = true; });
    var novos = 0;
    normalizarRegistros(registros).forEach(function (r) {
      var k = chaveRegistro(r);
      if (vistos[k]) return;
      vistos[k] = true;
      base.deslocamentos.push(r);
      novos++;
    });
    return novos;
  }

  /* ============================================ sincronização (Supabase) =
     O painel funciona 100% offline (arquivo dados.js + o que for salvo no
     navegador). Quando supabase-config.js está presente e há internet, ele
     também: (1) busca os deslocamentos gravados no banco ao abrir, e
     (2) envia pro banco tudo que for importado nesta tela — assim os dados
     ficam disponíveis pra qualquer computador, não só pra quem importou.
     Nunca altera nem apaga nada no banco, só acrescenta (RLS só permite
     leitura e inserção). Se der erro (sem internet, banco fora do ar), o
     painel continua funcionando normalmente com os dados que já tinha. */
  var SUP = window.SUPABASE_CONFIG || null;

  function supabaseCabecalhos() {
    return {
      apikey: SUP.anonKey,
      Authorization: "Bearer " + SUP.anonKey,
      "Content-Type": "application/json"
    };
  }

  /* Postgres grava "inicio"/"final" com fuso. Pra mostrar as mesmas horas
     que estavam na planilha original, lê sempre no fuso de São Paulo — não
     no fuso do navegador de quem está olhando o painel. */
  function paraLocalSP(isoUtc) {
    if (!isoUtc) return null;
    var d = new Date(isoUtc);
    if (isNaN(d)) return null;
    var partes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(d);
    var m = {};
    partes.forEach(function (p) { m[p.type] = p.value; });
    if (m.hour === "24") m.hour = "00";
    return new Date(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  }

  /* caminho inverso: texto "dd/mm/aaaa hh:mm:ss" (formato interno) -> ISO
     com o deslocamento fixo de São Paulo (-03:00, sem horário de verão
     desde 2019), pra gravar no banco sem depender do fuso do navegador */
  function paraIsoSP(txt) {
    var d = paraData(txt);
    if (!d) return null;
    function p(v) { return (v < 10 ? "0" : "") + v; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "-03:00";
  }

  function registroDoSupabase(row) {
    var inicio = paraLocalSP(row.inicio);
    if (!inicio) return null;
    var fim = row.final ? paraLocalSP(row.final) : null;
    return {
      arquivo: row.arquivo || "",
      evento: row.evento || "D",
      placa: row.placa,
      motorista: row.motorista || "",
      inicio: dataBr(inicio) + " " + horaTxt(inicio),
      final: fim ? dataBr(fim) + " " + horaTxt(fim) : "",
      data: row.data || dataIso(inicio),
      inicio_seg: inicio.getHours() * 3600 + inicio.getMinutes() * 60 + inicio.getSeconds(),
      seg_movimento: row.seg_movimento || 0,
      seg_ocioso: row.seg_ocioso || 0,
      seg_duracao: row.seg_duracao || 0,
      km: Number(row.km) || 0,
      hod_inicial: Number(row.hod_inicial) || 0,
      hod_final: Number(row.hod_final) || 0,
      local_inicial: row.local_inicial || "",
      local_final: row.local_final || ""
    };
  }

  /* mostra, na tela Importar, se o painel está mesmo conversando com o
     banco de dados agora — em vez de deixar isso invisível (ou, pior,
     dizer que a base "vem do dados.js" mesmo quando veio do banco) */
  function atualizarEstadoNuvem(r) {
    var caixa = el("estado-nuvem"), txt = el("texto-nuvem");
    if (!caixa || !txt) return;
    if (!SUP || !SUP.url || !SUP.anonKey) {
      caixa.className = "estado-nuvem";
      txt.textContent = "Banco de dados não configurado — usando só a base local";
    } else if (r == null) {
      caixa.className = "estado-nuvem";
      txt.textContent = "Conectando ao banco de dados…";
    } else if (r.ok) {
      caixa.className = "estado-nuvem ok";
      txt.textContent = "Conectado ao banco de dados — " + n(r.total) + " deslocamento(s) no Supabase";
    } else {
      caixa.className = "estado-nuvem erro";
      txt.textContent = "Sem conexão com o banco de dados agora — usando a base local deste computador";
    }
  }

  /* busca tudo que estiver no banco e junta na base local (sem duplicar —
     juntar() já ignora o que tiver a mesma chave placa+evento+inicio+final) */
  function buscarDoSupabase() {
    if (!SUP || !SUP.url || !SUP.anonKey) return Promise.resolve({ ok: false, novos: 0, total: 0 });
    return fetch(SUP.url + "/rest/v1/deslocamentos?select=*&order=inicio.asc", {
      headers: supabaseCabecalhos()
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (linhas) {
      var registros = linhas.map(registroDoSupabase).filter(Boolean);
      var novos = juntar(registros);
      return { ok: true, novos: novos, total: linhas.length };
    }).catch(function (e) {
      console.warn("Supabase: não consegui buscar os dados (" + e.message + ") — usando a base local.");
      return { ok: false, novos: 0, total: 0 };
    });
  }

  /* envia deslocamentos novos pro banco — o próprio banco ignora quem já
     existir (constraint única de placa+evento+inicio+final) */
  function enviarParaSupabase(registros) {
    if (!SUP || !SUP.url || !SUP.anonKey || !registros.length) return Promise.resolve(false);
    var corpo = registros.map(function (r) {
      return {
        arquivo: r.arquivo, evento: r.evento, placa: r.placa, motorista: r.motorista || "",
        inicio: paraIsoSP(r.inicio), final: r.final ? paraIsoSP(r.final) : null,
        inicio_seg: r.inicio_seg, seg_movimento: r.seg_movimento, seg_ocioso: r.seg_ocioso,
        seg_duracao: r.seg_duracao, km: r.km, hod_inicial: r.hod_inicial, hod_final: r.hod_final,
        local_inicial: r.local_inicial || "", local_final: r.local_final || ""
      };
    });
    return fetch(SUP.url + "/rest/v1/deslocamentos?on_conflict=placa,evento,inicio,final", {
      method: "POST",
      headers: Object.assign({}, supabaseCabecalhos(),
        { Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + t); });
      return true;
    }).catch(function (e) {
      console.warn("Supabase: não consegui enviar os dados novos (" + e.message + ").");
      return false;
    });
  }

  /* monta um registro por (data, placa) */
  function montarDias() {
    var grupos = {};
    base.deslocamentos.forEach(function (r) {
      if (r.evento !== "D") return;              // só deslocamentos são saída
      var k = r.data + "|" + r.placa;
      (grupos[k] = grupos[k] || []).push(r);
    });

    var ent = horaEmSeg(estado.entrada);
    var dias = [];
    Object.keys(grupos).forEach(function (k) {
      var itens = grupos[k].slice().sort(function (a, b) {
        return a.inicio_seg - b.inicio_seg;
      });
      var pri = itens[0];
      var partes = pri.data.split("-");
      var d = new Date(+partes[0], +partes[1] - 1, +partes[2]);
      var atraso = Math.max(pri.inicio_seg - ent, 0);
      var comNome = itens.filter(function (i) { return i.motorista; });
      var finais = itens.filter(function (i) { return i.final; })
        .map(function (i) { return i.final; }).sort();

      dias.push({
        data: pri.data,
        dataTxt: dataBr(d),
        diaSemana: DIAS_SEMANA[(d.getDay() + 6) % 7],
        fds: d.getDay() === 0 || d.getDay() === 6,
        placa: pri.placa,
        motorista: comNome.length ? comNome[0].motorista : "",
        saidaSeg: pri.inicio_seg,
        saidaTxt: pri.inicio.slice(-8),
        entradaSeg: ent,
        atraso: atraso,
        atrasado: atraso > 0,
        ultimaChegada: finais.length ? finais[finais.length - 1].slice(-8) : "",
        viagens: itens.length,
        km: Math.round(itens.reduce(function (s, i) { return s + i.km; }, 0) * 10) / 10,
        segMovimento: itens.reduce(function (s, i) { return s + i.seg_movimento; }, 0),
        segOcioso: itens.reduce(function (s, i) { return s + i.seg_ocioso; }, 0),
        itens: itens
      });
    });
    dias.sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1
           : a.placa < b.placa ? -1 : a.placa > b.placa ? 1 : 0;
    });
    return dias;
  }

  /* =========================================================== estado */
  var CORTE_NOITE_PADRAO = "18:00:00";
  var PADRAO = {
    de: null, ate: null, entrada: "06:30", dias: "todos", situacao: "todas",
    hmin: "", hmax: "", corteNoite: CORTE_NOITE_PADRAO
  };
  var estado = {
    tela: "frota", placa: null,
    de: null, ate: null, entrada: "06:30", dias: "todos", situacao: "todas",
    hmin: "", hmax: "", corteNoite: CORTE_NOITE_PADRAO,
    ordemFrota: { campo: "atraso", asc: false },
    ordemDias: { campo: "data", asc: true },
    abertos: {}
  };
  var ultimoCorteNoite = CORTE_NOITE_PADRAO;   // pra "ativar" lembrar o último valor

  function faixa() {
    if (!estado.hmin && !estado.hmax) return null;
    var a = estado.hmin ? horaEmSeg(estado.hmin) : 0;
    var b = estado.hmax ? horaEmSeg(estado.hmax) : 86399;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  /* saída à noite (padrão: 18h em diante) não conta pra ninguém — costuma
     ser um trecho avulso, não a rotina da manhã, e distorceria o indicador */
  function corteNoiteSeg() {
    return estado.corteNoite ? horaEmSeg(estado.corteNoite) : null;
  }

  function filtrar(dias, opts) {
    opts = opts || {};
    var fx = faixa();
    var corte = opts.ignorarCorteNoite ? null : corteNoiteSeg();
    return dias.filter(function (d) {
      if (estado.de && d.data < estado.de) return false;
      if (estado.ate && d.data > estado.ate) return false;
      if (estado.dias === "uteis" && d.fds) return false;
      if (estado.dias === "fds" && !d.fds) return false;
      if (fx && (d.saidaSeg < fx.min || d.saidaSeg > fx.max)) return false;
      if (estado.situacao === "atraso" && !d.atrasado) return false;
      if (estado.situacao === "ok" && d.atrasado) return false;
      if (corte != null && d.saidaSeg >= corte) return false;
      return true;
    });
  }

  function resumo(linhas) {
    var r = {
      dias: linhas.length, atrasados: 0, semAtraso: 0, atraso: 0, somaSaida: 0,
      viagens: 0, km: 0, maior: 0, maiorDia: null
    };
    linhas.forEach(function (x) {
      r.atraso += x.atraso; r.somaSaida += x.saidaSeg;
      r.viagens += x.viagens; r.km += x.km;
      if (x.atrasado) r.atrasados++; else r.semAtraso++;
      if (x.atraso > r.maior) { r.maior = x.atraso; r.maiorDia = x; }
    });
    r.saidaMedia = r.dias ? r.somaSaida / r.dias : 0;
    r.medio = r.atrasados ? r.atraso / r.atrasados : 0;
    r.aderencia = r.dias ? (100 * r.semAtraso) / r.dias : 0;
    r.km = Math.round(r.km * 10) / 10;
    return r;
  }

  function agruparPorPlaca(linhas) {
    var mapa = {};
    linhas.forEach(function (d) {
      var p = mapa[d.placa] || (mapa[d.placa] = { placa: d.placa, motorista: "", itens: [] });
      if (!p.motorista && d.motorista) p.motorista = d.motorista;
      p.itens.push(d);
    });
    return Object.keys(mapa).sort().map(function (k) {
      var g = mapa[k];
      var s = resumo(g.itens);
      s.placa = g.placa;
      s.motorista = g.motorista;
      s.itens = g.itens;
      return s;
    });
  }

  function rotuloMotorista(m) { return m || "sem motorista no relatório"; }

  /* ========================================================== tooltip */
  var dica = el("dica");
  function mostrarDica(html, ev) {
    dica.innerHTML = html;
    dica.classList.add("on");
    dica.setAttribute("aria-hidden", "false");
    var cr = dica.getBoundingClientRect();
    var x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + cr.width > window.innerWidth - 8) x = ev.clientX - cr.width - 16;
    if (y + cr.height > window.innerHeight - 8) y = ev.clientY - cr.height - 16;
    dica.style.left = Math.max(8, x) + "px";
    dica.style.top = Math.max(8, y) + "px";
  }
  function esconderDica() {
    dica.classList.remove("on");
    dica.setAttribute("aria-hidden", "true");
  }
  document.addEventListener("scroll", esconderDica, true);

  function ligarDica(no, conteudo) {
    no.addEventListener("mousemove", function (ev) { mostrarDica(conteudo(), ev); });
    no.addEventListener("mouseleave", esconderDica);
    no.addEventListener("focus", function () {
      var r = no.getBoundingClientRect();
      mostrarDica(conteudo(), { clientX: r.left + r.width / 2, clientY: r.top });
    });
    no.addEventListener("blur", esconderDica);
  }
  function listaDica(titulo, pares) {
    return '<div class="t">' + esc(titulo) + "</div><dl>" +
      pares.map(function (p) {
        return "<dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd>";
      }).join("") + "</dl>";
  }

  /* ============================================================= KPIs */
  /* os números não pulam pro valor novo — eles CONTAM (animarNumero) e o
     cartão pisca uma vez quando o valor realmente muda, pra deixar claro
     que o filtro surtiu efeito */
  var ICONES = {
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/>' +
      '<circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none"/>',
    ampulheta: '<path d="M7 3h10M7 21h10M7 3c0 5.5 5 6 5 9s-5 3.5-5 9M17 3c0 5.5-5 6-5 9s5 3.5 5 9"/>',
    alerta: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4"/>' +
      '<circle cx="12" cy="16.7" r=".6" fill="currentColor" stroke="none"/>',
    sol: '<circle cx="12" cy="12" r="4.3"/><path d="M12 3v2.4M12 18.6V21M4.9 4.9l1.7 1.7' +
      'M17.4 17.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.4"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/>',
    lua: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5Z"/>'
  };
  function svgIcone(nome) {
    return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONES[nome] || "") + "</svg>";
  }

  /* ============================================================= tema ==
     claro (padrão) ou escuro — só troca a pele visual (estilo.css reage a
     [data-tema="escuro"] na <html>), nada na lógica do painel muda */
  function aplicarTema(t) {
    document.documentElement.setAttribute("data-tema", t);
    guardar(CHAVE_TEMA, t);
    var bt = el("bt-tema");
    if (bt) {
      bt.innerHTML = svgIcone(t === "escuro" ? "lua" : "sol");
      bt.setAttribute("aria-label", t === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro");
    }
  }
  function formatarTipo(tipo, v) {
    if (tipo === "hhmmss") return hhmmss(v);
    if (tipo === "hhmm") return hhmm(v);
    if (tipo === "pct1") return n(v, 1);
    return n(Math.round(v));
  }
  var kpiValorAnterior = {};
  function pintarKpis(destino, cartoes) {
    var caixa = el(destino);
    var assinatura = cartoes.map(function (k) { return k.rot; }).join("|");
    if (caixa.getAttribute("data-assinatura") !== assinatura) {
      caixa.setAttribute("data-assinatura", assinatura);
      caixa.innerHTML = cartoes.map(function (k, i) {
        var chave = destino + ":" + i;
        var partida = animacoesNum[chave] ? animacoesNum[chave].atual : 0;
        return '<div class="kpi">' +
          '<div class="icone" data-icone="' + esc(k.icone || "") + '" style="background:' + k.cor + '">' +
            svgIcone(k.icone) + "</div>" +
          '<span class="rot">' + esc(k.rot) + "</span>" +
          '<div class="val" style="color:' + (k.tinta || COR.tinta) + '">' +
            '<span class="numero">' + esc(formatarTipo(k.tipo, partida)) + "</span>" +
            (k.un ? '<span class="un">' + esc(k.un) + "</span>" : "") + "</div>" +
          '<div class="obs">' + esc(k.nota || "") + "</div></div>";
      }).join("");
    }
    var cartoesDom = caixa.children;
    cartoes.forEach(function (k, i) {
      var card = cartoesDom[i];
      if (!card) return;
      var iconeEl = card.querySelector(".icone");
      iconeEl.style.background = k.cor;
      if (iconeEl.getAttribute("data-icone") !== (k.icone || "")) {
        iconeEl.setAttribute("data-icone", k.icone || "");
        iconeEl.innerHTML = svgIcone(k.icone);
      }
      var valDiv = card.querySelector(".val");
      valDiv.style.color = k.tinta || COR.tinta;
      var unEl = valDiv.querySelector(".un");
      if (k.un) {
        if (unEl) unEl.textContent = k.un;
        else valDiv.insertAdjacentHTML("beforeend", '<span class="un">' + esc(k.un) + "</span>");
      } else if (unEl) { unEl.remove(); }
      card.querySelector(".obs").textContent = k.nota || "";

      var numeroEl = card.querySelector(".numero");
      var chave = destino + ":" + i;
      var anterior = kpiValorAnterior[chave];
      if (anterior !== undefined && Math.abs(anterior - k.bruto) > 0.005) {
        card.classList.remove("atualizando");
        void card.offsetWidth;
        card.classList.add("atualizando");
      }
      kpiValorAnterior[chave] = k.bruto;
      animarNumero(chave, k.bruto, function (atual) {
        numeroEl.textContent = formatarTipo(k.tipo, atual);
      });
    });
  }

  /* ================================== ranking de atraso por veículo == */
  function pintarRanking(porPlaca) {
    var caixa = el("ranking");
    var cartao = el("cartao-ranking");
    if (!porPlaca.length) {
      cartao.classList.add("oculto");
      caixa.innerHTML = "";
      return;
    }
    cartao.classList.remove("oculto");
    var itens = porPlaca.slice().sort(function (a, b) { return b.atraso - a.atraso; });
    var maxAtraso = Math.max.apply(null, itens.map(function (p) { return p.atraso; }).concat([60]));

    caixa.innerHTML = itens.map(function (p) {
      var vermelho = p.atraso >= maxAtraso * 0.6;
      var cor = vermelho ? COR.atraso : COR.azul;
      return '<button type="button" class="linha-ranking" data-placa="' + esc(p.placa) + '">' +
        "<div><div class=\"placa\">" + esc(p.placa) + "</div>" +
        '<div class="sub">' + esc(rotuloMotorista(p.motorista)) + "</div></div>" +
        '<div class="trilho"><i data-flip="rk-' + esc(p.placa) + '" style="width:' +
          Math.round((p.atraso / maxAtraso) * 100) + "%;background-color:" + cor + '"></i></div>' +
        '<div class="valor" style="color:' + (vermelho ? COR.atraso : COR.tinta) + '">' +
          hhmmss(p.atraso) + "</div></button>";
    }).join("");

    Array.prototype.forEach.call(caixa.querySelectorAll(".linha-ranking"), function (bt) {
      var placa = bt.getAttribute("data-placa");
      var p = itens.filter(function (x) { return x.placa === placa; })[0];
      bt.addEventListener("click", function () { abrirVeiculo(placa); });
      ligarDica(bt, function () {
        return listaDica(p.placa, [
          ["Horas de atraso", hhmmss(p.atraso)],
          ["Dias com atraso", p.atrasados + " de " + p.dias],
          ["Atraso médio", hhmmss(p.medio)],
          ["Maior atraso", hhmmss(p.maior)],
          ["Aderência", n(p.aderencia, 1) + "%"],
          ["1º horário médio", hhmmss(p.saidaMedia)]
        ]);
      });
    });
  }

  /* ======================================== atraso da frota dia a dia */
  /* o alvo clicável/hover é a coluna inteira (.alvo-dia), não só o desenho
     da barra — assim um dia sem atraso (barra de 3px) continua fácil de
     apontar. Clicar num dia recorta o período pra só aquele dia. */
  function pintarDiaADia(linhas) {
    var plot = el("plot-barras"), rot = el("rotulos-dia");
    if (!linhas.length) {
      plot.innerHTML = '<p class="vazio">Nenhum dia no filtro selecionado.</p>';
      rot.innerHTML = "";
      el("pior-dia").textContent = "—";
      return;
    }
    var porDia = {}, detalhe = {};
    linhas.forEach(function (r) {
      porDia[r.data] = (porDia[r.data] || 0) + r.atraso;
      (detalhe[r.data] = detalhe[r.data] || []).push(r);
    });
    var chaves = Object.keys(porDia).sort();
    var maxDia = Math.max.apply(null, chaves.map(function (k) { return porDia[k]; }).concat([600]));
    var topo = Math.ceil(maxDia / 1800) * 1800 || 1800;
    var maior = Math.max.apply(null, chaves.map(function (k) { return porDia[k]; }).concat([0]));

    var grade = [1, 0.75, 0.5, 0.25, 0].map(function (f) {
      return { pct: Math.round((1 - f) * 1000) / 10, rot: hhmm(topo * f) };
    });

    plot.innerHTML =
      grade.map(function (g) {
        return '<div class="grade-h" style="top:' + g.pct + '%"><span>' + g.rot + "</span></div>";
      }).join("") +
      '<div class="linha-zero"></div>' +
      '<div class="faixa-barras">' + chaves.map(function (k) {
        var v = porDia[k];
        var alto = v >= topo * 0.66, medio = v >= topo * 0.33;
        var cor = alto ? COR.atraso : medio ? COR.azul : COR.cinzaMedio;
        var tinta = alto ? COR.atraso : medio ? "#1a2680" : COR.apagado;
        var ehPior = v > 0 && v === maior;
        var pct = Math.round((v / topo) * 1000) / 10;
        return '<div class="col-barra"><button type="button" class="alvo-dia" data-dia="' + k +
          '" aria-label="' + isoParaBr(k) + ", atraso somado " + hhmmss(v) +
          '. Clique para ver só este dia.">' +
          '<span class="barra' + (ehPior ? " pior" : "") + '" data-flip="dia-' + k +
          '" style="height:' + pct + "%;background-color:" + cor + '">' +
          (v > 0 ? '<span class="' + (ehPior ? "" : "fraco") + '" style="color:' + tinta + '">' +
            hhmm(v) + "</span>" : "") +
          "</span></button></div>";
      }).join("") + "</div>";

    rot.innerHTML = chaves.map(function (k) {
      var cor = porDia[k] === maior && porDia[k] > 0 ? COR.atraso : COR.apagado;
      return '<div style="color:' + cor + '">' + k.slice(8) + "</div>";
    }).join("");

    var pior = chaves.filter(function (k) { return porDia[k] === maior; })[0];
    el("pior-dia").textContent = pior && maior > 0
      ? pior.slice(8) + "/" + pior.slice(5, 7) + " · " + hhmmss(maior) : "—";

    Array.prototype.forEach.call(plot.querySelectorAll(".alvo-dia"), function (b) {
      var k = b.getAttribute("data-dia");
      ligarDica(b, function () {
        var itens = detalhe[k].slice().sort(function (a, c) { return c.atraso - a.atraso; });
        var pares = [["Atraso somado", hhmmss(porDia[k])],
                     ["Veículos com saída", String(itens.length)]];
        itens.slice(0, 6).forEach(function (x) {
          pares.push([x.placa + " · saiu " + x.saidaTxt.slice(0, 5),
                      x.atrasado ? hhmmss(x.atraso) : "sem atraso"]);
        });
        if (itens.length > 6) pares.push(["…", "+" + (itens.length - 6)]);
        return listaDica(isoParaBr(k) + " · " + detalhe[k][0].diaSemana +
          " · clique pra ver só este dia", pares);
      });
      b.addEventListener("click", function () { abrirDia(k); });
    });
  }

  /* recorta o período pro dia clicado no gráfico "dia a dia" */
  function abrirDia(k) {
    estado.de = k; estado.ate = k;
    el("f-de").value = k; el("f-ate").value = k;
    esconderDica();
    render();
  }

  /* ============================================ % de saídas atrasadas == */
  /* aqui é o inverso da aderência: quanto maior a barra, pior — é o
     percentual de dias em que o veículo saiu depois das 06:30 (ou da
     entrada configurada), não o percentual de dias em dia */
  function corAderencia(pc) {                 // ainda usada na tabela/KPI de aderência
    return pc >= 80 ? COR.ok : pc >= 55 ? COR.azul : COR.atraso;
  }
  function corPctAtraso(pc) {
    return pc <= 20 ? COR.ok : pc <= 45 ? COR.azul : COR.atraso;
  }
  function pintarAderencia(porPlaca) {
    var caixa = el("aderencia");
    if (!porPlaca.length) {
      caixa.innerHTML = '<p class="vazio">Nenhum veículo no filtro selecionado.</p>';
      return;
    }
    caixa.innerHTML = porPlaca.slice()
      .map(function (p) {
        return Object.assign({}, p, { pctAtraso: p.dias ? (100 * p.atrasados / p.dias) : 0 });
      })
      .sort(function (a, b) { return b.pctAtraso - a.pctAtraso; })     // pior primeiro
      .map(function (p) {
        var cor = corPctAtraso(p.pctAtraso);
        var tinta = p.pctAtraso >= 45 ? COR.atraso : COR.tinta;
        return '<div class="linha-aderencia">' +
          '<div class="nome">' + esc(p.motorista || p.placa) + "</div>" +
          '<div class="pl">' + esc(p.motorista ? p.placa : "") + "</div>" +
          '<div class="trilho-fino"><i data-flip="ad-' + esc(p.placa) + '" style="width:' +
            Math.round(p.pctAtraso) + "%;background-color:" + cor + '"></i></div>' +
          '<div class="pc" style="color:' + tinta + '">' + n(p.pctAtraso, 0) + "%</div></div>";
      }).join("");
  }

  /* =================================================== piores casos == */
  function pintarAlertas(linhas) {
    var caixa = el("alertas");
    var piores = linhas.slice().filter(function (x) { return x.atrasado; })
      .sort(function (a, b) { return b.atraso - a.atraso; }).slice(0, 5);
    if (!piores.length) {
      caixa.innerHTML = '<p class="vazio" style="color:rgba(255,255,255,.75)">' +
        "Nenhum atraso no período filtrado.</p>";
      return;
    }
    caixa.innerHTML = piores.map(function (x) {
      return '<button type="button" class="alerta" data-placa="' + esc(x.placa) + '">' +
        '<div><div class="pl">' + esc(x.placa) +
          (x.motorista ? ' <span>' + esc(x.motorista) + "</span>" : "") + "</div>" +
        '<div class="quando">' + esc(x.dataTxt) + " · " + esc(x.diaSemana) +
          " · saiu " + esc(x.saidaTxt) + " · entrada " + esc(estado.entrada) + "</div></div>" +
        '<div class="val">' + hhmm(x.atraso) + "</div></button>";
    }).join("");
    Array.prototype.forEach.call(caixa.querySelectorAll(".alerta"), function (bt) {
      bt.addEventListener("click", function () {
        abrirVeiculo(bt.getAttribute("data-placa"));
      });
    });
  }

  /* ============================================ tabela: consolidado == */
  var COL_FROTA = [
    { campo: "placa", rot: "Placa" },
    { campo: "motorista", rot: "Motorista" },
    { campo: "dias", rot: "Dias", dir: true },
    { campo: "saidaMedia", rot: "1º horário médio", dir: true },
    { campo: "atrasados", rot: "Dias c/ atraso", dir: true },
    { campo: "atraso", rot: "Horas de atraso", dir: true },
    { campo: "medio", rot: "Atraso médio", dir: true },
    { campo: "maior", rot: "Maior atraso", dir: true },
    { campo: "aderencia", rot: "Aderência", dir: true }
  ];

  function pintarTabelaFrota(porPlaca, rF) {
    var cab = el("tab-frota-cab");
    cab.innerHTML = COL_FROTA.map(function (c) {
      var seta = estado.ordemFrota.campo === c.campo
        ? ' <span class="seta">' + (estado.ordemFrota.asc ? "▲" : "▼") + "</span>" : "";
      return '<th class="ordenavel' + (c.dir ? " dir" : "") + '" data-campo="' + c.campo +
        '" scope="col">' + esc(c.rot) + seta + "</th>";
    }).join("");
    Array.prototype.forEach.call(cab.querySelectorAll("th"), function (th) {
      th.addEventListener("click", function () {
        var campo = th.getAttribute("data-campo");
        if (estado.ordemFrota.campo === campo) estado.ordemFrota.asc = !estado.ordemFrota.asc;
        else {
          estado.ordemFrota.campo = campo;
          estado.ordemFrota.asc = campo === "placa" || campo === "motorista";
        }
        render();
      });
    });

    var campo = estado.ordemFrota.campo, dir = estado.ordemFrota.asc ? 1 : -1;
    var itens = porPlaca.slice().sort(function (a, b) {
      var va = a[campo], vb = b[campo];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      va = String(va || ""); vb = String(vb || "");
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });

    var corpo = el("tab-frota").tBodies[0];
    if (!itens.length) {
      corpo.innerHTML = '<tr><td colspan="' + COL_FROTA.length + '" class="vazio">' +
        "Nenhum veículo no filtro selecionado.</td></tr>";
      el("tab-frota").tFoot.innerHTML = "";
      return;
    }
    corpo.innerHTML = itens.map(function (p) {
      return '<tr class="clicavel" data-placa="' + esc(p.placa) + '" tabindex="0">' +
        '<td class="pl">' + esc(p.placa) + "</td>" +
        '<td class="suave">' + esc(p.motorista || "—") + "</td>" +
        '<td class="dir">' + n(p.dias) + "</td>" +
        '<td class="dir">' + hhmm(p.saidaMedia) + "</td>" +
        '<td class="dir">' + n(p.atrasados) + "</td>" +
        '<td class="dir" style="font-weight:700;color:' +
          (p.atraso ? COR.atraso : COR.apagado) + '">' + hhmmss(p.atraso) + "</td>" +
        '<td class="dir">' + hhmm(p.medio) + "</td>" +
        '<td class="dir">' + hhmm(p.maior) + "</td>" +
        "<td><div class=\"med-aderencia\">" +
          '<div class="t"><i data-flip="tf-' + esc(p.placa) + '" style="width:' +
            Math.round(p.aderencia) + "%;background-color:" + corAderencia(p.aderencia) + '"></i></div>' +
          '<span class="num" style="font-weight:600">' + n(p.aderencia, 0) + "%</span>" +
        "</div></td></tr>";
    }).join("");

    Array.prototype.forEach.call(corpo.querySelectorAll("tr.clicavel"), function (tr) {
      var placa = tr.getAttribute("data-placa");
      tr.addEventListener("click", function () { abrirVeiculo(placa); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirVeiculo(placa); }
      });
    });

    el("tab-frota").tFoot.innerHTML = "<tr>" +
      "<td>" + itens.length + (itens.length === 1 ? " veículo" : " veículos") + "</td>" +
      "<td></td>" +
      '<td class="dir">' + n(rF.dias) + "</td>" +
      '<td class="dir">' + hhmm(rF.saidaMedia) + "</td>" +
      '<td class="dir">' + n(rF.atrasados) + "</td>" +
      '<td class="dir" style="color:' + COR.atraso + '">' + hhmmss(rF.atraso) + "</td>" +
      '<td class="dir">' + hhmm(rF.medio) + "</td>" +
      '<td class="dir">' + hhmm(rF.maior) + "</td>" +
      '<td class="dir">' + n(rF.aderencia, 0) + "%</td></tr>";
  }

  /* ============================================ tela do veículo ===== */
  function pintarTimeline(itens, ent) {
    var caixa = el("timeline");
    if (!itens.length) {
      caixa.innerHTML = '<p class="vazio" style="grid-column:1/-1">' +
        "Nenhum dia no filtro selecionado.</p>";
      return;
    }
    var segs = itens.map(function (x) { return x.saidaSeg; }).concat([ent]);
    var hMin = Math.floor(Math.min.apply(null, segs) / 3600);
    var hMax = Math.max(hMin + 1, Math.ceil(Math.max.apply(null, segs) / 3600));
    var t0 = hMin * 3600, t1 = hMax * 3600;
    function pct(s) { return ((s - t0) / (t1 - t0)) * 100; }

    var passo = (hMax - hMin) > 10 ? 2 : 1;
    var eixo = [];
    for (var h = hMin; h <= hMax; h += passo) {
      eixo.push({ pct: Math.round(pct(h * 3600) * 100) / 100, rot: p2(h) + "h" });
    }
    var refPct = Math.round(pct(ent) * 100) / 100;

    var html = "<div></div><div class=\"eixo\">" +
      eixo.map(function (e) {
        return '<span style="left:' + e.pct + '%">' + e.rot + "</span>";
      }).join("") + "</div><div></div>";

    html += itens.map(function (x) {
      var a = pct(Math.min(x.saidaSeg, ent)), b = pct(Math.max(x.saidaSeg, ent));
      var cor = x.atrasado ? COR.atraso : COR.cinza;
      var tinta = x.atrasado ? COR.atraso : COR.apagado;
      return '<div class="linha-dia" data-chave="' + esc(x.placa + "|" + x.data) + '">' +
        '<div class="quando">' + esc(x.dataTxt.slice(0, 5) + "  " + x.diaSemana.slice(0, 3)) + "</div>" +
        '<div class="pista">' +
          eixo.map(function (e) {
            return '<span class="tick" style="left:' + e.pct + '%"></span>';
          }).join("") +
          '<span class="ref" style="left:' + refPct + '%"></span>' +
          (x.atrasado ? '<span class="barra-atraso" data-flip="tl-b-' + esc(x.placa + "-" + x.data) +
            '" style="left:' + (Math.round(a * 100) / 100) + "%;width:" +
            (Math.round((b - a) * 100) / 100) + "%;background:" + cor + '"></span>' : "") +
          '<span class="ponto-saida" data-flip="tl-p-' + esc(x.placa + "-" + x.data) +
            '" style="left:' + (Math.round(pct(x.saidaSeg) * 100) / 100) +
            "%;background:" + cor + '"></span>' +
        "</div>" +
        '<div class="valor" style="color:' + tinta + '">' +
          (x.atrasado ? hhmmss(x.atraso) : x.saidaTxt) + "</div></div>";
    }).join("");

    caixa.innerHTML = html;

    var porChave = {};
    itens.forEach(function (x) { porChave[x.placa + "|" + x.data] = x; });
    Array.prototype.forEach.call(caixa.querySelectorAll(".linha-dia"), function (no) {
      var x = porChave[no.getAttribute("data-chave")];
      if (!x) return;
      ligarDica(no, function () {
        return listaDica(x.dataTxt + " · " + x.diaSemana + " · " + x.placa, [
          ["1º horário do dia", x.saidaTxt],
          ["Entrada do motorista", estado.entrada],
          ["Horas de atraso", x.atrasado ? hhmmss(x.atraso) : "sem atraso"],
          ["Viagens no dia", n(x.viagens)],
          ["KM no dia", n(x.km, 1)],
          ["Última chegada", x.ultimaChegada || "—"]
        ]);
      });
    });
  }

  function pintarFaixas(itens, ent) {
    var caixa = el("faixas");
    if (!itens.length) {
      caixa.innerHTML = '<p class="vazio">Nenhum dia no filtro selecionado.</p>';
      return;
    }
    var segs = itens.map(function (x) { return x.saidaSeg; }).concat([ent]);
    var hMin = Math.floor(Math.min.apply(null, segs) / 3600);
    var hMax = Math.max(hMin + 1, Math.ceil(Math.max.apply(null, segs) / 3600));
    var cont = {};
    itens.forEach(function (x) {
      var h = Math.floor(x.saidaSeg / 3600);
      cont[h] = (cont[h] || 0) + 1;
    });
    var maxF = Math.max.apply(null,
      Object.keys(cont).map(function (k) { return cont[k]; }).concat([1]));

    var html = "";
    for (var h = hMin; h <= hMax - 1; h++) {
      var c = cont[h] || 0;
      var cor = h * 3600 >= ent ? COR.atraso : COR.azul;
      html += '<div><span class="qtd">' + c + "</span>" +
        '<div class="barra-v" data-flip="fx-' + h + '" style="height:' +
          (Math.round((c / maxF) * 84 * 10) / 10) + "%;background-color:" + cor + '"></div>' +
        '<span class="hora">' + p2(h) + "h</span></div>";
    }
    caixa.innerHTML = html;
  }

  function pintarComparacao(rV, rF, ent) {
    var linhas = [
      { rot: "Aderência ao horário", val: n(rV.aderencia, 1) + "%",
        frota: n(rF.aderencia, 1) + "%",
        pct: Math.round(rV.aderencia), frotaPct: Math.round(rF.aderencia),
        cor: rV.aderencia >= rF.aderencia ? COR.ok : COR.atraso },
      { rot: "Atraso médio nos dias com atraso", val: hhmm(rV.medio), frota: hhmm(rF.medio),
        pct: Math.round(Math.min(100, (rV.medio / Math.max(rF.medio * 2, 60)) * 100)),
        frotaPct: 50, cor: rV.medio <= rF.medio ? COR.ok : COR.atraso },
      { rot: "1º horário médio", val: hhmm(rV.saidaMedia), frota: hhmm(rF.saidaMedia),
        pct: Math.round(Math.min(100, Math.max(0, ((rV.saidaMedia - ent + 3600) / 7200) * 100))),
        frotaPct: Math.round(Math.min(100, Math.max(0, ((rF.saidaMedia - ent + 3600) / 7200) * 100))),
        cor: rV.saidaMedia <= rF.saidaMedia ? COR.ok : COR.atraso },
      { rot: "Dias com atraso", val: rV.atrasados + " de " + rV.dias,
        frota: n(rF.atrasados) + " de " + n(rF.dias),
        pct: rV.dias ? Math.round((100 * rV.atrasados) / rV.dias) : 0,
        frotaPct: rF.dias ? Math.round((100 * rF.atrasados) / rF.dias) : 0,
        cor: COR.atraso }
    ];
    el("comparacao").innerHTML = linhas.map(function (c, i) {
      return "<div><div class=\"cima\"><span>" + esc(c.rot) + "</span>" +
        '<span class="v">' + esc(c.val) + " <em>· frota " + esc(c.frota) + "</em></span></div>" +
        '<div class="medidor"><i data-flip="cmp-' + i + '" style="width:' + c.pct +
        "%;background-color:" + c.cor + '"></i>' +
        '<b data-flip="cmpf-' + i + '" style="left:' + c.frotaPct + '%"></b></div></div>';
    }).join("");
  }

  var COL_DIAS = [
    { campo: "data", rot: "Data" },
    { campo: "diaSemana", rot: "Dia da semana" },
    { campo: "saidaSeg", rot: "1º horário", dir: true },
    { campo: "entradaSeg", rot: "Entrada", dir: true },
    { campo: "atraso", rot: "Horas de atraso", dir: true },
    { campo: "atrasado", rot: "Situação" },
    { campo: "viagens", rot: "Viagens", dir: true },
    { campo: "km", rot: "KM do dia", dir: true }
  ];

  function linhaViagens(d) {
    var cols = ["#", "Hora início", "Hora final", "Duração", "Em movimento",
                "Ocioso", "KM", "Trajeto"];
    return '<tr class="detalhe"><td colspan="' + COL_DIAS.length + '">' +
      '<div class="viagens"><h4>Viagens de ' + esc(d.dataTxt) + " · " + esc(d.placa) +
      " · " + d.viagens + " deslocamento(s)</h4>" +
      '<table class="interna"><thead><tr>' +
      cols.map(function (c, i) {
        return "<th" + (i >= 3 && i <= 6 ? ' class="dir"' : "") + ">" + esc(c) + "</th>";
      }).join("") + "</tr></thead><tbody>" +
      d.itens.map(function (it, i) {
        var trajeto = esc(it.local_inicial || "—");
        if (it.local_final) trajeto += '<span class="sep">→</span>' + esc(it.local_final);
        return "<tr>" +
          '<td class="dir">' + (i + 1) +
            (i === 0 ? '<span class="etiqueta">1ª SAÍDA</span>' : "") + "</td>" +
          '<td class="num">' + esc(it.inicio.slice(-8)) + "</td>" +
          '<td class="num">' + esc(it.final ? it.final.slice(-8) : "—") + "</td>" +
          '<td class="dir">' + hhmmss(it.seg_duracao) + "</td>" +
          '<td class="dir">' + hhmmss(it.seg_movimento) + "</td>" +
          '<td class="dir">' + hhmmss(it.seg_ocioso) + "</td>" +
          '<td class="dir">' + n(it.km, 1) + "</td>" +
          '<td class="trajeto">' + trajeto + "</td></tr>";
      }).join("") + "</tbody></table></div></td></tr>";
  }

  function pintarTabelaDias(itens, rV) {
    var cab = el("tab-dias-cab");
    cab.innerHTML = COL_DIAS.map(function (c) {
      var seta = estado.ordemDias.campo === c.campo
        ? ' <span class="seta">' + (estado.ordemDias.asc ? "▲" : "▼") + "</span>" : "";
      return '<th class="ordenavel' + (c.dir ? " dir" : "") + '" data-campo="' + c.campo +
        '" scope="col">' + esc(c.rot) + seta + "</th>";
    }).join("");
    Array.prototype.forEach.call(cab.querySelectorAll("th"), function (th) {
      th.addEventListener("click", function () {
        var campo = th.getAttribute("data-campo");
        if (estado.ordemDias.campo === campo) estado.ordemDias.asc = !estado.ordemDias.asc;
        else { estado.ordemDias.campo = campo; estado.ordemDias.asc = true; }
        render();
      });
    });

    var campo = estado.ordemDias.campo, dir = estado.ordemDias.asc ? 1 : -1;
    var ord = itens.slice().sort(function (a, b) {
      var va = a[campo], vb = b[campo];
      if (typeof va === "boolean") { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      va = String(va || ""); vb = String(vb || "");
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });

    var corpo = el("tab-dias").tBodies[0];
    if (!ord.length) {
      corpo.innerHTML = '<tr><td colspan="' + COL_DIAS.length + '" class="vazio">' +
        "Nenhum dia no filtro selecionado.</td></tr>";
      el("tab-dias").tFoot.innerHTML = "";
      return;
    }
    corpo.innerHTML = ord.map(function (d) {
      var aberta = !!estado.abertos[d.placa + "|" + d.data];
      var tinta = d.atrasado ? COR.atraso : COR.apagado;
      var tr = '<tr class="clicavel' + (aberta ? " aberta" : "") + '" data-chave="' +
        esc(d.placa + "|" + d.data) + '" tabindex="0">' +
        '<td class="num"><span class="seta-linha">▶</span> ' + esc(d.dataTxt) + "</td>" +
        '<td class="suave">' + esc(d.diaSemana) + "</td>" +
        '<td class="dir" style="font-weight:600">' + esc(d.saidaTxt) + "</td>" +
        '<td class="dir suave">' + esc(estado.entrada) + "</td>" +
        '<td class="dir" style="font-weight:700;color:' + tinta + '">' +
          (d.atrasado ? hhmmss(d.atraso) : "—") + "</td>" +
        '<td><span class="pilula" style="color:' + tinta + '"><i style="background:' +
          (d.atrasado ? COR.atraso : COR.cinza) + '"></i>' + (d.atrasado ? "Com atraso" : "Sem atraso") +
          "</span></td>" +
        '<td class="dir">' + n(d.viagens) + "</td>" +
        '<td class="dir">' + n(d.km, 1) + "</td></tr>";
      return aberta ? tr + linhaViagens(d) : tr;
    }).join("");

    var porChave = {};
    ord.forEach(function (d) { porChave[d.placa + "|" + d.data] = d; });
    Array.prototype.forEach.call(corpo.querySelectorAll("tr.clicavel"), function (tr) {
      var d = porChave[tr.getAttribute("data-chave")];
      tr.addEventListener("click", function () { alternarDia(d); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarDia(d); }
      });
    });

    el("tab-dias").tFoot.innerHTML = "<tr>" +
      '<td colspan="2">' + rV.dias + " dia(s)</td>" +
      '<td class="dir">méd. ' + hhmm(rV.saidaMedia) + "</td>" +
      '<td class="dir">' + esc(estado.entrada) + "</td>" +
      '<td class="dir" style="color:' + COR.atraso + '">' + hhmmss(rV.atraso) + "</td>" +
      "<td>" + rV.atrasados + " com atraso · " + rV.semAtraso + " sem</td>" +
      '<td class="dir">' + n(rV.viagens) + "</td>" +
      '<td class="dir">' + n(rV.km, 1) + "</td></tr>";
  }

  function alternarDia(d) {
    var k = d.placa + "|" + d.data;
    if (estado.abertos[k]) delete estado.abertos[k];
    else estado.abertos[k] = true;
    render();
  }

  /* ======================================================= navegação = */
  function irPara(tela) {
    estado.tela = tela;
    esconderDica();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function abrirVeiculo(placa) {
    estado.placa = placa;
    estado.abertos = {};
    irPara("veiculo");
  }

  /* ====================================================== importação = */
  function pintarImportacoes() {
    var caixa = el("lista-import");
    if (!importacoes.length) {
      caixa.innerHTML = '<p class="vazio">Nenhuma importação neste navegador ainda.<br>' +
        "A base atual vem do banco de dados (Supabase) e do arquivo <b>dados.js</b> " +
        "da pasta, usado como reserva offline.</p>";
      return;
    }
    var estilos = {
      ok: { fundo: "rgba(15,122,53,.10)", tinta: COR.ok, rot: "Importado" },
      igual: { fundo: "rgba(12,16,36,.06)", tinta: "#6b7391", rot: "Sem novidade" },
      erro: { fundo: "rgba(197,44,39,.10)", tinta: COR.atraso, rot: "Recusado" }
    };
    caixa.innerHTML = importacoes.slice(0, 12).map(function (i) {
      var e = estilos[i.estado] || estilos.igual;
      return '<div class="item-import"><div>' +
        '<div class="arq">' + esc(i.arquivo) + "</div>" +
        '<div class="det">' + esc(i.detalhe) + "</div></div>" +
        '<span class="estado" style="background:' + e.fundo + ";color:" + e.tinta + '">' +
        e.rot + "</span></div>";
    }).join("");
  }

  function aviso(titulo, itens, ruim) {
    el("avisos").innerHTML = '<div class="aviso' + (ruim ? " ruim" : "") + '">' +
      '<button class="fechar" type="button" aria-label="Fechar">×</button>' +
      "<h3>" + esc(titulo) + "</h3>" +
      (itens && itens.length
        ? "<ul>" + itens.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>"
        : "") + "</div>";
    var bt = el("avisos").querySelector(".fechar");
    if (bt) bt.addEventListener("click", function () { el("avisos").innerHTML = ""; });
  }

  function ajustarPeriodo(forcar) {
    var dias = montarDias();
    if (!dias.length) return;
    var datas = dias.map(function (d) { return d.data; }).sort();
    var ini = datas[0], fim = datas[datas.length - 1];
    el("f-de").min = el("f-ate").min = ini;
    el("f-de").max = el("f-ate").max = fim;
    if (forcar || !estado.de || estado.de < ini) { estado.de = ini; el("f-de").value = ini; }
    if (forcar || !estado.ate || estado.ate > fim) { estado.ate = fim; el("f-ate").value = fim; }
  }

  function importarArquivos(lista) {
    var arquivos = Array.prototype.slice.call(lista).filter(function (f) {
      return /\.(xlsx|xlsm)$/i.test(f.name);
    });
    var recusados = Array.prototype.slice.call(lista).filter(function (f) {
      return !/\.(xlsx|xlsm)$/i.test(f.name);
    });
    recusados.forEach(function (f) {
      importacoes.unshift({ arquivo: f.name, estado: "erro",
        detalhe: "formato não suportado — salve como .xlsx no Excel" });
    });
    if (!arquivos.length) {
      pintarImportacoes();
      guardar(CHAVE_IMPORT, importacoes.slice(0, 12));
      aviso("Nenhum arquivo compatível", [
        "Envie o relatório <b>Deslocamentos e Paradas</b> em <b>.xlsx</b>. " +
        "Se o arquivo for <b>.xls</b> antigo ou <b>.csv</b>, abra no Excel e salve como <b>.xlsx</b>."
      ], true);
      irPara("importar");
      return;
    }

    var btE = el("bt-escolher"), btX = el("bt-exportar");
    btE.disabled = true; btX.disabled = true;
    var textoOriginal = btE.textContent;
    btE.textContent = "Lendo…";

    var relato = [], totalNovos = 0, houveErro = false;
    var paraEnviarSupabase = [];

    function fim() {
      base.gerado_em = new Date().toLocaleString("pt-BR");
      var salvou = guardar(CHAVE_BASE, {
        deslocamentos: base.deslocamentos, gerado_em: base.gerado_em
      });
      guardar(CHAVE_IMPORT, importacoes.slice(0, 12));
      ajustarPeriodo(true);
      atualizarPlacas();
      render();
      btE.disabled = false; btX.disabled = false;
      btE.textContent = textoOriginal;
      el("gerado").textContent = base.gerado_em;
      if (!salvou) {
        relato.push("não consegui salvar neste navegador — use " +
          "<b>Salvar base (dados.js)</b> para gravar o arquivo na pasta");
      }
      aviso(totalNovos > 0
        ? "Importação concluída — " + totalNovos + " deslocamento(s) novo(s)"
        : "Importação concluída — nada novo (os registros já estavam na base)",
        relato, houveErro);

      if (paraEnviarSupabase.length) {
        enviarParaSupabase(paraEnviarSupabase).then(function (ok) {
          if (!ok) {
            aviso("Aviso: não consegui enviar os dados novos para o banco de dados", [
              "Os dados já estão salvos neste navegador. Verifique a internet e " +
              "importe novamente para sincronizar com o banco de dados (Supabase)."
            ], true);
          }
        });
      }
    }

    function proximo(i) {
      if (i >= arquivos.length) { fim(); return; }
      var f = arquivos[i];
      var fr = new FileReader();
      fr.onload = function () {
        lerXlsx(fr.result).then(function (abas) {
          var res = extrairDeslocamentos(abas, f.name);
          if (!res.registros.length) {
            houveErro = true;
            var msg = res.avisos[0] || "nenhum deslocamento encontrado";
            relato.push("<b>" + esc(f.name) + "</b>: " + msg);
            importacoes.unshift({ arquivo: f.name, estado: "erro", detalhe: msg });
          } else {
            var novos = juntar(res.registros);
            totalNovos += novos;
            paraEnviarSupabase = paraEnviarSupabase.concat(res.registros);
            var placas = {};
            res.registros.forEach(function (r) { placas[r.placa] = true; });
            var datas = res.registros.map(function (r) { return r.data; }).sort();
            var det = res.registros.length + " deslocamentos · " + novos + " novos · " +
              Object.keys(placas).sort().join(", ") + " · " +
              isoParaBr(datas[0]).slice(0, 5) + " a " +
              isoParaBr(datas[datas.length - 1]).slice(0, 5);
            relato.push("<b>" + esc(f.name) + "</b>: " + esc(det));
            importacoes.unshift({ arquivo: f.name, detalhe: det,
              estado: novos > 0 ? "ok" : "igual" });
          }
          proximo(i + 1);
        }).catch(function (e) {
          houveErro = true;
          relato.push("<b>" + esc(f.name) + "</b>: " + esc(e.message));
          importacoes.unshift({ arquivo: f.name, estado: "erro", detalhe: e.message });
          proximo(i + 1);
        });
      };
      fr.onerror = function () {
        houveErro = true;
        relato.push("<b>" + esc(f.name) + "</b>: não consegui ler o arquivo");
        importacoes.unshift({ arquivo: f.name, estado: "erro",
          detalhe: "não consegui ler o arquivo" });
        proximo(i + 1);
      };
      fr.readAsArrayBuffer(f);
    }
    proximo(0);
  }

  function baixar(nome, texto, tipo) {
    var url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    var a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function salvarBase() {
    baixar("dados.js", "window.DADOS = " + JSON.stringify({
      gerado_em: base.gerado_em || new Date().toLocaleString("pt-BR"),
      entrada_padrao: estado.entrada,
      deslocamentos: base.deslocamentos
    }) + ";", "application/javascript;charset=utf-8");
    aviso("Base baixada como dados.js", [
      "Substitua o <code>dados.js</code> da pasta <b>GESTAO SAIDA VEICULOS</b> " +
      "por este arquivo para a base ficar permanente, inclusive em outro computador."
    ]);
  }

  /* exporta a tabela do período filtrado como .xls, com a mesma identidade
     visual (cores, banner, linhas coloridas por atraso) do relatório
     completo — gerado na hora, no navegador, via escritor-planilha.js */
  function exportarPlanilha(linhas, porPlaca, rF) {
    if (!linhas.length) {
      aviso("Nada para exportar", ["Não há dias no filtro selecionado."], true);
      return;
    }
    var datas = linhas.map(function (x) { return x.data; }).sort();
    var periodo = isoParaBr(datas[0]) + " a " + isoParaBr(datas[datas.length - 1]);
    var bytes = gerarRelatorioCompleto({
      linhas: linhas,
      porPlaca: porPlaca,
      rF: rF,
      entrada: estado.entrada,
      corteNoite: corteNoiteSeg(),
      geradoEm: new Date().toLocaleString("pt-BR"),
      periodo: periodo
    });
    baixar("Gestao_Saida_Veiculos.xlsx", bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    aviso("Relatório exportado — Gestao_Saida_Veiculos.xlsx", [
      "5 abas (Resumo Executivo, Saída de Veículos, Consolidado por placa, Por dia da " +
      "semana e Indicadores), já com o período e os filtros que estavam na tela."
    ]);
  }

  /* ======================================================== atualizar = */
  function atualizarPlacas() {
    var placas = {};
    montarDias().forEach(function (d) { placas[d.placa] = true; });
    var lista = Object.keys(placas).sort();
    var sel = el("f-placa");
    sel.innerHTML = lista.map(function (p) {
      return '<option value="' + esc(p) + '">' + esc(p) + "</option>";
    }).join("");
    if (!lista.length) sel.innerHTML = '<option value="">—</option>';
  }

  function render() {
    var antesFlip = medirFlip();

    var todos = montarDias();
    var linhas = filtrar(todos);
    var rF = resumo(linhas);
    var porPlaca = agruparPorPlaca(linhas);
    var ent = horaEmSeg(estado.entrada);
    var fx = faixa();
    var corte = corteNoiteSeg();
    var ignoradosNoite = corte != null
      ? filtrar(todos, { ignorarCorteNoite: true }).length - linhas.length : 0;

    // cabeçalho e resumo dos filtros
    if (linhas.length) {
      var datas = linhas.map(function (d) { return d.data; }).sort();
      el("periodo-base").textContent =
        isoParaBr(datas[0]) + " a " + isoParaBr(datas[datas.length - 1]);
    } else {
      el("periodo-base").textContent = "—";
    }
    var rotVeiculos = porPlaca.length === 1 ? " veículo" : " veículos";
    el("total-veiculos").textContent = porPlaca.length + rotVeiculos;
    el("resumo-filtro").textContent = n(rF.dias) + " dias · " + porPlaca.length +
      rotVeiculos + " · entrada " + estado.entrada +
      (fx ? " · saídas entre " + hhmm(fx.min) + " e " + hhmm(fx.max) : "") +
      (corte != null ? " · " + n(ignoradosNoite) + " dia(s) noturno(s) fora da conta" : "");
    el("nota-faixa").textContent = fx
      ? "mostrando só os dias em que a 1ª saída caiu entre " + hhmmss(fx.min) +
        " e " + hhmmss(fx.max)
      : "sem faixa — todos os horários de primeira saída entram na conta";
    el("nota-noite").textContent = corte != null
      ? n(ignoradosNoite) + " dia(s) com saída às " + hhmm(corte) +
        " ou depois, fora da conta"
      : "desativado — toda saída entra na conta, mesmo à noite";
    el("bt-corte-noite").textContent = corte != null ? "desativar" : "ativar";
    el("leg-entrada").textContent = estado.entrada;

    // abas — troca com um fade, sempre que a tela vira a ativa
    ["frota", "veiculo", "importar"].forEach(function (t) {
      var bt = el("aba-" + t), tela = el("tela-" + t);
      var ativa = estado.tela === t;
      if (ativa) bt.setAttribute("aria-current", "page");
      else bt.removeAttribute("aria-current");
      if (ativa) {
        tela.classList.remove("oculto");
        if (tela.getAttribute("data-visivel") !== "1") {
          tela.classList.remove("tela-mostrar");
          void tela.offsetWidth;
          requestAnimationFrame(function () { tela.classList.add("tela-mostrar"); });
          tela.setAttribute("data-visivel", "1");
        }
      } else {
        tela.classList.add("oculto");
        tela.classList.remove("tela-mostrar");
        tela.removeAttribute("data-visivel");
      }
    });
    el("painel-filtros").classList.toggle("oculto", estado.tela === "importar");

    if (estado.tela === "frota") {
      pintarKpis("kpis-frota", [
        { rot: "Horas de atraso", bruto: rF.atraso, tipo: "hhmmss", cor: COR.atraso, tinta: COR.atraso,
          icone: "alerta",
          nota: rF.atrasados + " de " + rF.dias + " dias com saída após as " + estado.entrada },
        { rot: "Aderência ao horário", bruto: rF.aderencia, tipo: "pct1", un: "%", cor: COR.marca,
          icone: "alvo",
          nota: rF.semAtraso + " dias sem atraso" },
        { rot: "Atraso médio", bruto: rF.medio, tipo: "hhmmss", cor: COR.marcaVermelho,
          icone: "ampulheta",
          nota: "média dos dias que atrasaram" },
        { rot: "Maior atraso", bruto: rF.maior, tipo: "hhmmss", cor: COR.atraso,
          icone: "relogio",
          nota: rF.maiorDia
            ? rF.maiorDia.dataTxt + " · " + rF.maiorDia.placa + " · saiu " + rF.maiorDia.saidaTxt
            : "nenhum atraso no período" },
        { rot: "1º horário médio", bruto: rF.saidaMedia, tipo: "hhmm", cor: COR.azul,
          icone: "sol",
          nota: "entrada do motorista às " + estado.entrada },
        { rot: "Dias com saída", bruto: rF.dias, tipo: "int", cor: COR.cinza,
          icone: "calendario",
          nota: n(rF.viagens) + " viagens · " + n(rF.km, 0) + " km" }
      ]);
      pintarRanking(porPlaca);
      pintarDiaADia(linhas);
      pintarAderencia(porPlaca);
      pintarAlertas(linhas);
      pintarTabelaFrota(porPlaca, rF);
    }

    if (estado.tela === "veiculo") {
      var placas = porPlaca.map(function (p) { return p.placa; });
      var ativa = placas.indexOf(estado.placa) >= 0 ? estado.placa
        : (porPlaca.slice().sort(function (a, b) { return b.atraso - a.atraso; })[0] || {}).placa;
      estado.placa = ativa || null;
      var pv = porPlaca.filter(function (p) { return p.placa === ativa; })[0];

      if (el("f-placa").value !== (ativa || "")) el("f-placa").value = ativa || "";

      el("chips-placa").innerHTML = placas.map(function (p) {
        return '<button type="button" data-placa="' + esc(p) + '"' +
          (p === ativa ? ' aria-current="true"' : "") + ">" + esc(p) + "</button>";
      }).join("");
      Array.prototype.forEach.call(el("chips-placa").querySelectorAll("button"), function (bt) {
        bt.addEventListener("click", function () {
          abrirVeiculo(bt.getAttribute("data-placa"));
        });
      });

      if (!pv) {
        el("v-placa").textContent = "—";
        el("v-motorista").textContent = "Nenhum veículo no filtro";
        el("v-subtitulo").textContent = "ajuste os filtros do painel";
        pintarKpis("kpis-veiculo", []);
        pintarTimeline([], ent);
        pintarFaixas([], ent);
        el("comparacao").innerHTML = "";
        pintarTabelaDias([], resumo([]));
      } else {
        var itens = pv.itens.slice().sort(function (a, b) {
          return a.data < b.data ? -1 : 1;
        });
        el("v-placa").textContent = pv.placa;
        el("v-motorista").textContent = pv.motorista || "Motorista não identificado no relatório";
        el("v-subtitulo").textContent = n(pv.dias) + " dias com saída · " +
          n(pv.viagens) + " viagens · " + n(pv.km, 0) + " km no período filtrado";

        pintarKpis("kpis-veiculo", [
          { rot: "Horas de atraso", bruto: pv.atraso, tipo: "hhmmss", cor: COR.atraso, tinta: COR.atraso,
            icone: "alerta",
            nota: pv.atrasados + " de " + pv.dias + " dias com atraso" },
          { rot: "Aderência", bruto: pv.aderencia, tipo: "pct1", un: "%", cor: COR.marca,
            icone: "alvo",
            nota: pv.semAtraso + " dias no horário ou antes" },
          { rot: "Atraso médio", bruto: pv.medio, tipo: "hhmmss", cor: COR.marcaVermelho,
            icone: "ampulheta",
            nota: "nos dias em que atrasou" },
          { rot: "Maior atraso", bruto: pv.maior, tipo: "hhmmss", cor: COR.atraso,
            icone: "relogio",
            nota: pv.maiorDia ? pv.maiorDia.dataTxt + " · saiu " + pv.maiorDia.saidaTxt
                              : "nenhum atraso" },
          { rot: "1º horário médio", bruto: pv.saidaMedia, tipo: "hhmm", cor: COR.azul,
            icone: "sol",
            nota: "entrada às " + estado.entrada }
        ]);
        pintarTimeline(itens, ent);
        pintarFaixas(itens, ent);
        pintarComparacao(pv, rF, ent);
        pintarTabelaDias(itens, pv);
      }
    }

    if (estado.tela === "importar") pintarImportacoes();

    el("bt-exportar").onclick = function () { exportarPlanilha(linhas, porPlaca, rF); };

    animarFlip(antesFlip);
  }

  /* ============================================================ início */
  function iniciar() {
    el("logo").addEventListener("error", function () {
      this.style.display = "none";
      el("marca-texto").style.display = "block";
    });

    var doArquivo = window.DADOS || {};
    base.deslocamentos = normalizarRegistros(doArquivo.deslocamentos);
    base.gerado_em = doArquivo.gerado_em || "";
    estado.entrada = doArquivo.entrada_padrao || "06:30";
    PADRAO.entrada = estado.entrada;

    var salva = recuperar(CHAVE_BASE);
    if (salva && salva.deslocamentos && salva.deslocamentos.length) {
      if (juntar(salva.deslocamentos)) base.gerado_em = salva.gerado_em || base.gerado_em;
    }
    var imp = recuperar(CHAVE_IMPORT);
    if (imp && imp.length) importacoes = imp;
    // limpa chaves de versões anteriores
    try { localStorage.removeItem("lube.saidaveiculos.entradas"); } catch (e) {}

    aplicarTema(recuperar(CHAVE_TEMA) === "escuro" ? "escuro" : "claro");
    el("bt-tema").addEventListener("click", function () {
      aplicarTema(document.documentElement.getAttribute("data-tema") === "escuro" ? "claro" : "escuro");
    });

    el("gerado").textContent = base.gerado_em || "—";
    el("f-entrada").value = estado.entrada;
    el("f-corte-noite").value = estado.corteNoite;

    // filtros
    el("f-de").addEventListener("change", function () { estado.de = this.value; render(); });
    el("f-ate").addEventListener("change", function () { estado.ate = this.value; render(); });
    el("f-dias").addEventListener("change", function () { estado.dias = this.value; render(); });
    el("f-situacao").addEventListener("change", function () { estado.situacao = this.value; render(); });
    el("f-entrada").addEventListener("change", function () {
      estado.entrada = this.value || "06:30"; render();
    });
    el("f-hmin").addEventListener("change", function () { estado.hmin = this.value; render(); });
    el("f-hmax").addEventListener("change", function () { estado.hmax = this.value; render(); });
    el("bt-limpa-faixa").addEventListener("click", function () {
      estado.hmin = ""; estado.hmax = "";
      el("f-hmin").value = ""; el("f-hmax").value = "";
      render();
    });
    el("f-corte-noite").addEventListener("change", function () {
      estado.corteNoite = this.value; render();
    });
    el("bt-corte-noite").addEventListener("click", function () {
      if (estado.corteNoite) {
        ultimoCorteNoite = estado.corteNoite;
        estado.corteNoite = "";
      } else {
        estado.corteNoite = ultimoCorteNoite || CORTE_NOITE_PADRAO;
      }
      el("f-corte-noite").value = estado.corteNoite;
      render();
    });
    el("f-placa").addEventListener("change", function () {
      if (this.value) abrirVeiculo(this.value);
    });
    el("bt-restaurar").addEventListener("click", function () {
      estado.entrada = PADRAO.entrada;
      estado.dias = "todos"; estado.situacao = "todas";
      estado.hmin = ""; estado.hmax = "";
      estado.corteNoite = CORTE_NOITE_PADRAO;
      el("f-entrada").value = estado.entrada;
      el("f-dias").value = "todos"; el("f-situacao").value = "todas";
      el("f-hmin").value = ""; el("f-hmax").value = "";
      el("f-corte-noite").value = estado.corteNoite;
      ajustarPeriodo(true);
      render();
    });

    // abas
    el("aba-frota").addEventListener("click", function () { irPara("frota"); });
    el("aba-veiculo").addEventListener("click", function () { irPara("veiculo"); });
    el("aba-importar").addEventListener("click", function () { irPara("importar"); });

    // importação
    el("bt-escolher").addEventListener("click", function () { el("arquivo").click(); });
    el("arquivo").addEventListener("change", function () {
      if (this.files && this.files.length) importarArquivos(this.files);
      this.value = "";
    });
    el("bt-salvar").addEventListener("click", salvarBase);
    el("bt-limpar").addEventListener("click", function () {
      if (!confirm("Remover tudo o que foi importado neste navegador e voltar " +
                   "para a base do arquivo dados.js?")) return;
      try { localStorage.removeItem(CHAVE_BASE); } catch (e) {}
      try { localStorage.removeItem(CHAVE_IMPORT); } catch (e) {}
      var d = window.DADOS || {};
      base.deslocamentos = normalizarRegistros(d.deslocamentos);
      base.gerado_em = d.gerado_em || "";
      importacoes = [];
      estado.placa = null; estado.abertos = {};
      el("gerado").textContent = base.gerado_em || "—";
      ajustarPeriodo(true);
      atualizarPlacas();
      render();
      aviso("Importações removidas", [
        "A base voltou ao conteúdo do arquivo <code>dados.js</code>."]);
    });

    // arrastar e soltar
    var cortina = el("cortina"), prof = 0;
    window.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer || e.dataTransfer.types.indexOf("Files") < 0) return;
      prof++; cortina.classList.add("on");
    });
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("dragleave", function () {
      prof = Math.max(0, prof - 1);
      if (!prof) cortina.classList.remove("on");
    });
    window.addEventListener("drop", function (e) {
      e.preventDefault();
      prof = 0; cortina.classList.remove("on");
      if (e.dataTransfer && e.dataTransfer.files.length) {
        importarArquivos(e.dataTransfer.files);
      }
    });

    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t); t = setTimeout(render, 150);
    });

    if (!base.deslocamentos.length) {
      estado.tela = "importar";
      atualizarPlacas();
      render();
      aviso("Nenhum dado carregado ainda", [
        "Clique em <b>Escolher arquivos</b> e envie os relatórios de " +
        "Deslocamentos e Paradas (.xlsx) das placas — ou arraste os arquivos " +
        "para esta tela."]);
    } else {
      ajustarPeriodo(true);
      atualizarPlacas();
      render();
    }

    /* depois do primeiro desenho (com o que já tinha localmente), busca o
       que estiver no banco de dados e só re-renderiza se vier algo novo —
       assim quem abre o painel sem internet não fica esperando */
    atualizarEstadoNuvem(null);
    buscarDoSupabase().then(function (r) {
      atualizarEstadoNuvem(r);
      if (!r.novos) return;
      base.gerado_em = new Date().toLocaleString("pt-BR");
      guardar(CHAVE_BASE, { deslocamentos: base.deslocamentos, gerado_em: base.gerado_em });
      el("gerado").textContent = base.gerado_em;
      estado.tela = estado.tela === "importar" ? "frota" : estado.tela;
      ajustarPeriodo(true);
      atualizarPlacas();
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else { iniciar(); }
})();
