# Gestão de Saída de Veículos — Lube Distribuidora / Araujo

BI que mede as **horas de atraso** na saída dos veículos: compara o **primeiro
horário de saída de cada dia** com o **horário de entrada do motorista (06:30)**.

Segue o layout definido na imagem de referência do projeto:

| coluna 1 | coluna 2 | coluna 3 | coluna 4 | coluna 5 |
|---|---|---|---|---|
| data | placa do veículo | primeiro horário de cada dia | horário entrada motorista 6:30 | horas de atraso |

O visual segue o arquivo de design do projeto (`design do sistema - gestão de
saida de veiculo.html`): cartões em degradê, tabelas com trilhos coloridos,
tipografia Barlow/Source Sans 3 e a paleta azul/vermelho da Lube.

## Arquivos

| Arquivo | O que é |
|---|---|
| `Gestao de Saida de Veiculos.html` | Dashboard — abre com duplo clique, sem servidor |
| `estilo.css` | Todo o visual (cores, cartões, tabelas, gráficos) — fontes Barlow/Source Sans 3 embutidas via `FONTES/` |
| `painel.js` | Toda a lógica: leitura da base, filtros, gráficos, tabelas, importação |
| `leitor-xlsx.js` | Leitor de `.xlsx` (ZIP + XML nativos do navegador, sem internet) |
| `escritor-planilha.js` | Gera o relatório de 5 abas do botão "Exportar planilha", já com as cores da Lube |
| `FONTES/` | Arquivos `.woff2` das fontes do design, extraídos do bundle original |
| `dados.js` / `dados.json` | Base consolidada (o `.js` é o que o dashboard lê) |
| `processar.py` | Alternativa em lote: lê a pasta `PLANILHAS REFERENCIAS` e regera a base |
| `Gestao_Saida_Veiculos.xlsx` | Relatório Excel completo — 5 abas, com identidade visual da Lube (ver seção própria) |
| `IMAGENS/logo-lube.png` | Logo usada no cabeçalho (reduzida da `logo maior.png`) |
| `design do sistema - gestão de saida de veiculo.html` | Referência de design original (não precisa abrir — é só a fonte do estilo) |
| `supabase-config.js` | Endereço e chave pública do banco de dados (ver seção própria) |

## O indicador: só atraso

- **1º horário do dia** = menor `Hora início` entre os deslocamentos daquele
  veículo naquela data. Só eventos de deslocamento (`D`) contam como saída;
  paradas (`P`) são ignoradas.
- **Horas de atraso** = `1º horário − entrada do motorista`, quando o veículo
  sai **depois** da entrada. Se sair no horário ou antes, o atraso é **zero**.
- **Situação** = `Com atraso` ou `Sem atraso`.
- **Aderência** = % de dias sem atraso.
- **Sem tolerância: 06:30 é 06:30.** A comparação é exata, **ao segundo** — uma
  saída às 06:30:20 é atraso de **20 segundos**. Por isso todos os valores
  aparecem em `HH:MM:SS`.

Não há nenhuma medição de antecipação / horas excedentes: quem sai antes das
06:30 simplesmente entra na conta como dia **sem atraso**.

## Filtros

Uma única linha de filtros, no topo, valendo para a tela de frota e a de
veículo:

| Filtro | O que faz |
|---|---|
| **Data inicial / Data final** | recorta o período |
| **Entrada do motorista** | a referência do cálculo — uma só para toda a frota (padrão 06:30) |
| **Ignorar saída após** | dias com a 1ª saída à noite (padrão 18:00) saem da conta inteira — ver abaixo |
| **Dias** | todos, só dias úteis, ou só fim de semana |
| **Situação** | todas, só com atraso, ou só sem atraso |
| **Faixa de horários de saída** | `das` / `às`: só entram na conta os dias cujo **primeiro horário de saída** cai dentro da faixa |
| **Veículo** | atalho para abrir uma placa direto na tela de veículo |

A **faixa de horário** recorta os dados pelo horário real de saída. Exemplos:

- `das 08:00` (sem `às`) → só os dias que saíram das 08:00 em diante
- `das 00:00 às 06:30` → só os dias que saíram no horário ou antes
- **limpar** remove a faixa

Se você inverter `das`/`às` por engano, a faixa é normalizada em vez de zerar a
tela. **Restaurar padrão** (no cabeçalho do painel de filtros) limpa todos os
filtros de uma vez, exceto o período.

### Horário de entrada

**06:30 para todos os veículos**, um único horário — não há horário por
veículo. Pode ser alterado no campo **Entrada do motorista** da linha de
filtros, e vale tanto para a frota quanto para a tela de um veículo aberto.

No `processar.py` o mesmo parâmetro fica no topo do arquivo:

```python
ENTRADA_PADRAO = "06:30"
```

### Saída noturna não conta (padrão: 18:00 em diante)

Um veículo que só se movimenta à noite (por exemplo, um trecho avulso às 18h)
não é a rotina da manhã, e um único dia assim é suficiente pra distorcer o
indicador inteiro. Por isso, **por padrão, dias cuja 1ª saída for às 18:00 ou
depois saem completamente da conta** — não entram em "dias com saída", não
contam atraso, não aparecem em nenhuma tabela ou gráfico.

- O campo **Ignorar saída após**, na linha de filtros, mostra e ajusta esse
  horário de corte. A nota ao lado diz quantos dias foram tirados da conta.
- Botão **desativar / ativar**: desliga a regra (todo horário passa a contar,
  mesmo de madrugada ou à noite) e liga de volta lembrando o último valor.
- **Restaurar padrão** sempre volta o corte para 18:00.
- Os dias ignorados continuam na planilha de origem — a regra só decide o que
  entra no cálculo do indicador, nada é apagado.

No `processar.py` o mesmo corte fica no topo do arquivo (afeta a aba
"Saída de Veículos" do Excel):

```python
CORTE_NOITE = "18:00:00"   # "" desativa a regra
```

## Dois jeitos de carregar planilhas

**1. Pelo dashboard (o normal).** Aba **Importar** no cabeçalho — aceita
**vários arquivos e várias placas de uma vez**, e também arrastar e soltar em
qualquer ponto da tela. O arquivo é lido no próprio navegador; nada é enviado
para fora.

- Registros repetidos são ignorados: reimportar o mesmo relatório não duplica
  nada (a chave é placa + hora de início + hora final).
- O que você importa fica salvo **neste navegador**. Para deixar permanente e
  levar para outra máquina, clique em **Salvar base (dados.js)**: baixa um
  `dados.js` que você substitui nesta pasta.
- **Limpar importações** descarta o que está salvo no navegador e volta para o
  conteúdo do `dados.js` da pasta.
- Formato aceito: **`.xlsx`** (e `.xlsm`). Se o relatório vier como `.xls`
  antigo ou `.csv`, abra no Excel e salve como `.xlsx`.
- **Últimas importações**, na mesma aba, mostra o histórico de arquivos
  importados neste navegador, com o resultado de cada um.

**2. Em lote pelo Python.** Coloque os `.xlsx` na pasta `PLANILHAS REFERENCIAS`
e rode:

```
python processar.py
```

Ele regera `dados.js`, `dados.json` e o Excel. Útil para carregar um lote grande
de uma vez ou para gerar o Excel.

Os dois caminhos identificam as colunas pelo **nome do cabeçalho**, então
continuam funcionando se o Getrak mudar a ordem das colunas. A placa vem da
coluna `Placa` e, se ela estiver vazia, do cabeçalho `Placa / Apelido` do
relatório.

## Como navegar

Três abas no cabeçalho — **Frota**, **Veículo** e **Importar**:

**Frota** (inicial):

- Indicadores do período filtrado: horas de atraso, aderência, atraso médio,
  maior atraso, 1º horário médio e dias com saída.
- **Horas de atraso por veículo** — barras ordenadas (vermelho quando o
  veículo concentra a maior parte do atraso); clicar numa barra abre o
  veículo. Some quando há só um veículo.
- **Atraso da frota dia a dia** — barras por data, somando o atraso de todos
  os veículos; mostra o pior dia do período (com um contorno vermelho na
  barra). **Clique numa barra** (ou na coluna em volta dela) para recortar o
  período pra só aquele dia — os indicadores e as tabelas atualizam na hora.
- **Saídas atrasadas por veículo** e **Piores casos do período** (os 5 dias
  com maior atraso) lado a lado. A barra mostra o **percentual de dias em que
  o veículo saiu depois da entrada do motorista** — quanto maior a barra, pior
  (não é a aderência ao contrário: é o próprio atraso em %).
- **Consolidado por veículo** — uma linha por placa, ordenável por qualquer
  coluna. Clique na linha para abrir.

**Veículo:**

- Cabeçalho com a placa, o motorista (quando identificado) e chips para trocar
  rápido de veículo.
- Indicadores só daquele veículo (a entrada é a mesma da frota, salvo se
  alterada no filtro).
- **Primeira saída de cada dia × entrada do motorista** — o traço vermelho
  mede o atraso, da entrada até a hora real da saída. Dias sem atraso aparecem
  como ponto cinza, sem traço.
- **Distribuição da primeira saída** — em que hora do dia caiu a primeira
  saída.
- **Comparação com a frota** — como o veículo se posiciona nos indicadores
  frente à média da frota, com marcador da posição da frota em cada barra.
- **Detalhamento por data** — a tabela da imagem de referência. Clique numa
  data para abrir as viagens daquele dia: hora de início e fim, duração,
  tempo em movimento, tempo ocioso, KM e o trajeto (origem → destino), com a
  primeira saída marcada.

**Importar:** área de arrastar e soltar, histórico de importações e a
explicação do cálculo do indicador.

**Exportar planilha**, no cabeçalho, baixa um `Gestao_Saida_Veiculos.xlsx` de
verdade — o mesmo relatório de 5 abas descrito na próxima seção, gerado na
hora, no navegador, sem bibliotecas (`escritor-planilha.js` monta o ZIP e o
XML do formato .xlsx na mão, mesmo princípio do leitor de `.xlsx`), já com o
período e os filtros que estiverem na tela naquele momento. Por ser um
`.xlsx` real, abre direto no Excel sem nenhum aviso de formato. A única
diferença para o relatório gerado pelo `processar.py` é a logo: embuti-la
exige gravar uma imagem dentro do `.xlsx`, o que não valia a complexidade
extra só para esse detalhe — o resto (banner, cores, barras de dados,
autofiltro, painel congelado) é idêntico.

## O relatório Excel (`Gestao_Saida_Veiculos.xlsx`)

Cinco abas, com a identidade visual da Lube (azul/vermelho da marca) e
prontas pra imprimir ou mandar por e-mail — cada aba sai numa folha só
(paisagem, ajustada à largura). Pode vir do botão **Exportar planilha** do
próprio painel (reflete o filtro atual da tela) ou do `processar.py`, que
roda em lote sobre a pasta `PLANILHAS REFERENCIAS` e ainda inclui a logo no
cabeçalho da capa:

1. **Resumo Executivo** — a folha de rosto. Logo, período e total de veículos
   no topo; 5 indicadores em destaque (horas de atraso, aderência, atraso
   médio, maior atraso, dias analisados); **ranking de atraso por veículo**
   com barra de dados embutida na própria célula; **piores 5 dias do
   período** (cruzando todos os veículos); e um rodapé lembrando as regras
   (sem tolerância, corte de saída noturna, autofiltro em todas as abas).
2. **Saída de Veículos** — a tabela dia a dia (a mesma da imagem de
   referência do projeto), com a linha inteira tingida de vermelho claro
   (atraso) ou verde claro (sem atraso) e os horários como horário de
   verdade do Excel (não texto) — dá pra somar, comparar e ordenar por hora.
3. **Consolidado por placa** — uma linha por veículo, incluindo agora
   **% de saídas atrasadas** ao lado da aderência, com barra de dados na
   coluna de horas de atraso.
4. **Por dia da semana** — NOVO: quanto cada dia da semana pesa no atraso.
   Revela padrões que nenhuma outra aba mostra sozinha — por exemplo, no
   período de referência a sexta-feira concentra mais horas de atraso no
   total do que qualquer outro dia, mesmo a quarta tendo o maior percentual
   de saídas atrasadas.
5. **Indicadores** — as regras do cálculo (entrada, tolerância, corte
   noturno) e o glossário completo de números do período.

Toda aba com uma tabela (1, 2, 3 e 4) já sai com **autofiltro ligado no
cabeçalho e a primeira linha congelada** — é só abrir e aplicar os próprios
filtros, sem precisar configurar nada. As durações usam o formato de horas
elapsed do Excel (`[h]:mm:ss`), que não trava em 24h — um total de 51:42:51
aparece certo, não como "3:42:51" de outro dia.

A logo entra via Pillow (já incluído); se a máquina que rodar o
`processar.py` não tiver essa biblioteca, a planilha sai igual, só sem a
imagem no cabeçalho — nada trava por causa disso.

## Banco de dados (Supabase)

Os dados também ficam num banco de dados na nuvem (Supabase), pra não
dependerem só do navegador de quem importou. O painel continua funcionando
100% offline (abre com duplo clique, sem servidor) — o banco é um reforço,
não uma dependência:

- **Ao abrir o painel**, ele já mostra a base local na hora (arquivo
  `dados.js` + o que estiver salvo no navegador) e, em paralelo, busca no
  banco os deslocamentos gravados por qualquer computador. Se vier algo
  novo, o painel se atualiza sozinho — sem precisar recarregar a página.
- **Ao importar uma planilha** na aba "Importar", o que for novo é enviado
  pro banco automaticamente, além de salvo no navegador de quem importou.
  Se a internet cair no meio, a importação continua valendo localmente e um
  aviso avisa que a sincronização com o banco não deu certo.
- **Só é possível ler e acrescentar, nunca alterar ou apagar.** As regras
  de segurança do banco (RLS) não permitem `UPDATE`/`DELETE` pela chave
  pública do site — só o cadastro de novos deslocamentos.
- `supabase-config.js` guarda o endereço do projeto e a chave pública
  (`anon`/`publishable`) — não é segredo, é a chave feita pra ficar no
  navegador; as regras de segurança do banco são o que de fato protege os
  dados.
- Projeto Supabase: `ubfxhnricinclxkbvkzw` (tabelas `veiculos` e
  `deslocamentos`, schema `public`).

## Interatividade e animações

O painel inteiro reage a cada filtro, em vez de só trocar o número na cara:

- **Os números dos cartões contam**, não pulam. Mudou o filtro? "Horas de
  atraso" sobe ou desce contando até o valor novo (e o cartão pisca uma vez
  pra deixar claro que o filtro surtiu efeito).
- **Toda barra do painel** — ranking por veículo, aderência, o gráfico dia a
  dia, distribuição por faixa, a linha do tempo do veículo, comparação com a
  frota — anima suavemente de um tamanho pro outro quando os dados mudam, em
  vez de simplesmente trocar de lugar.
- **Trocar de aba** (Frota / Veículo / Importar) entra com uma transição leve,
  em vez de aparecer seco.
- **Clique no gráfico "Atraso da frota dia a dia"** recorta o período pra
  aquele dia (ver acima) — o gráfico deixou de ser só decorativo.
- Todo elemento clicável (linha de tabela, botão, aba, chip de veículo) tem
  feedback visual ao passar o mouse e ao clicar.

## Identidade visual

Azul `#0E176C` e vermelho `#F90A19`, extraídos da logo da Lube. Para os
gráficos, que precisam de mais variação do que essas duas cores permitem:

- **Atraso**: vermelho `#c52c27`
- **Contagens / neutro**: azul `#2a3ba8`
- **Sem atraso**: cinza `#8b95b0`
- **Bom** (aderência alta): verde `#0f7a35`

O gráfico "Atraso da frota dia a dia" usa cor sólida com um leve brilho
vertical (a mesma linguagem das barras de ranking e aderência), em vez do
gradiente colorido das primeiras versões — mais limpo e alinhado ao resto do
painel. O dia com maior atraso ganha um contorno vermelho fino; dias sem
atraso viram uma barra quase invisível, sem número boiando por cima pra não
poluir o gráfico. A área clicável de cada dia é a coluna inteira, não só o
desenho da barra, então um dia sem atraso continua fácil de apontar e clicar.

A aderência por veículo usa verde a partir de 80%, azul de 55% a 80%, e
vermelho abaixo disso. O ranking de atraso pinta de vermelho os veículos que
concentram 60% ou mais do maior atraso da frota. É um design só claro — sem
alternância de tema.

## Leitura do período 13/08/2026 a 09/09/2026 (TOH8G66)

Com a regra padrão (ignora saída às 18:00 ou depois):

- 18 dias com saída válidos (13/08 caiu fora — o veículo só se moveu às
  18:23:27 naquele dia, um trecho isolado à noite).
- **Horas de atraso: 20:23:31** em 9 dias — atraso médio de 2h16, aderência
  50,0%.
- **Maior atraso: 09:07:49**, em 14/08 (saiu às 15:37:49 — à tarde, não à
  noite, por isso continua contando).
- O atraso **não é distribuído**: 11 dos 18 dias têm a primeira saída entre 06h
  e 07h. O grosso do total vem de poucos dias fora da curva — 14/08
  (09:07:49), 03/09 (03:50:40), 27/08 (02:25:24), 08/09 (02:04:28) e 21/08
  (02:02:30) já somam 19:30:51, 96% do total.
- 1º horário médio 07:32, puxado por esses mesmos dias.

Sem a regra (todas as saídas contando, inclusive a noturna): 19 dias, horas de
atraso **32:16:58**, maior atraso **11:53:27** (o próprio 13/08). Desative
**Ignorar saída após** no painel de filtros pra ver esses números.

## Observações sobre a base

- Coluna `Motorista` vem vazia em todos os registros deste relatório (o
  Getrak ainda não identifica o motorista). Enquanto isso, a tela de veículo
  mostra "Motorista não identificado no relatório" e a análise fica por
  placa — assim que o Getrak passar a informar o motorista, o nome aparece
  automaticamente.
- A soma dos KM dos trechos (**2.518,6 km**, com todos os dias) fica abaixo do
  hodômetro do período (1.480 → 4.986 = **3.506 km**) e do total do próprio
  cabeçalho do relatório (3.466 km): cerca de **987 km** de movimentação não
  aparece na lista de deslocamentos exportada. Portanto a coluna KM deste BI é
  "KM dos trechos registrados", **não** a quilometragem total da frota.
- 14/08 tem um único deslocamento no dia, começando às 15:37 (à tarde — por
  isso a regra padrão não o exclui, mesmo sendo o dia que mais pesa no
  indicador agora). Vale confirmar se foi manutenção, viagem específica ou
  falha de rastreamento.
